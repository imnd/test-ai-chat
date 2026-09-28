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
  if (!inputText.value.trim()) return;
  append('user', escapeHtml(inputText.value));
  const userMsg = inputText.value;
  inputText.value = '';
  error.value = '';

  // Запуск стриминга с сервера
  streaming.value = true;
  const payload = {messages: [{role: 'user', content: userMsg}]};

  evtSource = new EventSourcePolyfill(`${API_BASE}/chat`, payload);
  append('model', '');
  const modelIdx = props.messages.length - 1;

  evtSource.onmessage = (e) => {
    try {
      const chunk = JSON.parse(e.data);
      let text = '';
      if (typeof chunk === 'string') {
        const lines = chunk.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data:')) {
            try {
              const json = JSON.parse(trimmed.replace(/^data:\s*/, ''));
              text += json.choices?.[0]?.delta?.content || '';
            } catch (_) {
              text += trimmed;
            }
          } else {
            text += line;
          }
        }
      } else if (chunk && typeof chunk === 'object') {
        text = chunk.choices?.[0]?.delta?.content || '';
      }
      props.messages[modelIdx].content += escapeHtml(text || (typeof chunk === 'string' ? chunk : ''));
    } catch (err) {
      props.messages[modelIdx].content += escapeHtml(e.data || '');
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
