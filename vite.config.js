import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// GitHub Pages serves this app from a /trip-planner/ subpath; every other
// host (Netlify, Vercel, local dev) serves it from the domain root.
export default defineConfig({
  base: process.env.DEPLOY_TARGET === 'gh-pages' ? '/trip-planner/' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
  },
})
