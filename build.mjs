import { cp, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';

const staticFiles = ['index.html', 'styles.css', 'auth.css', 'questions.js', 'manifest.webmanifest', 'sw.js', 'icon.svg', 'reglamento-2025.pdf'];
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const file of staticFiles) await cp(file, `dist/${file}`);
await build({
  absWorkingDir: process.cwd(),
  entryPoints: ['./app.js'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  outfile: 'dist/app.js',
  minify: true
});
console.log('Static application bundled into dist/.');
