<template>
  <form class="controls" @submit.prevent="handleSubmit">
    <input
      ref="inputRef"
      v-model="model"
      @keydown.escape.prevent="emit('stop')"
      @keydown.enter.exact.prevent="handleSubmit"
      type="text"
      placeholder="Сообщение"
      aria-label="Сообщение"
    />
    <button type="submit">Отправить</button>
    <button type="button" @click="emit('stop')" :disabled="!streaming">Стоп</button>
  </form>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const model = defineModel({
  type: String,
  default: ''
});

defineProps({
  streaming: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['send', 'stop']);

function handleSubmit() {
  emit('send');
}

const inputRef = ref(null);

onMounted(() => inputRef.value?.focus());

defineExpose({
  focus: () => inputRef.value?.focus()
});
</script>
