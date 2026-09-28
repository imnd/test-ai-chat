<template>
  <section class="messages" tabindex="0" aria-live="polite">
    <div class="empty" v-if="messages.length === 0" />
    <div v-for="(m, idx) in messages" :key="idx" class="msg">
      <div :class="roleIsUser(m) ? 'user' : 'model'">
        <strong>{{ roleIsUser(m) ? 'Вы' : 'Модель' }}:</strong>
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

const roleIsUser = m => m.role === 'user';
</script>
