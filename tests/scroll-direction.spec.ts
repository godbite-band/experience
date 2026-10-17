import { test, expect } from '@playwright/test';

test('native wheel direction advances down and returns up',async({page,isMobile})=>{
  test.skip(isMobile,'Desktop wheel navigation');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('./');
  await page.mouse.move(10,300);
  await page.mouse.wheel(0,600);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(400);
  const advanced=await page.evaluate(()=>scrollY);
  await page.mouse.wheel(0,-300);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeLessThan(advanced-200);
});

test('high-resolution wheel, horizontal gestures and zoom are not intercepted',async({page})=>{
  await page.goto('./');
  await page.evaluate(()=>window.scrollTo({top:800,behavior:'instant'}));
  const cancelled=await page.evaluate(()=>[
    {deltaY:.25},{deltaY:120},{deltaY:-120},{deltaX:100,deltaY:2},{deltaY:20,ctrlKey:true}
  ].map(options=>{
    const event=new WheelEvent('wheel',{...options,bubbles:true,cancelable:true});
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  }));
  expect(cancelled).toEqual([false,false,false,false,false]);
  // Synthetic events have no native default action: JS must not create a tail.
  await page.waitForTimeout(250);
  expect(await page.evaluate(()=>scrollY)).toBe(800);
});

test('menu navigation remains at its destination after wheel input',async({page,isMobile})=>{
  test.skip(isMobile,'Desktop wheel navigation');
  await page.goto('./');
  await page.mouse.move(10,300);
  await page.mouse.wheel(0,1200);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(100);
  await page.locator('[data-nav=contact]').click();
  const destination=await page.locator('#contact').evaluate(element=>element.offsetTop);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(destination);
  await page.waitForTimeout(350);
  expect(await page.evaluate(()=>scrollY)).toBe(destination);
});