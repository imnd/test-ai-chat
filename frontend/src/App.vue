<template>
  <main id="app">
    <header>
      <h1>AI Chat</h1>
    </header>

    <ChatMessages
      :messages="messages"
      :streaming="streaming"
    />

    <ChatControls
      :messages="messages"
      v-model:streaming="streaming"
      v-model:error="error"
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

const messages = ref([]);
const streaming = ref(false);
const error = ref('');
</script>
