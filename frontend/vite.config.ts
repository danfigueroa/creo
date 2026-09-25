import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Separa as deps pesadas do vendor único: chunks estáveis cacheiam
        // independentemente e carregam em paralelo.
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }
          if (id.includes('@supabase')) {
            return 'supabase'
          }
          if (id.includes('i18next')) {
            return 'i18n'
          }
          if (id.includes('@tanstack')) {
            return 'query'
          }
          // Chunk próprio: cacheia separado do vendor e não invalida quando
          // outra dependência muda.
          if (/[\\/]node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) {
            return 'motion'
          }
          return 'vendor'
        }
      }
    }
  }
})
