import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['reactflow'],
  },
  server: {
    allowedHosts: [
      "6a79-2403-6200-8827-32ae-3c4d-170d-3128-7f53.ngrok-free.app",
      "silly-zus-marine-allen.trycloudflare.com",
    ],
  },
})
