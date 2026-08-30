import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// [https://vitejs.dev/config/](https://vitejs.dev/config/)
export default defineConfig({
  plugins: [
    tailwindcss(),
    react()
  ],
  // Set the base to your repository name for GitHub Pages
  base: '/vereinsmeisterschaft/', 
})