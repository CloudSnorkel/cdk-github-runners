<script setup lang="ts">
import { useData } from 'vitepress';
import { DEFAULT_LANGUAGE, LANGUAGES } from '../languages';

const { page } = useData();

// filled on click so it has the reader's language and the section they are at
function fill(event: MouseEvent) {
  const lang = document.documentElement.dataset.lang ?? DEFAULT_LANGUAGE;
  const url = new URL('https://github.com/CloudSnorkel/cdk-github-runners/issues/new');
  url.searchParams.set('title', `docs: ${page.value.title}`);
  url.searchParams.set('body', [
    `**Page:** ${location.href}`,
    `**Language:** ${LANGUAGES.find(l => l.id === lang)?.name ?? lang}`,
    '',
    '<!-- What is wrong or missing? -->',
    '',
  ].join('\n'));
  (event.currentTarget as HTMLAnchorElement).href = url.toString();
}
</script>

<template>
  <a class="report-issue" href="https://github.com/CloudSnorkel/cdk-github-runners/issues/new" target="_blank" rel="noreferrer" @click="fill">
    Report an issue with this page
  </a>
</template>
