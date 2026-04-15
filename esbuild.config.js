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
      const path = existsSync(dtsPath) ? dtsPath : tsPath;
      return { path, namespace: 'file' };
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
  plugins: [aliasPlugin],
});
