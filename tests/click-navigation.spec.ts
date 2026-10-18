import { test, expect, type Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { cameraRoute, interiorLayout, SCENE_ANCHORS, RECORD_STOPS, forestDoor } from '../src/journey';

async function goToProgress(page:Page,p:number){
  await page.evaluate(({p,anchors})=>{
    const sections=['threshold','music','cinema','live','band','contact'].map(id=>document.getElementById(id)!);
    const i=anchors.findIndex((a,i)=>i<anchors.length-1&&p>=a&&p<anchors[i+1]);
    window.scrollTo({top:sections[i].offsetTop+(sections[i+1].offsetTop-sections[i].offsetTop)*(p-anchors[i])/(anchors[i+1]-anchors[i]),behavior:'instant'});
  },{p,anchors:[...SCENE_ANCHORS]});
  await page.waitForTimeout(1800);
}
function project(page:Page,p:number,point:[number,number,number]){
  const {width,height}=page.viewportSize()!,mobile=width<800,route=cameraRoute(p,mobile);
  const camera=new PerspectiveCamera(mobile?58:44,width/height,.1,210);
  camera.position.fromArray(route.position);camera.lookAt(new Vector3().fromArray(route.target));camera.updateMatrixWorld();
  const v=new Vector3(...point).project(camera);
  return {x:(v.x+1)*width/2,y:(1-v.y)*height/2};
}

test('classic site appears only on the Aristocrats release',async({page})=>{
  await page.goto('./#music');
  await page.locator('[data-release=the-aristocrats]').click();
  const experience=page.getByRole('region',{name:'Experience',exact:true});
  await expect(experience).toBeVisible();
  await expect(experience.getByRole('link',{name:'The Aristocrats classic site'})).toHaveAttribute('href','https://godbite-band.github.io/the-aristocrats/');
  await expect(page.locator('#release-links')).not.toContainText('The Aristocrats classic site');
  expect(await experience.evaluate(el=>Boolean(document.getElementById('release-links')!.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await page.locator('#next-release').click();
  await expect(page.getByRole('link',{name:'The Aristocrats classic site'})).toHaveCount(0);
  await expect(experience).toHaveCount(0);
});

for(const reducedMotion of ['reduce','no-preference'] as const){
test(`empty scene clicks advance, while dragging and dialog clicks do not (${reducedMotion})`,async({page})=>{
  await page.emulateMedia({reducedMotion});
  await page.goto('./');
  if(reducedMotion==='no-preference')await expect(page.locator('body')).toHaveClass(/scene-ready/);
  await page.mouse.click(15,300);
  const step=await page.evaluate(()=>Math.round(innerHeight*.55));
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(step);
  const start=await page.evaluate(()=>scrollY);
  await page.mouse.move(15,300);await page.mouse.down();await page.mouse.move(15,370);await page.mouse.up();
  await page.waitForTimeout(300);expect(await page.evaluate(()=>scrollY)).toBe(start);
  await page.locator('[data-nav=music]').click();
  await page.locator('[data-release=the-aristocrats]').click();
  await page.waitForTimeout(1000);
  const at=await page.evaluate(()=>scrollY);
  await page.locator('#release-title').click();
  await page.waitForTimeout(300);expect(await page.evaluate(()=>scrollY)).toBe(at);
});
}

test('door openings navigate to their next chapter',async({page})=>{
  await page.goto('./');await expect(page.locator('body')).toHaveClass(/scene-ready/);
  const mobile=page.viewportSize()!.width<800,layout=interiorLayout(mobile);
  for(const [p,point,chapter] of [
    [.5,forestDoor(mobile).position,'music'],
    [1.8,[layout.cinemaX,0,layout.origin[2]+layout.exitZ],'cinema'],
    [4.45,[layout.bandX+8,0,layout.origin[2]+layout.bandZ-.45],'contact'],
  ] as [number,[number,number,number],string][]){
    await goToProgress(page,p);
    const click=project(page,p,[point[0],3.5,point[2]]);
    await page.mouse.click(click.x,click.y);
    const destination=await page.locator('#'+chapter).evaluate(el=>Math.min(el.offsetTop,document.documentElement.scrollHeight-innerHeight));
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBeCloseTo(destination,0);
  }
});

test('hovering a neighboring pedestal approaches it without opening a dialog',async({page,isMobile})=>{
  test.skip(isMobile,'Hover is a mouse interaction');
  await page.goto('./#music');await expect(page.locator('body')).toHaveClass(/scene-ready/);
  const p=1.42,layout=interiorLayout(false);
  await goToProgress(page,p);
  const hover=project(page,p,[3*4.4,3.5,layout.origin[2]-1.8]);
  await page.mouse.move(hover.x,hover.y);
  await expect(page.locator('body')).toHaveAttribute('data-current-recording','the-aristocrats');
  const destination=await page.evaluate(({stop,anchors})=>{
    const music=document.getElementById('music')!.offsetTop,cinema=document.getElementById('cinema')!.offsetTop;
    return Math.round(music+(cinema-music)*(stop-anchors[1])/(anchors[2]-anchors[1]));
  },{stop:RECORD_STOPS[3],anchors:[...SCENE_ANCHORS]});
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(destination);
  await expect(page.locator('#release-dialog')).not.toBeVisible();
  await page.waitForTimeout(400);
  expect(await page.evaluate(()=>scrollY)).toBe(destination);
});

test('clicking a neighboring pedestal approaches it and opens its release',async({page,isMobile})=>{
  await page.goto('./#music');await expect(page.locator('body')).toHaveClass(/scene-ready/);
  const p=1.42,mobile=page.viewportSize()!.width<800,layout=interiorLayout(mobile);
  await goToProgress(page,p);
  const click=project(page,p,[3*4.4*layout.scale,3.5,layout.origin[2]-1.8*layout.scale]);
  if(isMobile)await page.touchscreen.tap(click.x,click.y);
  else await page.mouse.click(click.x,click.y);
  await expect(page.locator('#release-dialog')).toBeVisible();
  await expect(page.locator('#release-title')).toHaveText('the Aristocrats');
  const destination=await page.evaluate(({stop,anchors})=>{
    const music=document.getElementById('music')!.offsetTop,cinema=document.getElementById('cinema')!.offsetTop;
    return music+(cinema-music)*(stop-anchors[1])/(anchors[2]-anchors[1]);
  },{stop:RECORD_STOPS[3],anchors:[...SCENE_ANCHORS]});
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeCloseTo(Math.round(destination),0);
});
