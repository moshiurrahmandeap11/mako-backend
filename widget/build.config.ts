import * as esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';

async function buildWidget() {
  const publicDir = path.resolve(__dirname, '../public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const result = await esbuild.build({
    entryPoints: [path.resolve(__dirname, 'src/index.ts')],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2020'],
    outfile: path.resolve(publicDir, 'widget.js'),
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
    metafile: true,
  });

  console.log('⚡ Widget successfully compiled into standalone IIFE bundle: backend/public/widget.js');
}

buildWidget().catch((err) => {
  console.error('Widget build failed:', err);
  process.exit(1);
});
