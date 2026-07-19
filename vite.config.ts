/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Budget Manager',
        short_name: 'Budget',
        description: 'Personal budget tracker',
        theme_color: '#0f766e',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [{ src: '/icon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**', '**/.{idea,git,cache,output,temp}/**', '**/.worktrees/**'],
  },
})
