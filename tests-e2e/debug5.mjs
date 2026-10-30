import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.join(process.cwd(), 'dist');
const ctx = await chromium.launchPersistentContext('/tmp/opencode/madd-dbg5', {
  executablePath: '/usr/bin/brave-browser',
  headless: false,
  args: ['--headless=new', '--disable-extensions-except=' + DIST, '--load-extension=' + DIST, '--no-first-run'],
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Target.setDiscoverTargets', { discover: true });
cdp.on('Target.targetCreated', (t) => console.log('target created:', t.targetInfo.type, t.targetInfo.url.slice(0, 90)));
cdp.on('Target.targetInfoChanged', (t) => {
  if (t.targetInfo.type === 'service_worker') console.log('sw changed:', t.targetInfo.url.slice(0, 90), t.targetInfo.attachments?.length ?? '');
});
const targets = await cdp.send('Target.getTargets');
console.log('existing targets:');
for (const t of targets.targetInfos) console.log(' -', t.type, t.url.slice(0, 90));
await new Promise((r) => setTimeout(r, 8000));
const targets2 = await cdp.send('Target.getTargets');
console.log('targets after 8s:');
for (const t of targets2.targetInfos) console.log(' -', t.type, t.url.slice(0, 90));
await ctx.close();
process.exit(0);
