import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import * as path from 'path';
import { viteSingleFile } from 'vite-plugin-singlefile';


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  resolve: {
    alias: {
      '~bootstrap': path.resolve(__dirname, '..', 'node_modules/bootstrap'),
    },
  },
});
