<template>
  <main id="app">
    <header class="chat-header">
      <h1>AI Chat</h1>
      <button
        id="theme-toggle"
        class="theme-toggle"
        type="button"
        @click="toggleTheme"
        :title="isDark ? 'Переключить на светлую тему' : 'Переключить на тёмную тему'"
        :aria-label="isDark ? 'Переключить на светлую тему' : 'Переключить на тёмную тему'"
      >
        <svg v-if="isDark" class="theme-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
        <svg v-else class="theme-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      </button>
    </header>

    <ChatMessages
      :messages="messages"
      :streaming="streaming"
    />

    <ChatControls
      ref="controlsRef"
      :messages="messages"
      v-model:streaming="streaming"
      v-model:error="error"
    />

    <footer v-if="error" class="status-footer" role="alert" aria-live="assertive">
      <div class="error-banner">
        <svg class="error-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span class="error-text">{{ error }}</span>
      </div>
    </footer>
  </main>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import ChatMessages from './components/ChatMessages.vue';
import ChatControls from './components/ChatControls.vue';

const messages = ref([]);
const streaming = ref(false);
const error = ref('');
const controlsRef = ref(null);

const isDark = ref(false);

function applyTheme(dark) {
  isDark.value = dark;
  if (dark) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }
}

function toggleTheme() {
  const next = !isDark.value;
  applyTheme(next);
  try {
    localStorage.setItem('theme', next ? 'dark' : 'light');
  } catch (_) {}
}

function handleGlobalKeydown(e) {
  if (e.key === 'Escape' && streaming.value) {
    controlsRef.value?.stop();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown);

  try {
    const saved = localStorage.getItem('theme');
    if (saved) {
      applyTheme(saved === 'dark');
      return;
    }
  } catch (_) {}

  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    applyTheme(true);
  } else {
    applyTheme(false);
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
});
</script>
