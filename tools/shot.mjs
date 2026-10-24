// QA stills: node tools/shot.mjs name=x,y,z,yaw,pitch[&extra] ...  -> /tmp/claude-0/shots/name.png
import { createRequire } from 'module'; const require = createRequire(process.env.PW_PATH || import.meta.url); const { chromium } = require('playwright');
const base = process.env.URL || 'http://127.0.0.1:5173/';
const out = process.env.OUT || '/tmp/claude-0/shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const logs = [];
page.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
for (const arg of process.argv.slice(2)) {
  const [name, rest] = arg.split('=');
  const [shot, ...extra] = rest.split('&');
  await page.goto(`${base}?shot=${shot}&seed=7${extra.length ? '&' + extra.join('&') : ''}`);
  await page.waitForTimeout(Number(process.env.WAIT || 2500));
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 90000 });
  const info = await page.evaluate(() => window.__umbral && window.__umbral.renderer.info.render);
  console.log(name, JSON.stringify(info));
}
console.log(logs.slice(0, 15).join('\n') || 'no errors');
await browser.close();
