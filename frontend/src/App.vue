<template>
  <main id="app">
    <header>
      <h1>AI Chat</h1>
    </header>

    <ChatMessages :messages="messages" :streaming="streaming" />

    <ChatControls
      v-model="inputText"
      :streaming="streaming"
      @send="send"
      @stop="stop"
    />

    <footer class="status">
      <span v-if="error" style="color: #b00">{{ error }}</span>
    </footer>
  </main>
</template>

<script setup>
import { ref } from 'vue';
import ChatMessages from './components/ChatMessages.vue';
import ChatControls from './components/ChatControls.vue';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const messages = ref([]);
const inputText = ref('');
const streaming = ref(false);
const error = ref('');
let evtSource = null;

function append(role, content) {
  messages.value.push({ role, content });
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal
  })
    .then((resp) => {
      if (!resp.ok) throw new Error('Upstream error ' + resp.status);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      es.onopen && es.onopen();

      function read() {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              es._events['done'] && es._events['done']();
              return;
            }
            buf += decoder.decode(value, { stream: true });
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
              es.onmessage && es.onmessage({ data: m });
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
  const payload = { messages: [{ role: 'user', content: userMsg }] };

  evtSource = new EventSourcePolyfill(`${API_BASE}/chat`, payload);
  append('model', '');
  const modelIdx = messages.value.length - 1;

  evtSource.onmessage = (e) => {
    try {
      const chunk = JSON.parse(e.data);
      messages.value[modelIdx].content += escapeHtml(chunk);
    } catch (err) {}
  };
  evtSource.onopen = () => {};
  evtSource.onerror = (ev) => {
    error.value = 'Ошибка сети или сервер недоступен.';
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
}

function stop() {
  if (evtSource && evtSource.close) evtSource.close();
  streaming.value = false;
}
</script>
