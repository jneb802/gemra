import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: {
      outDir: 'dist-electron/main'
    },
    // Exclude @anthropic-ai/claude-agent-sdk so Vite bundles it (converts ESM→CJS).
    // It has "type":"module" so externalizing it causes ERR_REQUIRE_ESM at runtime.
    // Note: cli.js (the spawned subprocess) is kept in asarUnpack separately.
    plugins: [externalizeDepsPlugin({ exclude: ['@anthropic-ai/claude-agent-sdk'] })],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    build: {
      outDir: 'dist-electron/preload'
    },
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    root: '.',
    build: {
      outDir: 'dist-electron/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'index.html')
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared')
      }
    },
    css: {
      modules: {
        localsConvention: 'camelCase'
      }
    }
  }
})
