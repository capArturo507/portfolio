const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { icons } = require('lucide');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src/card');
const target = path.join(root, 'public');
const read = (name) => fs.readFileSync(path.join(source, name), 'utf8');

const html = read('card.html').replace(/<i data-icon="([A-Za-z0-9]+)"><\/i>/g, (_, name) => {
  if (!icons[name]) throw new Error(`Unknown Lucide icon: ${name}`);
  const nodes = icons[name].map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([key, value]) => `${key}="${value}"`).join(' ')}></${tag}>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${nodes}</svg>`;
});
fs.writeFileSync(path.join(target, 'card.html'), html);
for (const extension of ['css', 'js']) {
  const result = esbuild.transformSync(read(`card.${extension}`), {loader: extension, minify: true, target: 'es2020'});
  fs.writeFileSync(path.join(target, `assets/card.${extension === 'css' ? 'v2' : 'v1'}.min.${extension}`), result.code);
}
fs.writeFileSync(path.join(target, 'contact.vcf'), read('contact.vcf').replace(/\r?\n/g, '\r\n'));
fs.copyFileSync(path.join(path.dirname(require.resolve('lucide/package.json')), 'LICENSE'), path.join(target, 'assets/lucide-license.txt'));
console.log('Built card.html, minified assets and contact.vcf');
