import { test, expect } from '@playwright/test';

test('mobile decision labels are readable and touch controls are separated',async({page})=>{
  await page.setViewportSize({width:320,height:568});await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('./');
  for(const selector of ['.main-nav a','.hero-kicker','.hero-poem','.latest-listen','.journey-link','.language-switch button','#credits-button']){
    const sizes=await page.locator(selector).evaluateAll(elements=>elements.map(element=>parseFloat(getComputedStyle(element).fontSize)));
    expect(Math.min(...sizes),selector).toBeGreaterThanOrEqual(12);
  }
  for(const selector of ['.main-nav a','.language-switch button','#sound-toggle','#credits-button','.latest-listen']){
    const heights=await page.locator(selector).evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().height));
    expect(Math.min(...heights),selector).toBeGreaterThanOrEqual(44);
  }
  await page.locator('[data-nav=music]').click();await page.keyboard.press('Escape');
  expect(await page.locator('.track-title').first().evaluate(element=>parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12);
  await page.locator('[data-nav=cinema]').click();
  for(const button of await page.locator('.film-list button').all()){
    await button.focus();await button.click();await expect(button).toHaveAttribute('aria-pressed','true');
    const box=await button.boundingBox(),panel=await page.locator('.cinema-lower').boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.y+box!.height).toBeLessThanOrEqual(panel!.y+panel!.height+1);
  }
  const panel=await page.locator('.cinema-lower').boundingBox(),screen=await page.locator('.cinema-screen-player').boundingBox();
  expect(panel!.y).toBeGreaterThan(screen!.y+screen!.height);
  await page.locator('[data-nav=contact]').click();
  for(const link of await page.locator('.social-links a').all()){
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});
