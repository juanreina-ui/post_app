import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/redash-api': {
        target: 'https://redash.humand.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/redash-api/, ''),
      },
      '/humand-api': {
        target: 'https://api-prod.humand.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/humand-api/, ''),
      },
      '/gemini-api': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gemini-api/, ''),
      },
    },
  },
})
