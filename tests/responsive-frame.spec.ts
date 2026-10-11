import { test, expect } from '@playwright/test';

for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:600}]){
  for(const enlarged of [false,true]){
    test(`copy clears the frame at ${viewport.width}x${viewport.height}, enlarged=${enlarged}`,async({page})=>{
      await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'});
      await page.addInitScript(()=>{
        const Native=window.AudioContext;
        if(Native)window.AudioContext=class extends Native{resume():Promise<void>{return new Promise(()=>{});}};
      });
      await page.goto('./');await page.locator('[data-lang=pl]').click();
      if(enlarged)await page.evaluate(()=>{
        const elements=Array.from(document.querySelectorAll<HTMLElement>('p,a,button,h2,.eyebrow'));
        const sizes=elements.map(element=>parseFloat(getComputedStyle(element).fontSize));
        elements.forEach((element,index)=>element.style.fontSize=sizes[index]*2+'px');
      });
      if(viewport.width<=800)await expect.poll(()=>page.evaluate(()=>{
        const credits=document.querySelector('.footer-controls')!.getBoundingClientRect();
        const navigation=document.querySelector('.main-nav')!.getBoundingClientRect();
        return navigation.top-credits.bottom;
      })).toBeGreaterThanOrEqual(8);
      const heading=page.locator('.hero-heading'),lower=page.locator('.hero-lower');
      const head=await heading.boundingBox(),actions=await lower.boundingBox();
      expect(head!.y+head!.height).toBeLessThanOrEqual(actions!.y-12);
      const invitation=await page.locator('#sound-hint').boundingBox();
      if(invitation)expect(invitation.y+invitation.height).toBeLessThanOrEqual(actions!.y-8);
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
