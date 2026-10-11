import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { seatOverlapsScreen } from '../src/cinema-seats';
import { cameraRoute, interiorLayout, interiorPoint, CAMERA_HEIGHT } from '../src/journey';
import sharp from 'sharp';

test('individual chair overlap rejects side chairs and chairs behind the camera', () => {
  const camera=new THREE.PerspectiveCamera(60,1,.1,100);
  camera.updateMatrixWorld();
  const screen={x:400,y:400,width:200,height:200},matrix=new THREE.Matrix4();
  const box=(x:number,y:number,z:number)=>new THREE.Box3(new THREE.Vector3(x-.2,y-.2,z-.2),new THREE.Vector3(x+.2,y+.2,z+.2));
  expect(seatOverlapsScreen(box(0,0,-5),matrix,camera,screen,1000,1000)).toBe(true);
  expect(seatOverlapsScreen(box(3,0,-5),matrix,camera,screen,1000,1000)).toBe(false);
  expect(seatOverlapsScreen(box(0,-3,-5),matrix,camera,screen,1000,1000)).toBe(false);
  expect(seatOverlapsScreen(box(0,0,5),matrix,camera,screen,1000,1000)).toBe(false);
});

test('real cinema viewpoints select individual chairs, preserving the rest of each row', () => {
  const selections:number[][]=[];
  for(const mobile of [false,true])for(const progress of [1.88,1.94,2,2.1]){
    const width=mobile?393:1280,height=mobile?851:720;
    const camera=new THREE.PerspectiveCamera(mobile?58:44,width/height,.1,200);
    const route=cameraRoute(progress,mobile),layout=interiorLayout(mobile),scale=mobile?.7:1;
    camera.position.fromArray(route.position);camera.lookAt(new THREE.Vector3().fromArray(route.target));camera.updateMatrixWorld();
    const room=new THREE.Matrix4().compose(new THREE.Vector3().fromArray(interiorPoint([layout.cinemaX,0,layout.cinemaZ],mobile)),new THREE.Quaternion(),new THREE.Vector3(scale,scale,scale));
    const topLeft=new THREE.Vector3(-5.865,CAMERA_HEIGHT/scale+3.3,.2).applyMatrix4(room).project(camera);
    const bottomRight=new THREE.Vector3(5.865,CAMERA_HEIGHT/scale-3.3,.2).applyMatrix4(room).project(camera);
    const screen={x:(topLeft.x+1)*width/2,y:(1-topLeft.y)*height/2,width:(bottomRight.x-topLeft.x)*width/2,height:(topLeft.y-bottomRight.y)*height/2+40};
    const hidden:number[]=[];
    for(let row=0;row<7;row++)for(let column=0;column<12;column++){
      const x=(column-5.5)*1.3+(column<6?-.8:.8),z=7+row*2.15;
      const box=new THREE.Box3(new THREE.Vector3(x-.49,.3+row*.07,z-.875),new THREE.Vector3(x+.49,1.47+row*.07,z+.05));
      if(seatOverlapsScreen(box,room,camera,screen,width,height))hidden.push(row*12+column);
    }
    selections.push(hidden);
    expect(hidden.length).toBeLessThan(84);
    for(let row=0;row<7;row++)expect(hidden.filter(index=>Math.floor(index/12)===row).length).toBeLessThan(12);
  }
  expect(selections.some(hidden=>hidden.length>0)).toBe(true);
  expect(new Set(selections.map(hidden=>hidden.join(','))).size).toBeGreaterThan(1);
});

test('cinema playback fades intersecting chairs and restores them on close', async ({page},testInfo) => {
  test.skip(testInfo.project.name!=='chrome','Inspect cinema rendering in desktop Chromium.');
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&/Shader Error|VALIDATE_STATUS|ERROR: 0:/.test(message.text()))errors.push(message.text());});
  await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({contentType:'text/html',body:'<body style="background:#000">Projection</body>'}));
  await page.route('https://www.youtube.com/iframe_api',route=>route.abort());
  await page.goto('./');await expect(page.locator('body')).toHaveClass(/scene-ready/);
  await page.locator('[data-nav=cinema]').click();await page.waitForTimeout(1500);
  const viewport=page.viewportSize()!,route=cameraRoute(2-(2-1.16)*.04,false);
  const expectedWidth=11.73*viewport.height/(2*(route.position[2]-(-101+.2))*Math.tan(44*Math.PI/360));
  const settled=()=>expect.poll(async()=>{
    const width=await page.locator('.cinema-stage').evaluate(element=>parseFloat((element as HTMLElement).style.getPropertyValue('--cinema-width')));
    return Number.isFinite(width)?Math.abs(width-expectedWidth):Infinity;
  },{timeout:15000}).toBeLessThan(1);
  // Pull back towards the cinema entrance, keeping this chapter active.
  await page.evaluate(()=>{
    const cinema=document.getElementById('cinema')!,music=document.getElementById('music')!;
    window.scrollTo({top:cinema.offsetTop-(cinema.offsetTop-music.offsetTop)*.04,behavior:'instant'});
  });
  await settled();await page.waitForTimeout(900);
  const screen=await page.locator('#cinema-screen-player').boundingBox();
  const clip={left:Math.ceil(screen!.x),top:Math.floor(screen!.y+screen!.height)-24,width:Math.floor(screen!.width)-2,height:64};
  const before=await page.screenshot({path:testInfo.outputPath('chairs-before.png')});
  await page.locator('#cinema-play').click();
  await page.evaluate(()=>{
    const cinema=document.getElementById('cinema')!,music=document.getElementById('music')!;
    window.scrollTo({top:cinema.offsetTop-(cinema.offsetTop-music.offsetTop)*.04,behavior:'instant'});
  });
  await settled();await page.waitForTimeout(1000);
  // Temporarily remove the DOM video to inspect the chairs behind it.
  await page.locator('#cinema-screen-player').evaluate(element=>element.style.visibility='hidden');
  const playing=await page.screenshot({path:testInfo.outputPath('chairs-playing.png')});
  await page.locator('#cinema-screen-player').evaluate(element=>element.style.visibility='');
  await page.locator('#cinema-stop').click();await page.waitForTimeout(1800);
  const restored=await page.screenshot({path:testInfo.outputPath('chairs-restored.png')});
  const pixels=await Promise.all([before,playing,restored].map(image=>sharp(image).extract(clip).resize({width:120}).greyscale().raw().toBuffer({resolveWithObject:true})));
  const edges=pixels.map(({data,info:{width,height}})=>{
    const values:number[]=[];
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
      const index=y*width+x;values.push(data[index+1]-data[index-1],data[index+width]-data[index-width]);
    }
    return values;
  });
  const difference=(frame:number)=>edges[0].reduce((sum,value,index)=>sum+Math.abs(value-edges[frame][index]),0)/edges[0].length;
  expect(difference(1)).toBeGreaterThan(1);
  expect(difference(2)).toBeLessThan(difference(1)*.8);
  expect(errors).toEqual([]);
});
