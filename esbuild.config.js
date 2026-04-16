import * as esbuild from 'esbuild';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const aliasPlugin = {
  name: 'alias',
  setup(build) {
    build.onResolve({ filter: /^@/ }, (args) => {
      const newPath = args.path.replace('@', 'src');

      const dtsPath = resolve(__dirname, newPath + '.d.ts');
      const tsPath = resolve(__dirname, newPath + '.ts');
      if (existsSync(dtsPath)) return { path: dtsPath, namespace: 'file' };
      if (existsSync(tsPath)) return { path: tsPath, namespace: 'file' };

      const dirPath = resolve(__dirname, newPath);
      const indexTsPath = resolve(dirPath, 'index.ts');
      const indexDtsPath = resolve(dirPath, 'index.d.ts');
      if (existsSync(indexTsPath)) return { path: indexTsPath, namespace: 'file' };
      if (existsSync(indexDtsPath)) return { path: indexDtsPath, namespace: 'file' };
    });
  },
};

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  splitting: true,
  sourcemap: false,
  minify: false,
  target: ['es2020'],
  external: ['react', 'react-dom', 'zustand'],
  plugins: [aliasPlugin],
});

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outdir: 'dist',
  format: 'cjs',
  platform: 'node',
  outExtension: { '.js': '.cjs' },
  sourcemap: false,
  minify: false,
  target: ['es2020'],
  external: ['react', 'react-dom', 'zustand'],
  plugins: [aliasPlugin],
});
