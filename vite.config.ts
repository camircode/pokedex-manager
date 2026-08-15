import { defineConfig } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'

import viteReact from '@vitejs/plugin-react'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tanstackStart({
      importProtection: { enabled: true, behavior: 'error' },
    }),
    nitro({ preset: 'node-server' }),
    viteReact(),
  ],
})

export default config
