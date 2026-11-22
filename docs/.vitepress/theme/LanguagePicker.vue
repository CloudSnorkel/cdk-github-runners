<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { DEFAULT_LANGUAGE, LANGUAGES } from '../languages';

const lang = ref<string>(DEFAULT_LANGUAGE);

// the head script in config.mts already picked the language before the page showed
onMounted(() => {
  lang.value = document.documentElement.dataset.lang ?? DEFAULT_LANGUAGE;
});

function select(id: string) {
  lang.value = id;
  // other languages have code blocks of other heights, so keep the heading the reader is at (the last one in the top third) in the same place
  const headings = [...document.querySelectorAll('.vp-doc :is(h2, h3)[id]')];
  const current = headings.filter(h => h.getBoundingClientRect().top < innerHeight / 3).pop();
  const top = current?.getBoundingClientRect().top;
  document.documentElement.dataset.lang = lang.value;
  if (current) {
    window.scrollBy(0, current.getBoundingClientRect().top - top!);
  }
  try {
    localStorage.setItem('lang', lang.value);
  } catch {
  }
  const url = new URL(location.href);
  url.searchParams.set('lang', lang.value);
  history.replaceState(history.state, '', url);
}
</script>

<template>
  <div class="language-picker" role="radiogroup" aria-label="Language">
    <button
      v-for="l in LANGUAGES"
      :key="l.id"
      role="radio"
      :aria-checked="lang === l.id"
      :aria-label="l.name"
      :title="l.name"
      @click="select(l.id)"
    >
      <span class="language-icon" :style="{ maskImage: `url(/languages/${l.id}.svg)` }" aria-hidden="true"></span>
      <span v-if="lang === l.id">{{ l.name }}</span>
    </button>
  </div>
</template>
