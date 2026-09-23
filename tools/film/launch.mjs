// One browser for every tool here: $BROWSER_CHANNEL if set (chrome ·
// msedge · chromium), else Playwright's own Chromium, else the Chrome or
// Edge already on the machine.
import { chromium } from 'playwright';

export async function launchBrowser() {
  const tried = [];
  const channels = process.env.BROWSER_CHANNEL ? [process.env.BROWSER_CHANNEL] : ['chromium', 'chrome', 'msedge'];
  for (const channel of channels) {
    try {
      const browser = await chromium.launch(channel === 'chromium' ? {} : { channel });
      if (channel !== 'chromium' || process.env.BROWSER_CHANNEL) console.error(`browser: ${channel} ${browser.version()}`);
      return browser;
    } catch (e) {
      tried.push(`${channel}: ${String(e.message).split('\n')[0]}`);
    }
  }
  throw new Error(`no browser could be launched —\n  ${tried.join('\n  ')}\nInstall one with: npx playwright install chromium`);
}
