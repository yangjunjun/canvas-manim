import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../dist-lib/types/', import.meta.url))

async function fixDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      await fixDirectory(path)
    } else if (entry.name.endsWith('.d.ts')) {
      const original = await readFile(path, 'utf8')
      const fixed = original
        .replace(/^import ['"]@fontsource\/[^'"\n]+\.css['"];?\r?\n/gm, '')
        .replace(/(['"])(\.[^'"\n]+)\.ts\1/g, '$1$2.js$1')
      if (fixed !== original) await writeFile(path, fixed)
    }
  }
}

await fixDirectory(root)
