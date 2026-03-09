import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Позволяет корректно загружать стили и скрипты на бесплатном хостинге GitHub Pages
  server: {
    port: 3000,
    open: true
  }
});
