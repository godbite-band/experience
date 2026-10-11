import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ contentType: 'text/html', body: '<body style="margin:0;background:#161a1a;color:white">Video</body>' }));
  await page.route('https://www.youtube.com/iframe_api', route => route.fulfill({ contentType: 'text/javascript', body: `
    window.YT={Player:class {
      constructor(frame,options){this.frame=frame;this.events=options.events;this.state=1;this.time=0;setTimeout(()=>this.events.onReady(),0)}
      playVideo(){this.state=1;this.events.onStateChange()}
      pauseVideo(){this.state=2;this.events.onStateChange()}
      seekTo(time){this.time=time;this.events.onStateChange()}
      getPlayerState(){return this.state}
      getCurrentTime(){return this.time}
      getDuration(){return 120}
      destroy(){this.frame.remove()}
    }};window.onYouTubeIframeAPIReady();
  ` }));
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`cinema controls, film replacement and departure (${reducedMotion})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion }); await page.goto('./');
    await page.locator('[data-nav=cinema]').click(); await page.waitForTimeout(1800);
    await page.locator('#cinema-play').click();
    const player = page.locator('#cinema-screen-player');
    await expect(page.locator('#film-dialog')).not.toBeVisible();
    await expect(player.locator('iframe')).toHaveAttribute('src', /controls=0/);
    await expect(player.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
    await player.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(player.getByRole('button', { name: 'Play film', exact: true })).toBeEnabled();
    await player.getByRole('button', { name: 'Play film', exact: true }).click();
    await expect(player.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
    await player.getByRole('slider').fill('60'); await player.getByRole('slider').dispatchEvent('change');
    await expect(player.locator('.video-time')).toHaveText('1:00 / 2:00');
    await page.locator('#next-film').click();
    await expect(player.locator('iframe')).toHaveAttribute('src', /embed\/KlZBHri5y1Q/);
    await expect(page.locator('iframe')).toHaveCount(1);
    await expect(player.locator('a')).toHaveAttribute('href', 'https://www.youtube.com/watch?v=KlZBHri5y1Q');
    await page.locator('[data-lang=pl]').click();
    await expect(player.getByRole('slider')).toHaveAttribute('aria-label', 'Przewiń film');
    await expect(player.getByRole('button', { name: 'Pauza', exact: true })).toBeEnabled();
    await expect(player.locator('.video-controls')).toBeInViewport();
    const controls=await player.locator('.video-controls').boundingBox();
    const title=await page.locator('.cinema-title-row').boundingBox();
    expect(title!.y).toBeGreaterThanOrEqual(controls!.y+controls!.height);
    await page.screenshot({ path: testInfo.outputPath('cinema-player.png') });
    await page.locator('#cinema-stop').click();
    await expect(page.locator('iframe')).toHaveCount(0); await expect(page.locator('#cinema-play')).toBeFocused();
    await page.locator('#cinema-play').click(); await page.locator('[data-nav=live]').click();
    await expect(page.locator('iframe')).toHaveCount(0);
    await page.locator('#live-play').click();
    await expect(page.locator('#live-screen-player').getByRole('button', { name: 'Pauza', exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('live-player.png') });
  });
}

test('API failure restores native controls and keeps the YouTube link', async ({ page }) => {
  await page.route('https://www.youtube.com/iframe_api', route => route.abort());
  await page.goto('./'); await page.locator('[data-nav=cinema]').click(); await page.locator('#cinema-play').click();
  const player = page.locator('#cinema-screen-player');
  await expect(player.locator('iframe')).toHaveAttribute('src', /controls=1/);
  await expect(player.getByRole('slider')).not.toBeVisible();
  await expect(player.locator('a')).toBeVisible();
  await page.locator('#cinema-stop').click(); await expect(page.locator('iframe')).toHaveCount(0);
});

test('fullscreen includes controls and returns to the scene', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome', 'Desktop Chromium fullscreen support.');
  await page.goto('./'); await page.locator('[data-nav=cinema]').click(); await page.locator('#cinema-play').click();
  const player = page.locator('#cinema-screen-player');
  await player.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('cinema-screen-player');
  await expect(player.locator('.video-controls')).toBeInViewport();
  await player.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id ?? null)).toBeNull();
  await expect(player.locator('iframe')).toHaveCount(1);
});
