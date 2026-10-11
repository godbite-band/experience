import { test, expect, type CDPSession } from '@playwright/test';

async function swipe(session:CDPSession,from:number,to:number){
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:20,y:from}]});
  for(let i=1;i<=10;i++){
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:20,y:from+(to-from)*i/10}]});
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}

test('Android-style downward swipes retreat without refreshing and upward swipes restore normal scrolling',async({page,context,isMobile,browserName})=>{
  test.skip(!isMobile||browserName!=='chromium','Requires touch-enabled Chromium');
  await page.addInitScript(()=>sessionStorage.setItem('godbite-sound','off'));
  await page.goto('./');
  await expect(page.locator('body')).toHaveClass(/scene-ready/);
  let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  const session=await context.newCDPSession(page),hint=page.locator('#sound-hint');
  try{
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).overscrollBehaviorY)).toBe('none');
  await swipe(session,180,650);
  await expect(hint).toBeVisible();
  await expect.poll(()=>hint.evaluate(element=>parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(16);
  await swipe(session,180,650);
  await expect.poll(()=>hint.evaluate(element=>parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(25);
  expect(await page.evaluate(()=>scrollY)).toBe(0);
  expect(navigations).toBe(0);
  await swipe(session,650,180);await swipe(session,650,180);
  await expect(hint).toBeHidden();
  await swipe(session,650,180);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(100);
  expect(navigations).toBe(0);
  }finally{await session.detach();}
});

test('touch swipes play the Easter Egg and return before native scrolling resumes',async({page,context,isMobile,browserName})=>{
  test.skip(!isMobile||browserName!=='chromium','Requires touch-enabled Chromium');
  test.setTimeout(45000);
  await page.addInitScript(()=>{
    (window as any).secretPhases=[];
    document.addEventListener('DOMContentLoaded',()=>{
      new MutationObserver(()=>{
        (window as any).secretPhases.push(document.body.dataset.easterEgg??'complete');
      }).observe(document.body,{attributes:true,attributeFilter:['data-easter-egg']});
    });
  });
  await page.goto('./');
  await expect(page.locator('body')).toHaveClass(/scene-ready/);
  const session=await context.newCDPSession(page);
  try{
  await swipe(session,180,650);await swipe(session,180,650);
  await expect.poll(()=>page.evaluate(()=>(window as any).secretPhases.includes('playing'))).toBe(true);
  expect(await page.evaluate(()=>scrollY)).toBe(0);
  await expect.poll(()=>page.evaluate(()=>(window as any).secretPhases.includes('returning'))).toBe(true);
  await expect(page.locator('body')).not.toHaveAttribute('data-easter-egg',/playing|fading|returning/);
  await swipe(session,650,180);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(100);
  }finally{await session.detach();}
});
