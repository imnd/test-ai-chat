<template>
  <form class="controls" @submit.prevent="send()">
    <textarea
        class="prompt"
        ref="inputRef"
        v-model="inputText"
        @keydown.escape.prevent="stop()"
        @keydown.enter.exact.prevent="send()"
        placeholder="Напишите сообщение — и модель ответит."
        aria-label="Сообщение"
    />
    <button type="submit">Отправить</button>
    <button type="button" @click="stop()" :disabled="!streaming">Стоп</button>
  </form>
</template>

<script setup>
import {ref, onMounted} from 'vue';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const props = defineProps({
  messages: {
    type: Array,
    required: true
  }
});

const streaming = defineModel('streaming', {
  type: Boolean,
  default: false
});

const error = defineModel('error', {
  type: String,
  default: ''
});

const inputText = defineModel({
  type: String,
  default: ''
});

const emit = defineEmits(['send', 'stop']);

const inputRef = ref(null);
let evtSource = null;

function append(role, content) {
  props.messages.push({role, content});
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function extractDeltaText(rawChunk) {
  if (!rawChunk) return '';
  if (typeof rawChunk === 'object') {
    return rawChunk.choices?.[0]?.delta?.content || '';
  }
  if (typeof rawChunk !== 'string') return '';

  const lines = rawChunk.split('\n');
  let result = '';
  let isSSE = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Игнорируем SSE комментарии (например, ": OPENROUTER PROCESSING")
    if (trimmed.startsWith(':')) {
      isSSE = true;
      continue;
    }

    if (trimmed === 'data: [DONE]') {
      isSSE = true;
      continue;
    }

    if (trimmed.startsWith('data:')) {
      isSSE = true;
      const dataStr = trimmed.slice(5).trim();
      try {
        const json = JSON.parse(dataStr);
        const delta = json.choices?.[0]?.delta;
        if (delta && typeof delta.content === 'string') {
          result += delta.content;
        }
      } catch (_) {
        result += dataStr;
      }
    }
  }

  // Если это обычный текст, а не SSE
  if (!isSSE && !result) {
    return rawChunk;
  }

  return result;
}

function EventSourcePolyfill(url, payload) {
  const controller = new AbortController();
  const es = {
    onmessage: null,
    onerror: null,
    onopen: null,
    _events: {}
  };

  es.on = function (name, fn) {
    es._events[name] = fn;
  };

  fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
    signal: controller.signal
  })
      .then(async (resp) => {
        if (!resp.ok) {
          let errorMsg = 'Ошибка сервера ' + resp.status;
          try {
            const body = await resp.json();
            errorMsg = body.error?.message || body.error || errorMsg;
          } catch (_) {
            try {
              errorMsg = await resp.text();
            } catch (_) {}
          }
          throw new Error(errorMsg);
        }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        es.onopen && es.onopen();

        function read() {
          reader
              .read()
              .then(({done, value}) => {
                if (done) {
                  es._events['done'] && es._events['done']();
                  return;
                }
                buf += decoder.decode(value, {stream: true});
                const parts = buf.split('\n\n');
                buf = parts.pop();
                for (const p of parts) {
                  if (p.startsWith('event:')) {
                    const ev = p.split('\n')[0].slice(6).trim();
                    const dline = p.split('\n').slice(1).join('\n');
                    const data = dline.replace(/^data:\s*/, '');
                    if (ev === 'done') es._events['done'] && es._events['done']();
                    else if (es['on' + ev]) es['on' + ev](data);
                    continue;
                  }
                  const m = p.replace(/^data:\s*/, '');
                  es.onmessage && es.onmessage({data: m});
                }
                read();
              })
              .catch((err) => {
                es.onerror && es.onerror(err);
              });
        }

        read();
      })
      .catch((err) => {
        es.onerror && es.onerror(err);
      });

  es.close = () => controller.abort();
  return es;
}

async function send() {
  if (!inputText.value || !inputText.value.trim()) return;
  const userMsg = inputText.value.trim();
  append('user', userMsg);
  inputText.value = '';
  error.value = '';

  // Сбор всей истории диалога в рамках сессии с маппингом роли model -> assistant
  const history = props.messages
    .filter((m) => m.content && m.content.trim())
    .map((m) => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: m.content
    }));

  // Запуск стриминга с сервера
  streaming.value = true;
  const payload = { messages: history };

  evtSource = new EventSourcePolyfill(`${API_BASE}/chat`, payload);
  append('model', '');
  const modelIdx = props.messages.length - 1;

  evtSource.onmessage = (e) => {
    try {
      let chunk = e.data;
      try {
        chunk = JSON.parse(e.data);
      } catch (_) {}

      const text = extractDeltaText(chunk);
      if (text) {
        props.messages[modelIdx].content += text;
      }
    } catch (err) {
      console.error('Error parsing SSE message:', err);
    }
  };
  evtSource.onopen = () => {
  };
  evtSource.onerror = (ev) => {
    error.value = (ev && ev.message) ? ev.message : 'Ошибка сети или сервер недоступен.';
    streaming.value = false;
    evtSource.close && evtSource.close();
  };
  evtSource.ondone = () => {
    streaming.value = false;
    evtSource.close && evtSource.close();
  };
  evtSource.on('done', () => {
    streaming.value = false;
    evtSource.close && evtSource.close();
  });

  emit('send', userMsg);
}

function stop() {
  if (evtSource && evtSource.close) evtSource.close();
  streaming.value = false;
  emit('stop');
}

onMounted(() => inputRef.value?.focus());

defineExpose({
  focus: () => inputRef.value?.focus(),
  send,
  stop
});
</script>
