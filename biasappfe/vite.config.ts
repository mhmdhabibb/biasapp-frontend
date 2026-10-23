import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    mode === 'development' ? vueDevTools() : undefined,
  ].filter(Boolean),
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:4008', changeOrigin: true },
    },
  },
  build: {
    minify: 'oxc',
    cssCodeSplit: true,
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('exceljs') || id.includes('xlsx')) return 'vendor-excel'
          if (id.includes('html2pdf') || id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf'
          if (id.includes('qrcode')) return 'vendor-qrcode'
          if (id.includes('axios')) return 'vendor-utils'
          if (id.includes('vue') || id.includes('@vue')) return 'vendor-vue'
          return 'vendor'
        },
      },
    },
  },
  optimizeDeps: {
    include: ['vue', 'vue-router', 'vue-i18n', '@vueuse/core', 'axios'],
    exclude: ['exceljs', 'xlsx', 'html2pdf.js'],
  },
}))
