import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist-lib',
    emptyOutDir: false,
    lib: {
      entry: 'src/sdk.ts',
      name: 'CanvasManim',
      formats: ['es'],
      fileName: 'canvas-manim',
      cssFileName: 'canvas-manim',
    },
  },
})
