import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

function walkDir(dir, callback) {
  readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(path, callback);
    } else if (entry.name.endsWith('.d.ts')) {
      callback(path);
    }
  });
}

function fixPaths() {
  const distDir = resolve(rootDir, 'dist');

  walkDir(distDir, (filePath) => {
    let content = readFileSync(filePath, 'utf-8');
    let modified = content.replace(/from '@\/([^']+)'/g, (match, path) => {
      const cleanPath = path.replace(/^@/, '');
      let targetPath = resolve(distDir, cleanPath + '.d.ts');
      if (!existsSync(targetPath)) {
        targetPath = resolve(distDir, cleanPath);
      }
      const relPath = './' + relative(dirname(filePath), targetPath).replace('.d.ts', '');
      return `from '${relPath}'`;
    });
    if (modified !== content) {
      writeFileSync(filePath, modified);
      console.log('Fixed:', filePath);
    }
  });
}

fixPaths();
