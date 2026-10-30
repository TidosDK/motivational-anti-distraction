import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.join(process.cwd(), 'dist');
const ctx = await chromium.launchPersistentContext('/tmp/opencode/madd-dbg6', {
  executablePath: '/usr/bin/brave-browser',
  headless: false,
  args: ['--headless=new', '--disable-extensions-except=' + DIST, '--load-extension=' + DIST, '--no-first-run'],
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);

ctx.on('serviceworker', async (worker) => {
  console.log('sw appears:', worker.url());
  try {
    const client = await ctx.newCDPSession(page); // placeholder
  } catch {}
});

await cdp.send('Target.setDiscoverTargets', { discover: true });
cdp.on('Target.targetCreated', async (t) => {
  if (t.targetInfo.type !== 'service_worker') return;
  const targetId = t.targetInfo.targetId;
  try {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const s = { send: (method, params) => cdp.send(method, { ...params, sessionId }) };
    await s.send('Runtime.enable', {});
    cdp.on('Runtime.exceptionThrown', (e) => {
      console.log('EXCEPTION:', JSON.stringify(e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text, null, 2));
    });
    cdp.on('Runtime.consoleAPICalled', (e) => console.log('CONSOLE:', e.type, e.args.map((a) => a.value ?? a.description).join(' ')));
    console.log('attached to sw');
  } catch (e) {
    console.log('attach failed:', e.message);
  }
});

await page.goto('chrome-extension://fdioniffpenkpocmgfgopceapknlpjhn/options.html');
await page.evaluate(() => chrome.storage.local.set({ wake: Date.now() }));
await new Promise((r) => setTimeout(r, 8000));
await ctx.close();
process.exit(0);
