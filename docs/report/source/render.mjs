import { chromium } from 'playwright-core';
const [src, out] = process.argv.slice(2);
const b = await chromium.launch({executablePath: process.env.HOME+'/Library/Caches/ms-playwright/chromium-1187/chrome-mac/Chromium.app/Contents/MacOS/Chromium'});
const p = await b.newPage();
await p.goto('file://'+process.cwd()+'/'+src);
await p.waitForSelector('body[data-done]', {timeout: 60000});
const err = await p.evaluate(()=>document.body.dataset.err);
if (err) {
  const errs = await p.evaluate(async()=>{const out=[];for(const el of document.querySelectorAll('.mermaid')){ if(!el.querySelector('svg')) out.push((el.textContent||'').trim().split('\n')[0]+' :: '+ (await mermaid.parse(el.dataset.src||el.textContent).then(()=> 'ok').catch(e=>String(e.message||e).slice(0,300))));}return out;});
  console.error('MERMAID ERRORS', JSON.stringify(errs,null,1)); }
await p.evaluate(()=>document.fonts.ready);
await p.waitForTimeout(300);
await p.pdf({path: out, preferCSSPageSize: true, printBackground: true});
await b.close();
