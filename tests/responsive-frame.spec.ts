import { test, expect } from '@playwright/test';

for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:600}]){
  for(const enlarged of [false,true]){
    test(`copy clears the frame at ${viewport.width}x${viewport.height}, enlarged=${enlarged}`,async({page})=>{
      await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'});
      await page.goto('./');await page.locator('[data-lang=pl]').click();
      if(enlarged)await page.evaluate(()=>{
        const elements=Array.from(document.querySelectorAll<HTMLElement>('p,a,button,h2,.eyebrow'));
        const sizes=elements.map(element=>parseFloat(getComputedStyle(element).fontSize));
        elements.forEach((element,index)=>element.style.fontSize=sizes[index]*2+'px');
      });
      const heading=page.locator('.hero-heading'),lower=page.locator('.hero-lower');
      const head=await heading.boundingBox(),actions=await lower.boundingBox();
      expect(head!.y+head!.height).toBeLessThanOrEqual(actions!.y-12);
      const credits=await page.locator('#credits-button').boundingBox(),nav=await page.locator('.main-nav').boundingBox();
      if(viewport.width<=800)expect(credits!.y+credits!.height).toBeLessThanOrEqual(nav!.y-8);
      await page.locator('.latest-listen').focus();
      const latest=await page.locator('.latest-listen').boundingBox();
      const stage=await page.locator('.hero-stage').boundingBox();
      expect(latest!.y).toBeGreaterThanOrEqual(stage!.y);expect(latest!.y+latest!.height).toBeLessThanOrEqual(stage!.y+stage!.height+1);
      await page.locator('[data-nav=contact]').click();
      const label=await page.locator('.contact-body>.eyebrow').boundingBox(),title=await page.locator('#contact-title').boundingBox();
      expect(label!.y+label!.height).toBeLessThanOrEqual(title!.y-8);
      for(const selector of ['.contact-address>a','.press-downloads a:last-child','#social-links a:last-child']){
        await page.locator(selector).focus();
        const item=await page.locator(selector).boundingBox(),container=await page.locator('.contact-stage').boundingBox();
        expect(item!.y).toBeGreaterThanOrEqual(container!.y-1);
        expect(item!.y+item!.height).toBeLessThanOrEqual(container!.y+container!.height+1);
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    });
  }
}
