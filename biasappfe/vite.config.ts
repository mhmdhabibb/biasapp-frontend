import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4008',
        changeOrigin: true,
      },
    },
  },
  build: {
    minify: 'esbuild',
    cssCodeSplit: true,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('vue') || id.includes('vue-router') || id.includes('vue-i18n') || id.includes('@vueuse')) {
              return 'vendor-vue';
            }
            if (id.includes('axios') || id.includes('qrcode')) {
              return 'vendor-utils';
            }
            if (id.includes('exceljs') || id.includes('xlsx')) {
              return 'vendor-excel';
            }
            if (id.includes('html2pdf')) {
              return 'vendor-pdf';
            }
            return 'vendor';
          }
        },
      },
    },
  },
  optimizeDeps: {
    include: ['vue', 'vue-router', 'vue-i18n', '@vueuse/core', 'axios'],
    exclude: ['exceljs', 'xlsx', 'html2pdf.js'],
  },
})
