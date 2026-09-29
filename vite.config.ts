import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const port = Number(env.PORT) || undefined

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      ...(port ? { port } : {}),
    },
    preview: {
      host: '0.0.0.0',
      ...(port ? { port } : {}),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/victory-vendor')) return 'charts'
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase'
            if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react-vendor'
          },
        },
      },
    },
  }
})
