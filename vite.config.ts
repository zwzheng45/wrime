import { execSync } from 'child_process'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import replace from '@rollup/plugin-replace'
import { run } from 'vite-plugin-run'
import { VitePWA, VitePWAOptions } from 'vite-plugin-pwa'

const resources = ['rime.data', 'rime.js', 'rime.wasm']
const appName = 'wRIME - 基于 RIME 的在线中文输入法'
const shortAppName = 'wRIME'

const workbox: VitePWAOptions["workbox"] = {
  maximumFileSizeToCacheInBytes: 3145728,
  globPatterns: [
    '**/*.{js,css,html}',
    'logo.svg',
    ...resources
  ]
}

if (process.env.LIBRESERVICE_CDN) {
  workbox.manifestTransforms = [
    manifest => ({
      manifest: manifest.map(entry => resources.includes(entry.url) ? {
        url: process.env.LIBRESERVICE_CDN + entry.url,
        revision: entry.revision,
        size: entry.size
      } : entry),
      warnings: []
    })
  ]
}

const plugins = [
  replace({
    __LIBRESERVICE_CDN__: process.env.LIBRESERVICE_CDN || '',
    __COMMIT__: execSync('git rev-parse HEAD').toString().trim(),
    __BUILD_DATE__: new Date().toLocaleString()
  }),
  VitePWA({
    registerType: 'autoUpdate',
    workbox,
    manifest: {
      name: appName,
      short_name: shortAppName,
      icons: [
        {
          src: 'logo.svg',
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'any maskable',
        }
      ]
    }
  }),
  vue()
]

if (process.env.NODE_ENV !== 'production') {
  const watchFiles = [
    'worker.ts',
    'schema-files.json',
    'schema-name.json',
    'schema-resources.json',
    'schema-target.json',
    'dependency-map.json',
    'target-files.json',
    'target-version.json'
  ]
  plugins.push(run({
    input: [
      {
        name: 'Transpile worker',
        run: ['pnpm run worker'],
        condition: file => watchFiles.some(name => file.includes(name))
      }
    ],
    silent: false
  }))
}

export default defineConfig({
  base: '',
  plugins,
  server: {
    watch: {
      ignored: ['**/boost/**', '**/build/**', '**/dist/**', '**/librime/**', '**/scripts/**', '**/wasm/**'],
    },
  }
})
