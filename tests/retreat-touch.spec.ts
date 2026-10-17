import { test, expect, type CDPSession } from '@playwright/test';

async function swipe(session:CDPSession,from:number,to:number,x=20){
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:from}]});
  for(let i=1;i<=10;i++){
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:from+(to-from)*i/10}]});
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}

test('ordinary mobile swipes remain uncancelled for native scrolling',async({page,context,isMobile,browserName})=>{
  test.skip(!isMobile||browserName!=='chromium','Requires touch-enabled Chromium');
  // Isolate browser input from software rendering.
  await page.addInitScript(()=>{
    const getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type:string,...args:any[]):any{
      if(type.includes('webgl'))return null;
      return (getContext as any).call(this,type,...args);
    };
  });
  await page.goto('./');
  await expect(page.locator('body')).toHaveClass(/still-mode/);
  await page.evaluate(()=>window.scrollTo({top:800,behavior:'instant'}));
  const session=await context.newCDPSession(page);
  try{
    await page.evaluate(()=>{
      (window as any).touchMoves=[];
      addEventListener('touchmove',event=>{
        (window as any).touchMoves.push(event.defaultPrevented);
      },{passive:true});
    });
    await swipe(session,650,300);
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(1000);
    const moves=await page.evaluate(()=>(window as any).touchMoves as boolean[]);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every(cancelled=>!cancelled)).toBe(true);
    await page.screenshot({path:'test-results/native-mobile-scroll.png'});
  }finally{await session.detach();}
});

test('Android-style downward swipes retreat without refreshing and upward swipes restore forward navigation',async({page,context,isMobile,browserName})=>{
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

test('mobile contact copy scrolls and allows returning from its top boundary',async({page,context,isMobile,browserName})=>{
  test.skip(!isMobile||browserName!=='chromium','Requires touch-enabled Chromium');
  await page.setViewportSize({width:393,height:600});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('./');
  await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
  await expect(page.locator('body')).toHaveAttribute('data-chapter','contact');
  const stage=page.locator('.contact-stage'),bounds=(await stage.boundingBox())!;
  const rootPosition=await page.evaluate(()=>scrollY);
  const session=await context.newCDPSession(page);
  try{
    await swipe(session,bounds.y+bounds.height-20,bounds.y+20,bounds.x+10);
    await expect.poll(()=>stage.evaluate(element=>element.scrollTop)).toBeGreaterThan(20);
    expect(await page.evaluate(()=>scrollY)).toBe(rootPosition);
    await stage.evaluate(element=>element.scrollTo({top:element.scrollHeight,behavior:'instant'}));
    await swipe(session,bounds.y+20,bounds.y+bounds.height-20,bounds.x+10);
    await expect.poll(()=>stage.evaluate(element=>element.scrollTop)).toBe(0);
    // Keep swiping over CONTACT itself; never use the menu or the frame to escape.
    for(let i=0;i<3;i++)await swipe(session,bounds.y+20,bounds.y+bounds.height-20,bounds.x+10);
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBeLessThan(rootPosition-100);
    await expect(page.locator('body')).not.toHaveAttribute('data-chapter','contact');
  }finally{await session.detach();}
});

test('touch swipes play the Easter Egg and return before forward navigation resumes',async({page,context,isMobile,browserName})=>{
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

test('the first upward swipe advances with native inertia and downward swipe returns',async({page,context,isMobile,browserName})=>{
  test.skip(!isMobile||browserName!=='chromium','Requires touch-enabled Chromium');
  await page.goto('./');
  await expect(page.locator('body')).toHaveClass(/scene-ready/);
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowY)).not.toBe('hidden');
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).touchAction)).toBe('manipulation');
  const session=await context.newCDPSession(page);
  try{
    await swipe(session,650,180);
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(300);
    const advanced=await page.evaluate(()=>scrollY);
    await swipe(session,180,500);
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBeLessThan(advanced-200);
  }finally{await session.detach();}
});
