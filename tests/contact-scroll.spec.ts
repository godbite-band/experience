import { test, expect } from '@playwright/test';

for(const reducedMotion of ['reduce','no-preference'] as const)for(const viewport of [{width:1280,height:900},{width:1280,height:600}]){
  test(`wheel leaves contact after scrolling its copy at ${viewport.width}x${viewport.height} (${reducedMotion})`,async({page})=>{
    await page.setViewportSize(viewport);
    await page.emulateMedia({reducedMotion});
    await page.goto('./');
    await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
    await expect(page.locator('body')).toHaveAttribute('data-chapter','contact');
    const stage=page.locator('.contact-stage');
    const bounds=await stage.boundingBox();
    await page.mouse.move(bounds!.x+bounds!.width/2,bounds!.y+bounds!.height/2);
    const end=await page.evaluate(()=>scrollY);
    expect(end).toBeGreaterThan(0);

    // Read any overflowing contact copy before returning to the journey.
    await page.mouse.wheel(0,-2000);
    await expect.poll(()=>stage.evaluate(element=>Math.abs(element.scrollHeight-element.clientHeight-element.scrollTop))).toBeLessThanOrEqual(1);
    if(await stage.evaluate(element=>element.scrollHeight>element.clientHeight+1)){
      await page.mouse.wheel(0,2000);
      await expect.poll(()=>stage.evaluate(element=>element.scrollTop)).toBe(0);
    }
    // Return over the same copy region, without moving to the navigation frame.
    await page.mouse.wheel(0,2000);
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBeLessThan(end-100);
    await expect(page.locator('body')).not.toHaveAttribute('data-chapter','contact');
  });
}
