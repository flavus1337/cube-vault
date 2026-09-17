import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the build works under a GitHub Pages sub-path.
  base: './',
  server: { port: 5173, strictPort: true },
})
