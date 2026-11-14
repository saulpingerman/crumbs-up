import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// `npm run icons` turns public/logo.svg into every icon the manifest and
// iOS need. Transparent icons keep the artwork as is; the maskable and
// Apple icons sit on the app's chocolate brown with breathing room.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      padding: 0.36,
      resizeOptions: { background: '#2a1810', fit: 'contain' },
    },
    apple: {
      ...minimal2023Preset.apple,
      padding: 0.26,
      resizeOptions: { background: '#2a1810', fit: 'contain' },
    },
  },
  images: ['public/logo.svg'],
})
