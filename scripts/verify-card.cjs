const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const resultsDir = path.join(root, 'test-results/card');
fs.mkdirSync(resultsDir, {recursive: true});
const checks = [];
const pass = (text) => { checks.push(text); console.log('PASS', text); };
// This server tests the static files, not Cloudflare's routing implementation.
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const name = url.pathname === '/card' ? '/card.html' : url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(publicDir, name);
  if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); return res.end();
  }
  const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.vcf':'text/vcard; charset=utf-8'};
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  if (name === '/contact.vcf') res.setHeader('Content-Disposition', 'attachment; filename="cesar-arturo.vcf"');
  res.end(fs.readFileSync(file));
});

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/card`;
    browser = await chromium.launch({channel: 'msedge', headless: true});
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({width:1200,height:630});
    await page.goto(pathToFileURL(path.join(root, 'src/card/social-preview.html')).href);
    await page.screenshot({path:path.join(publicDir,'assets/card-og.v1.png')});
    pass('Social preview generated at 1200 x 630');
    await page.setViewportSize({width:900,height:1600});
    await page.goto(pathToFileURL(path.join(root, 'src/card/wallet-image.html')).href);
    assert.equal(await page.evaluate(()=>[...document.images].every(i=>i.complete && i.naturalWidth>0)),true);
    const walletLayout = await page.evaluate(() => {
      const qr = document.querySelector('.qr').getBoundingClientRect();
      const details = document.querySelector('.details').getBoundingClientRect();
      const location = document.querySelector('.location').getBoundingClientRect();
      const footer = document.querySelector('.site').getBoundingClientRect();
      return {centered: Math.abs(qr.x + qr.width / 2 - innerWidth / 2) < 1, stacked: details.top > qr.bottom, fits: location.bottom < footer.top};
    });
    assert.deepEqual(walletLayout, {centered:true, stacked:true, fits:true});
    await page.screenshot({path:path.join(publicDir,'assets/card-wallet.v2.png')});
    pass('Vertical Wallet image at 900 x 1600, centered QR and contact details below');
    for (const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:900});
      await page.goto(url);
      const layout = await page.evaluate(() => ({
        overflow:document.documentElement.scrollWidth > innerWidth,
        images:[...document.images].every(i => i.complete && i.naturalWidth > 0),
        title:document.querySelector('h1').textContent,
        primary:document.querySelector('.primary').getBoundingClientRect().height
      }));
      assert.equal(layout.overflow,false);
      assert.equal(layout.images,true);
      assert.ok(layout.title.includes('Cesar Arturo'));
      assert.ok(layout.primary>=44);
      await page.screenshot({path:path.join(resultsDir,`card-${width}.png`),fullPage:true});
      pass(`Layout, images and primary target at ${width}px`);
    }
    assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://cesararturo.com/card');
    assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'noindex, follow');
    assert.ok(!fs.readFileSync(path.join(publicDir,'sitemap.xml'),'utf8').includes('/card'));
    pass('Canonical, noindex and sitemap exclusion');
    for (const asset of ['contact.vcf','assets/card.v2.min.css','assets/card.v1.min.js','assets/card-qr.v1.png','assets/card-qr.v1.svg','assets/card-og.v1.png','assets/card-wallet.v2.png','assets/cesar-portrait.v1.png']) {
      const response=await page.request.get(new URL(asset, url).href);
      assert.equal(response.status(),200,asset);
    }
    const vcard = fs.readFileSync(path.join(publicDir,'contact.vcf'),'utf8');
    assert.ok(vcard.includes('FN:Cesar Arturo\r\n'));
    assert.ok(vcard.includes('TEL;TYPE=CELL:+50765612868'));
    assert.ok(!/(?<!\r)\n/.test(vcard));
    const downloadPromise=page.waitForEvent('download');
    await page.getByRole('link',{name:'Guardar contacto'}).click();
    const download=await downloadPromise;
    assert.equal(download.suggestedFilename(),'cesar-arturo.vcf');
    await download.saveAs(path.join(resultsDir,'contact.vcf'));
    pass('vCard fields, CRLF and browser download');

    await page.evaluate(() => {window.testEvents=[];window.gtag=(...args)=>window.testEvents.push(args);document.addEventListener('click',e=>{if(e.target.closest('a'))e.preventDefault()});});
    await page.getByRole('link',{name:'Escribir por WhatsApp'}).click();
    await page.getByRole('link',{name:/Enviar correo/}).click();
    await page.locator('summary').click();
    assert.equal(await page.locator('#qr-details').getAttribute('open'),'');
    await page.waitForFunction(() => window.testEvents.some(e=>e[1]==='qr_view'));
    await page.getByRole('link',{name:'Descargar tarjeta con QR'}).click();
    const events=await page.evaluate(()=>window.testEvents);
    assert.ok(events.some(e=>e[1]==='lead_whatsapp'&&e[2].event_label==='card_whatsapp'));
    assert.ok(events.some(e=>e[1]==='lead_email'&&e[2].event_label==='card_email'));
    assert.ok(events.some(e=>e[1]==='wallet_image_download'&&e[2].event_label==='card_wallet_image'));
    assert.ok(events.every(e=>!('link_url' in e[2])));
    pass('Contact and QR events, no outbound message content');
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(resultsDir,'card-qr-open.png'),fullPage:true});

    await page.evaluate(()=>{
      Object.defineProperty(navigator,'share',{configurable:true,value:undefined});
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied=text}}});
    });
    await page.getByRole('button',{name:'Compartir'}).click();
    assert.equal(await page.locator('#share-status').textContent(),'Enlace copiado.');
    assert.equal(await page.evaluate(()=>window.copied),'https://cesararturo.com/card');
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('denied')}}}));
    await page.getByRole('button',{name:'Compartir'}).click();
    assert.equal(await page.locator('#copy-fallback').isVisible(),true);
    assert.equal(await page.locator('#card-url').evaluate(el=>document.activeElement===el),true);
    pass('Clipboard success and denied-permission fallback');
    await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('Cancelled','AbortError')}}));
    await page.getByRole('button',{name:'Compartir'}).click();
    assert.equal(await page.locator('#share-status').textContent(),'');
    assert.equal(await page.locator('#copy-fallback').isVisible(),false);
    await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.shared=data}}));
    await page.getByRole('button',{name:'Compartir'}).click();
    assert.equal(await page.evaluate(()=>window.shared.url),'https://cesararturo.com/card');
    pass('Native share mocked success and cancellation');

    await page.goto(url);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.home-link').evaluate(el=>document.activeElement===el),true);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.primary').evaluate(el=>document.activeElement===el),true);
    assert.equal(await page.locator('.primary').evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.primary').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
    pass('Keyboard focus and reduced motion');
    const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:320,height:800}});
    const plain=await noJs.newPage();
    await plain.goto(url);
    assert.equal(await plain.getByRole('link',{name:'Guardar contacto'}).isVisible(),true);
    assert.equal(await plain.getByRole('link',{name:'Escribir por WhatsApp'}).isVisible(),true);
    assert.equal(await plain.getByRole('button',{name:'Compartir'}).isVisible(),false);
    await plain.locator('summary').click();
    assert.equal(await plain.locator('.qr-content').isVisible(),true);
    await noJs.close();
    pass('Core contact and QR interactions without JavaScript');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(resultsDir,'checks.json'),JSON.stringify({checks,errors,limitations:['Physical iOS/Android import not tested','Production Cloudflare route and WhatsApp preview pending','Real GA4 delivery not tested']},null,2));
  } finally {
    if(browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(e=>{console.error(e);process.exitCode=1});
