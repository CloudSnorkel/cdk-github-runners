import * as path from 'path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  css: {
    preprocessorOptions: {
      scss: {
        // Bootstrap 5.3 doesn't support sass modules -- but 6 will
        quietDeps: true,
        silenceDeprecations: ['import'],
      },
    },
  },
  resolve: {
    alias: {
      '~bootstrap': path.resolve(__dirname, '..', 'node_modules/bootstrap'),
    },
  },
});
