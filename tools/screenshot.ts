import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iterNum = parseInt(process.argv[2] ?? '0', 10);
const outDir = path.resolve(__dirname, '..', 'out');
const stateDir = path.resolve(__dirname, '..', 'state');

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(stateDir, { recursive: true });

const outFile = path.join(outDir, `iter_${String(iterNum).padStart(2, '0')}.png`);

const GPU_ARGS = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan',
  '--enable-gpu',
  '--disable-gpu-sandbox',
];

async function tryLaunch() {
  // Try system Chrome headed (WebGPU needs GPU access)
  try {
    console.log('Trying system Chrome (headed for GPU)...');
    return await chromium.launch({
      channel: 'chrome',
      headless: false,
      args: GPU_ARGS,
    });
  } catch (e) {
    console.log('System Chrome failed:', (e as Error).message);
  }

  // Try system Edge headed
  try {
    console.log('Trying system Edge (headed for GPU)...');
    return await chromium.launch({
      channel: 'msedge',
      headless: false,
      args: GPU_ARGS,
    });
  } catch (e) {
    console.log('System Edge failed:', (e as Error).message);
  }

  // Last resort: bundled Chromium headed
  console.log('Trying bundled Chromium (headed)...');
  return await chromium.launch({
    headless: false,
    args: [...GPU_ARGS, '--use-vulkan'],
  });
}

async function capture() {
  const browser = await tryLaunch();

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await ctx.newPage();

  // Log console messages
  page.on('console', msg => console.log(`[browser ${msg.type()}]`, msg.text()));
  page.on('pageerror', err => console.error('[browser error]', err));

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });

  // Hide UI elements for clean screenshot
  await page.evaluate(() => document.body.classList.add('screenshot-mode'));

  // Wait for readiness (static render, should be immediate)
  try {
    await page.waitForFunction('window.__simReady === true', { timeout: 15000 });
    await page.waitForTimeout(500); // brief settle
  } catch {
    console.log('Readiness signal not received, taking screenshot anyway after delay...');
    await page.waitForTimeout(3000);
  }

  await page.screenshot({ path: outFile, type: 'png' });
  console.log(`Screenshot saved to ${outFile}`);

  await browser.close();
}

capture().catch((err) => {
  console.error('Screenshot failed:', err);
  process.exit(1);
});
