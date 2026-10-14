import { test, expect } from '@playwright/test';
import { firstPersonLayout } from '../src/first-person';

for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
  test(`the watcher reveals four usable eyes and unlocks FPS (${viewport.width}px)`,async({page})=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.addInitScript(()=>localStorage.setItem('godbite-language','en'));
    await page.goto('./#music');
    await expect(page.locator('body')).toHaveClass(/scene-ready/);
    const watcher=page.getByRole('button',{name:'Postać za drzewem'});
    await expect(watcher).toBeVisible();
    // The watcher moves very slightly while peeking; select its tracked hit area.
    await watcher.click({force:true});
    await expect(page.locator('.forest-secret-hud')).toHaveClass(/is-arrived/);
    await expect(page.locator('.forest-secret-invocation')).toHaveCount(0);
    await expect(page.locator('.forest-secret-gesture')).toHaveText('Touch an eye to shift the unholy cipher');
    expect(await page.locator('.forest-secret-gesture').evaluate(element=>parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(10);
    const eyes=page.locator('.forest-eye-control');await expect(eyes).toHaveCount(4);
    const boxes=await Promise.all((await eyes.all()).map(eye=>eye.boundingBox()));
    expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);expect(boxes[2]!.x).toBeLessThan(boxes[3]!.x);
    expect(boxes[0]!.y).toBeLessThan(boxes[2]!.y);expect(boxes[1]!.y).toBeLessThan(boxes[3]!.y);
    for(const eye of await eyes.all()){
      const box=await eye.boundingBox();expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width);
    }
    const first=eyes.nth(0);
    await first.press('9');await first.click();await expect(first).toHaveAttribute('data-digit','0');
    await first.press('ArrowDown');await expect(first).toHaveAttribute('data-digit','9');
    await first.press('ArrowUp');await expect(first).toHaveAttribute('data-digit','0');
    // The old column order (2 3 / 1 7) must no longer unlock the room.
    for(const [index,digit] of [2,3,1,7].entries())await eyes.nth(index).press(String(digit));
    await expect(page.locator('body')).toHaveAttribute('data-forest-secret','eyes');
    for(const eye of await eyes.all())await eye.press('0');
    for(const [index,digit] of [2,1,3,7].entries()){
      for(let click=0;click<digit;click++)await eyes.nth(index).click();
    }
    await expect(page.locator('body')).toHaveAttribute('data-forest-secret','fps');
    await expect(page.locator('.forest-secret-crosshair')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).toHaveAttribute('data-forest-secret','none');
    await expect(watcher).toBeVisible();await watcher.click({force:true});
    await expect(page.locator('body')).toHaveAttribute('data-forest-secret','fps');
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });
}

test('FPP walks through every scene and returns all the way to the forest',async({page},testInfo)=>{
  test.setTimeout(90000);
  await page.setViewportSize({width:1280,height:800});
  await page.goto('./#music');await expect(page.locator('body')).toHaveClass(/scene-ready/);
  await page.getByRole('button',{name:'Postać za drzewem'}).click({force:true});
  await expect(page.locator('.forest-secret-hud')).toHaveClass(/is-arrived/);
  for(const [index,digit] of [2,1,3,7].entries())await page.locator('.forest-eye-control').nth(index).press(String(digit));
  const body=page.locator('body'),hud=page.locator('.forest-secret-hud');
  await expect(body).toHaveAttribute('data-fps-room','gallery');
  const layout=firstPersonLayout(false);
  const coordinate=async(axis:'x'|'z')=>Number(await hud.getAttribute('data-player-'+axis));
  const alignX=async(target:number)=>{
    const start=await coordinate('x'),key=start<target?'KeyD':'KeyA';
    await page.keyboard.down(key);
    try{
      await expect.poll(async()=>key==='KeyD'?(await coordinate('x'))>=target-.3:(await coordinate('x'))<=target+.3,{timeout:12000,intervals:[50]}).toBe(true);
    }finally{await page.keyboard.up(key);}
  };
  const walkToZ=async(target:number)=>{
    const forward=(await coordinate('z'))>target,key=forward?'KeyW':'KeyS';
    await page.keyboard.down('ShiftLeft');await page.keyboard.down(key);
    try{await expect.poll(async()=>forward?(await coordinate('z'))<=target:(await coordinate('z'))>=target,{timeout:12000,intervals:[50]}).toBe(true);}
    finally{await page.keyboard.up(key);await page.keyboard.up('ShiftLeft');}
  };
  const passDoor=async(id:string)=>{
    const door=layout.doors.find(item=>item.id===id)!;
    await alignX(door.position[0]);
    const key=door.direction===-1?'KeyW':'KeyS';
    await page.keyboard.down('ShiftLeft');await page.keyboard.down(key);
    try{await expect.poll(()=>body.getAttribute('data-fps-room'),{timeout:12000,intervals:[50]}).toBe(door.destination);}
    finally{await page.keyboard.up(key);await page.keyboard.up('ShiftLeft');}
    await expect(hud).not.toHaveClass(/is-crossing/);
    if(process.env.FPP_CAPTURE==='1')await page.screenshot({path:testInfo.outputPath(id+'.png')});
  };
  await passDoor('gallery-cinema');
  // Walk down the central aisle, then turn toward the opening beside the screen.
  await walkToZ(layout.doors.find(door=>door.id==='cinema-live')!.position[2]+4);
  await passDoor('cinema-live');await passDoor('live-band');await passDoor('band-signal');
  await passDoor('signal-band');
  await expect(body).toHaveAttribute('data-fps-room','band');
  await expect(page.locator('.fps-room-label')).toContainText(/Dressing room|Garderoba/);
  await walkToZ(layout.doors.find(door=>door.id==='band-live')!.position[2]-4);
  await passDoor('band-live');
  await walkToZ(layout.doors.find(door=>door.id==='live-cinema')!.position[2]-6);
  await passDoor('live-cinema');
  await walkToZ(layout.doors.find(door=>door.id==='cinema-live')!.position[2]+4);
  await passDoor('cinema-gallery');
  await expect(body).toHaveAttribute('data-fps-room','gallery');
});
