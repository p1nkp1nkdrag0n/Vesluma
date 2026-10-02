import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../../public/images/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  ...(process.env.VESLUMA_QA_BROWSER ? { executablePath: process.env.VESLUMA_QA_BROWSER } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  await page.route('**/*', route => route.abort());
  for (const city of ['beijing', 'shanghai', 'hangzhou', 'chengdu']) {
    const svg = await readFile(new URL(`./${city}.svg`, import.meta.url), 'utf8');
    await page.setContent(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>body{margin:0}svg{display:block}</style></head><body>${svg}</body></html>`);
    await page.screenshot({ path: fileURLToPath(new URL(`../../public/images/${city}.png`, import.meta.url)) });
    console.log(`Rendered ${city}.png (1200 × 800)`);
  }
} finally { await browser.close(); }
