import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  splitting: true,
  sourcemap: true,
  minify: false,
  target: ['es2020'],
});

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outdir: 'dist',
  format: 'cjs',
  platform: 'node',
  outExtension: { '.js': '.cjs' },
  sourcemap: true,
  minify: false,
  target: ['es2020'],
});
