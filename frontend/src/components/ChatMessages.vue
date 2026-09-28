<template>
  <section class="messages" tabindex="0" aria-live="polite">
    <div class="empty" v-if="messages.length === 0" />
    <div v-for="(m, idx) in messages" :key="idx" class="msg">
      <div :class="roleIsUser(m) ? 'user' : 'model'">
        <strong>{{ roleIsUser(m) ? 'Вы' : 'Модель' }}:</strong>
      </div>
      <div class="msg-content" v-html="renderContent(m.content)"></div>
    </div>
    <div v-if="streaming" class="status">Модель печатает…</div>
  </section>
</template>

<script setup>
import { marked } from 'marked';
import DOMPurify from 'dompurify';

defineProps({
  messages: {
    type: Array,
    required: true
  },
  streaming: {
    type: Boolean,
    default: false
  }
});

const roleIsUser = m => m.role === 'user';

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
