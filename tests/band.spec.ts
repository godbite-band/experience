import {test,expect} from '@playwright/test';

test('band deep link, bilingual lineup, chronology and final contact',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('./#band');
  await expect(page.locator('body')).toHaveAttribute('data-chapter','band');
  expect(await page.locator('main>.chapter').evaluateAll(nodes=>nodes.map(node=>node.id))).toEqual(['threshold','music','cinema','live','band','contact']);
  await expect(page.locator('#chapter-number')).toHaveText('05');await expect(page.locator('.total-chapters')).toHaveText('06');
  await expect(page.locator('[data-nav=band]')).toHaveAttribute('aria-current','location');
  await expect(page.locator('#band-members li')).toHaveCount(5);
  await expect(page.locator('#band-members')).toContainText('Tomasz HoRacy Jurkiewicz');
  await expect(page.locator('.member-role')).toHaveText(['Vocals','Guitar','Guitar','Bass','Drums']);
  const y=await page.evaluate(()=>scrollY);
  await page.locator('#band-history summary').focus();await page.keyboard.press('Enter');
  await expect(page.locator('#band-history')).toHaveAttribute('open','');
  await expect(page.locator('#band-timeline li')).toHaveCount(9);
  await expect(page.locator('#band-timeline')).toContainText('Start unknown · until 2024');
  await expect(page.locator('#band-milestones')).toContainText('2026Social Media Girls');
  await page.locator('[data-lang=pl]').click();
  await expect(page.locator('[data-nav=band]')).toHaveText('Zespół');
  await expect(page.locator('#band-title')).toHaveText('Zespół');
  await expect(page.locator('.member-role')).toHaveText(['Wokal','Gitara','Gitara','Bas','Perkusja']);
  await expect(page.locator('#band-timeline')).toContainText('Początek nieznany · do 2024');
  await expect(page.locator('#band-history')).toHaveAttribute('open','');
  await page.locator('.band-stage').evaluate(panel=>panel.scrollTop=panel.scrollHeight);
  await expect(page.locator('.band-credits .credits-body')).toBeInViewport();
  expect(await page.evaluate(()=>scrollY)).toBe(y);
  await expect(page.locator('#band .credits-manifesto')).toHaveCount(1);
  await expect(page.locator('#contact .credits-manifesto')).toHaveCount(0);
  await page.locator('[data-nav=contact]').click();
  await expect(page.locator('#chapter-number')).toHaveText('06');
  expect(await page.locator('#position-fill').evaluate(node=>node.style.width)).toBe('100%');
  await expect(page.locator('.contact-address>a')).toBeVisible();
  expect(errors).toEqual([]);
});

for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1600,height:1000}]){
  test(`band panel and fallback fit ${viewport.width}x${viewport.height}`,async({page},testInfo)=>{
    await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'});await page.goto('./#band');
    const image=viewport.width<800?'band-mobile':'band';
    await expect(page.locator('#still-world')).toHaveCSS('background-image',new RegExp(image+'\\.webp'));
    expect((await page.request.get('images/'+image+'.webp')).ok()).toBe(true);
    await page.locator('[data-lang=pl]').click();
    await page.evaluate(()=>{
      const nodes=Array.from(document.querySelectorAll<HTMLElement>('p,a,button,h2,h3,li,summary,.eyebrow'));
      const sizes=nodes.map(node=>parseFloat(getComputedStyle(node).fontSize));
      nodes.forEach((node,index)=>node.style.fontSize=sizes[index]*2+'px');
    });
    await expect.poll(()=>page.locator('.band-stage').evaluate(panel=>panel.clientHeight)).toBeGreaterThan(70);
    const panel=await page.locator('.band-stage').boundingBox(),mast=await page.locator('.masthead').boundingBox(),footer=await page.locator('.frame-footer').boundingBox();
    expect(panel!.y).toBeGreaterThanOrEqual(mast!.y+mast!.height);
    expect(panel!.height).toBeGreaterThan(70);
    expect(panel!.y+panel!.height).toBeLessThanOrEqual(footer!.y);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('#band-history summary').focus();await page.keyboard.press('Enter');
    await page.locator('.band-stage').evaluate(panel=>panel.scrollTop=panel.scrollHeight);
    await expect(page.locator('.band-credits .credits-body')).toBeInViewport();
    expect(await page.locator('.band-stage').evaluate(panel=>panel.scrollWidth<=panel.clientWidth+1)).toBe(true);
    await page.screenshot({path:testInfo.outputPath('band-expanded.png')});
  });
}

test('taglines hold, dissolve, share a font and reserve a stable frame',async({page},testInfo)=>{
  test.skip(!testInfo.project.name.includes('chrome'),'Sample the animated WebGL view in Chromium.');
  await page.goto('./');await expect(page.locator('body')).toHaveClass(/scene-ready/);
  const samples=await page.locator('.hero-taglines').evaluate(container=>{
    const lines=Array.from(container.children) as HTMLElement[];
    const animations=lines.map(line=>line.getAnimations()[0]);
    animations.forEach(animation=>animation.pause());
    return [0,6000,7000,8000,14000,15000,16000].map(time=>{
      animations.forEach(animation=>animation.currentTime=time);
      const styles=lines.map(line=>getComputedStyle(line));
      return {opacity:styles.map(style=>Number(style.opacity)),blur:styles.map(style=>style.filter),font:styles.map(style=>style.fontFamily),height:container.getBoundingClientRect().height};
    });
  });
  for(const index of [0,1,6])expect(samples[index].opacity).toEqual([1,0]);
  for(const index of [3,4])expect(samples[index].opacity).toEqual([0,1]);
  expect(samples[2].opacity[0]).toBeCloseTo(.5);expect(samples[2].opacity[1]).toBeCloseTo(.5);
  expect(samples[2].blur[0]).not.toBe('blur(0px)');
  for(const sample of samples){expect(sample.font[0]).toBe(sample.font[1]);expect(sample.height).toBe(samples[0].height);}
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const line of await page.locator('.hero-taglines p').all()){await expect(line).toHaveCSS('animation-name','none');await expect(line).toHaveCSS('opacity','1');}
});

test('dressing room renders without shader errors and stops live playback on arrival',async({page},testInfo)=>{
  test.skip(!testInfo.project.name.includes('chrome'),'Exercise the GPU scene in Chromium.');
  await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({contentType:'text/html',body:'<html>Test concert</html>'}));
  await page.route('https://www.youtube.com/iframe_api',route=>route.fulfill({contentType:'text/javascript',body:''}));
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('./');await expect(page.locator('body')).toHaveClass(/scene-ready/);
  await page.locator('[data-nav=live]').click();await page.locator('#live-play').click();
  await expect(page.locator('#live-screen-player iframe')).toHaveCount(1);
  await page.locator('[data-nav=band]').click();
  await expect(page.locator('#live-screen-player iframe')).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-chapter','band');
  await page.waitForTimeout(1800);await page.screenshot({path:testInfo.outputPath('dressing-room.png')});
  expect(errors).toEqual([]);
  await page.locator('[data-nav=contact]').click();
  await expect.poll(()=>page.locator('body').evaluate(body=>body.style.getPropertyValue('--atmosphere-presence'))).toBe('0');
});

test('WebGL denial preserves the band and keeps both opening taglines static',async({page})=>{
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type:any,...args:any[]){
      if(type==='webgl'||type==='webgl2'||type==='experimental-webgl')return null;
      return original.apply(this,[type,...args] as any);
    } as typeof original;
  });
  await page.goto('./');await expect(page.locator('body')).toHaveClass(/still-mode/);
  for(const line of await page.locator('.hero-taglines p').all()){
    await expect(line).toHaveCSS('animation-name','none');await expect(line).toHaveCSS('opacity','1');
  }
  await page.locator('[data-nav=band]').click();
  await expect(page.locator('#band-members li')).toHaveCount(5);
  await expect(page.locator('#still-world')).toHaveCSS('background-image',/band(-mobile)?\.webp/);
  await page.locator('[data-nav=contact]').click();await expect(page.locator('.contact-address>a')).toBeVisible();
});
