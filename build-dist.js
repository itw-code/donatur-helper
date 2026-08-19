import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');

// Remove existing dist if present
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Copy root static files
const rootFiles = ['index.html', '_headers', 'robots.txt'];
for (const file of rootFiles) {
  const src = path.resolve(file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distDir, file));
  }
}

// Recursively copy directories
function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const item of fs.readdirSync(srcDir)) {
    const srcPath = path.join(srcDir, item);
    const destPath = path.join(destDir, item);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(path.resolve('css'), path.join(distDir, 'css'));
copyDir(path.resolve('js'), path.join(distDir, 'js'));

console.log('Build completed: dist/ prepared for Cloudflare Pages deployment.');
