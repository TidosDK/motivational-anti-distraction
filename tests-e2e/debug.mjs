import { launchBrave, sleep } from './helpers.mjs';

const { ctx, seed, readStorage } = await launchBrave();
ctx.on('serviceworker', (w) => console.log('sw event:', w.url().slice(0, 70)));

await seed({
  settings: {
    version: 1,
    sites: [{ domain: 'example.com', limitMin: null, passes: 1 }],
    combinedBudgetMin: 120,
    resetHour: 5,
  },
});
await sleep(3000);
console.log('storage after seed:', await readStorage(['state', 'swTrace', 'activeSession']));
const page = await ctx.newPage();
await page.goto('https://example.com');
await sleep(8000);
console.log('storage after 8s on example.com:', await readStorage(['state', 'swTrace', 'activeSession']));
await ctx.close();
process.exit(0);
