<template>
  <form class="controls" @submit.prevent="send()">
    <textarea
        class="prompt"
        ref="inputRef"
        v-model="inputText"
        @input="autoResize"
        @keydown.escape.prevent="stop()"
        @keydown.enter.exact.prevent="send()"
        placeholder="Сообщение"
        aria-label="Сообщение"
        rows="1"
    />
    <div class="controls-actions">
      <button type="submit" class="btn-send">Отправить</button>
      <button type="button" class="btn-stop" @click="stop()" :disabled="!streaming">Стоп</button>
    </div>
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

function autoResize() {
  const el = inputRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

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

const TIMEOUT_MS = 30000; // 30 секунд таймаут ожидания

function formatErrorMessage(err, status) {
  if (!err && !status) return 'Неизвестная ошибка';
  const errMsg = (typeof err === 'string' ? err : err?.message || '').trim();

  // 1. Таймаут
  if (errMsg === 'TIMEOUT' || errMsg.includes('таймаут') || errMsg.includes('timeout')) {
    return 'Превышено время ожидания ответа (таймаут 30 сек). Сервер или модель не отвечают.';
  }

  // 2. Лимит запросов 429
  if (
    status === 429 ||
    errMsg.includes('429') ||
    errMsg.toLowerCase().includes('rate limit') ||
    errMsg.toLowerCase().includes('too many requests')
  ) {
    return 'Превышен лимит запросов к бесплатной модели (429 Too Many Requests). Пожалуйста, подождите немного перед следующим запросом.';
  }

  // 3. Авторизация 401
  if (status === 401 || errMsg.includes('401') || errMsg.toLowerCase().includes('unauthorized')) {
    return 'Ошибка авторизации API ключа (401 Unauthorized). Проверьте ключ в файле .env на сервере.';
  }

  // 4. Оплата/Квота 402
  if (status === 402 || errMsg.includes('402') || errMsg.toLowerCase().includes('payment required')) {
    return 'Недостаточно средств или исчерпана квота на OpenRouter (402 Payment Required).';
  }

  // 5. Ошибки сервера 5xx
  if ((status >= 500 && status < 600) || errMsg.includes('500') || errMsg.includes('502') || errMsg.includes('503')) {
    return `Сервер модели временно недоступен (код ${status || 500}). Попробуйте позже.`;
  }

  // 6. Ошибки сети и недоступность сервера
  if (
    err?.name === 'TypeError' ||
    errMsg.toLowerCase().includes('failed to fetch') ||
    errMsg.toLowerCase().includes('networkerror') ||
    errMsg.toLowerCase().includes('network request failed') ||
    errMsg.toLowerCase().includes('connection refused')
  ) {
    return 'Обрыв сети или сервер недоступен. Проверьте подключение к интернету.';
  }

  return errMsg || 'Произошла непредвиденная ошибка при обращении к серверу.';
}

function EventSourcePolyfill(url, payload) {
  const controller = new AbortController();
  let isManualStop = false;
  let isTimedOut = false;
  let timeoutTimer = null;

  const es = {
    onmessage: null,
    onerror: null,
    onopen: null,
    _events: {}
  };

  es.on = function (name, fn) {
    es._events[name] = fn;
  };

  function resetTimeout() {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    timeoutTimer = setTimeout(() => {
      isTimedOut = true;
      controller.abort();
      if (!isManualStop) {
        es.onerror && es.onerror(new Error('TIMEOUT'));
      }
    }, TIMEOUT_MS);
  }

  function stopTimeout() {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
  }

  // Запуск таймаута ожидания (30 секунд)
  resetTimeout();

  fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
    signal: controller.signal
  })
      .then(async (resp) => {
        if (!resp.ok) {
          stopTimeout();
          let errorDetail = '';
          try {
            const body = await resp.json();
            errorDetail = body.error?.message || body.error || '';
            if (typeof errorDetail === 'object') {
              errorDetail = JSON.stringify(errorDetail);
            }
          } catch (_) {
            try {
              errorDetail = await resp.text();
            } catch (_) {}
          }
          const formatted = formatErrorMessage(new Error(errorDetail), resp.status);
          throw new Error(formatted);
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
                  stopTimeout();
                  es._events['done'] && es._events['done']();
                  return;
                }

                // Сброс таймаута при активности потока данных
                resetTimeout();

                buf += decoder.decode(value, {stream: true});
                const parts = buf.split('\n\n');
                buf = parts.pop();
                for (const p of parts) {
                  if (p.startsWith('event:')) {
                    const ev = p.split('\n')[0].slice(6).trim();
                    const dline = p.split('\n').slice(1).join('\n');
                    const data = dline.replace(/^data:\s*/, '');
                    if (ev === 'done') {
                      stopTimeout();
                      es._events['done'] && es._events['done']();
                    } else if (ev === 'error') {
                      stopTimeout();
                      let raw = data;
                      try {
                        raw = JSON.parse(data);
                      } catch (_) {}
                      const friendlyMsg = formatErrorMessage(
                        new Error(typeof raw === 'string' ? raw : JSON.stringify(raw)),
                        null
                      );
                      es.onerror && es.onerror(new Error(friendlyMsg));
                    } else if (es['on' + ev]) {
                      es['on' + ev](data);
                    }
                    continue;
                  }
                  const m = p.replace(/^data:\s*/, '');
                  es.onmessage && es.onmessage({data: m});
                }
                read();
              })
              .catch((err) => {
                stopTimeout();
                if (isManualStop || err.name === 'AbortError') return;
                const friendlyMsg = formatErrorMessage(err, null);
                es.onerror && es.onerror(new Error(friendlyMsg));
              });
        }

        read();
      })
      .catch((err) => {
        stopTimeout();
        if (isManualStop || err.name === 'AbortError') return;
        const friendlyMsg = formatErrorMessage(err, null);
        es.onerror && es.onerror(new Error(friendlyMsg));
      });

  es.close = () => {
    isManualStop = true;
    stopTimeout();
    controller.abort();
  };

  return es;
}

async function send() {
  if (!inputText.value || !inputText.value.trim()) return;
  const userMsg = inputText.value.trim();
  append('user', userMsg);
  inputText.value = '';
  if (inputRef.value) {
    inputRef.value.style.height = 'auto';
  }
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
    // Если модель ничего не успела сгенерировать, убираем пустой блок
    if (props.messages.length > 0) {
      const last = props.messages[props.messages.length - 1];
      if (last.role === 'model' && !last.content) {
        props.messages.pop();
      }
    }

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

  // Если модель не успела вывести ни одного токена при нажатии Стоп, убираем пустое сообщение
  if (props.messages.length > 0) {
    const last = props.messages[props.messages.length - 1];
    if (last.role === 'model' && !last.content) {
      props.messages.pop();
    }
  }

  emit('stop');
}

onMounted(() => inputRef.value?.focus());

defineExpose({
  focus: () => inputRef.value?.focus(),
  send,
  stop
});
</script>
