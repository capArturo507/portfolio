const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const publicDir = path.resolve(__dirname, '../public');
const pages = [
  'index.html',
  'web-instagram-whatsapp.html',
  'por-que-mi-web-no-aparece-en-google.html',
  'que-incluye-una-cotizacion-web.html',
  'posicionamiento-seo-llm.html'
];
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).slice(1);
  const file = path.resolve(publicDir, relative);
  if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); return res.end();
  }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route(/googletagmanager\.com|google-analytics\.com/, route => route.abort());
    const titles = new Set();
    for (const name of pages) {
      const html = fs.readFileSync(path.join(publicDir, name), 'utf8');
      assert.match(html, /<meta name="description" content="[^"]+">/);
      assert.match(html, /<link rel="canonical" href="https:\/\/cesararturo\.com\/[^"]*">/);
      for (const [, href] of html.matchAll(/href="(\/[^"#?]+)(?:[?#][^"]*)?"/g)) {
        if (href === '/') continue;
        const target = path.join(publicDir, href.slice(1));
        assert.ok(fs.existsSync(target) || fs.existsSync(`${target}.html`), `${name}: broken ${href}`);
      }
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${base}/${name}`);
        const result = await page.evaluate(() => ({
          title: document.title,
          heading: document.querySelector('h1')?.textContent.trim(),
          description: document.querySelector('meta[name="description"]')?.content,
          overflow: document.documentElement.scrollWidth > innerWidth,
          cssLoaded: getComputedStyle(document.body).backgroundColor === 'rgb(245, 248, 246)',
          nextSectionTop: document.querySelector('#proyectos')?.getBoundingClientRect().top,
          imagesLoaded: [...document.images].filter(image => image.loading !== 'lazy').every(image => image.complete && image.naturalWidth > 0)
        }));
        assert.ok(result.heading && result.description, `${name}: missing content`);
        assert.equal(result.overflow, false, `${name}: horizontal overflow at ${width}px`);
        assert.equal(result.cssLoaded, true, `${name}: CSS not loaded`);
        assert.equal(result.imagesLoaded, true, `${name}: image failed at ${width}px`);
        assert.deepEqual(pageErrors, [], `${name}: browser error`);
        if (width === 390) titles.add(result.title);
        if (name === 'index.html') {
          assert.ok(result.nextSectionTop < 900, `next section starts at ${result.nextSectionTop}px on ${width}px viewport`);
          for (const image of await page.locator('img[loading="lazy"]').all()) {
            await image.scrollIntoViewIfNeeded();
            await image.evaluate(img => img.decode());
          }
          await page.evaluate(() => scrollTo(0, 0));
          const screenshotDir = path.join(publicDir, '..', 'test-results', 'content');
          fs.mkdirSync(screenshotDir, { recursive: true });
          await page.screenshot({ path: path.join(screenshotDir, `home-${width}.png`), fullPage: true });
        }
        if (['web-instagram-whatsapp.html', 'posicionamiento-seo-llm.html'].includes(name) && (width === 390 || width === 1440)) {
          const screenshotDir = path.join(publicDir, '..', 'test-results', 'content');
          fs.mkdirSync(screenshotDir, { recursive: true });
          const label = name === 'web-instagram-whatsapp.html' ? 'guide' : 'seo-guide';
          await page.screenshot({ path: path.join(screenshotDir, `${label}-${width}.png`), fullPage: true });
        }
      }
      console.log('PASS', name, 'mobile + desktop');
    }
    assert.equal(titles.size, pages.length, 'duplicate page titles');
    const sitemap = fs.readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf8');
    const llms = fs.readFileSync(path.join(publicDir, 'llms.txt'), 'utf8');
    for (const name of pages.slice(1)) {
      assert.ok(sitemap.includes(`https://cesararturo.com/${name}`), `${name}: missing from sitemap`);
      assert.ok(llms.includes(`/${name}`), `${name}: missing from llms.txt`);
    }
    console.log('PASS internal links, metadata, sitemap, llms.txt');
  } finally {
    await browser?.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
