<template>
  <section class="messages" tabindex="0" aria-live="polite">
    <template v-if="messages.length === 0">
      <div class="empty">Напишите сообщение — и модель ответит.</div>
    </template>
    <div v-for="(m, idx) in messages" :key="idx" class="msg">
      <div :class="m.role === 'user' ? 'user' : 'model'">
        <strong>{{ m.role === 'user' ? 'Вы' : 'Модель' }}:</strong>
      </div>
      <div v-html="m.content"></div>
    </div>
    <div v-if="streaming" class="status">Модель печатает…</div>
  </section>
</template>

<script setup>
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
</script>
