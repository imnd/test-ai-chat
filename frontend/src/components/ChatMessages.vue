<template>
  <section ref="messagesRef" class="messages" tabindex="0" aria-live="polite">
    <div class="empty" v-if="messages.length === 0">
      Напишите сообщение — и модель ответит.
    </div>
    <div v-for="(m, idx) in messages" :key="idx" class="msg">
      <div :class="roleIsUser(m) ? 'user' : 'model'">
        <strong>{{ roleIsUser(m) ? 'Вы' : 'Модель' }}:</strong>
      </div>
      <div class="msg-content" v-html="renderContent(m.content)"></div>
    </div>
    <div v-if="streaming" class="status-indicator">
      <span class="status-dot"></span>
      <span v-if="isConnecting">Соединение с сервером…</span>
      <span v-else>Модель печатает…</span>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const props = defineProps({
  messages: {
    type: Array,
    required: true
  },
  streaming: {
    type: Boolean,
    default: false
  }
});

const messagesRef = ref(null);
const roleIsUser = m => m.role === 'user';

const isConnecting = computed(() => {
  if (!props.streaming) return false;
  if (!props.messages.length) return true;
  const lastMsg = props.messages[props.messages.length - 1];
  return lastMsg.role === 'model' && !lastMsg.content;
});

function scrollToBottom(force = false) {
  nextTick(() => {
    const el = messagesRef.value;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (force || isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  });
}

watch(
  () => props.messages.length,
  () => scrollToBottom(true)
);

watch(
  () => props.messages[props.messages.length - 1]?.content,
  () => scrollToBottom(false)
);

watch(
  () => props.streaming,
  () => scrollToBottom(false)
);

marked.setOptions({
  gfm: true,
  breaks: true
});

function renderContent(content) {
  if (!content) return '';
  const html = marked.parse(content);
  return DOMPurify.sanitize(html);
}
</script>
