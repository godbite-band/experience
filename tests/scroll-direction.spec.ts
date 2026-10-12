import { test, expect } from '@playwright/test';

test('upward wheel advances the journey and downward wheel returns',async({page,isMobile})=>{
  test.skip(isMobile,'Desktop wheel navigation');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('./');
  await page.mouse.move(10,300);
  await page.mouse.wheel(0,-600);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(400);
  const advanced=await page.evaluate(()=>scrollY);
  await page.mouse.wheel(0,300);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeLessThan(advanced-200);
});

test('high-resolution wheel deltas accumulate into continuous frames',async({page,isMobile})=>{
  test.skip(isMobile,'Desktop wheel navigation');
  await page.emulateMedia({reducedMotion:'no-preference'});
  // Isolate input timing from software WebGL rendering in the test browser.
  await page.addInitScript(()=>{
    const getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type:string,...args:any[]):any{
      if(type.includes('webgl'))return null;
      return (getContext as any).call(this,type,...args);
    };
  });
  await page.goto('./');
  await expect(page.locator('body')).toHaveClass(/still-mode/);
  const initial=await page.evaluate(()=>{
    const samples:number[]=[];
    (window as any).wheelSamples=samples;
    (window as any).sampleWheel=true;
    const frame=()=>{
      samples.push(scrollY);
      if((window as any).sampleWheel)requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    for(let i=0;i<24;i++)document.body.dispatchEvent(new WheelEvent('wheel',{deltaY:-25,bubbles:true,cancelable:true}));
    return scrollY;
  });
  expect(initial).toBe(0);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(600);
  const samples=await page.evaluate(()=>{(window as any).sampleWheel=false;return (window as any).wheelSamples as number[];});
  expect(new Set(samples.filter(y=>y>0&&y<600)).size).toBeGreaterThan(4);
  for(let i=1;i<samples.length;i++)expect(samples[i]).toBeGreaterThanOrEqual(samples[i-1]);
  await page.evaluate(async()=>{
    for(let i=0;i<20;i++){
      document.body.dispatchEvent(new WheelEvent('wheel',{deltaY:-.25,bubbles:true,cancelable:true}));
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    }
  });
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(605);
});

test('reversing the wheel cancels its forward tail and menu navigation cancels animation',async({page,isMobile})=>{
  test.skip(isMobile,'Desktop wheel navigation');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('./');
  await page.mouse.move(10,300);
  await page.mouse.wheel(0,-1200);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(100);
  const before=await page.evaluate(()=>scrollY);
  await page.mouse.wheel(0,400);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeLessThan(before-50);
  await page.mouse.wheel(0,-1200);
  await page.locator('[data-nav=contact]').click();
  const destination=await page.locator('#contact').evaluate(element=>element.offsetTop);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(destination);
  await page.waitForTimeout(350);
  expect(await page.evaluate(()=>scrollY)).toBe(destination);
});
