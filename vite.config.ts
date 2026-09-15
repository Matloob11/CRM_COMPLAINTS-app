import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// The SPA is served by nginx from a static directory and mounted under the
// site root of complaints.srv1802669.hstgr.cloud. The bootstrap HTML rendered
// by the Django handler injects <base href="/"> plus the auth token, so assets
// are referenced from the root.
export default defineConfig({
  plugins: [react()],
  base: '/',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // 'hidden' emits the maps for our own debugging but writes no
    // sourceMappingURL comment, so browsers never fetch them and the source
    // (including the dev-only mock fixtures) is not published by nginx.
    sourcemap: 'hidden',
    target: 'es2020',
  },
  server: {
    port: 5273,
    host: '127.0.0.1',
  },
})
