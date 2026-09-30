import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  build: {
    rollupOptions: {
      input: {
        editor: new URL('./index.html', import.meta.url).pathname,
        guide: new URL('./guide.html', import.meta.url).pathname,
        sdkDemo: new URL('./examples/sdk-demo.html', import.meta.url).pathname,
      },
    },
  },
})
