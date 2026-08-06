import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

let key: Buffer | undefined
let cert: Buffer | undefined

try {
  key = readFileSync('../../.cert/key.pem')
  cert = readFileSync('../../.cert/cert.pem')
} catch {
  /* no certs — fall back to plain http */
}

const https = (key && cert && { key, cert }) || undefined
const port = Number.parseInt(process.env.PORT || '', 10) || 3000

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: true,
    port,
    https,
    // without this the HMR client derives its target from the page origin, which under the Bun SSR
    // host is a port Bun owns and Vite's websocket server never gets — so the client retries forever
    hmr: {
      host: 'vite.local.dev',
      protocol: 'wss'
    }
  },
  preview: {
    port
  }
})
