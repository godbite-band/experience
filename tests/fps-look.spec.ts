import { test, expect, type Page } from '@playwright/test';
import * as THREE from 'three';
import { turnFpsView, FpsLookInput } from '../src/first-person';
import { projectLensLight } from '../src/cinematic';

test('cursor warps cannot snap the camera and event bursts do not leave a rotation backlog',()=>{
  const input=new FpsLookInput();
  for(const [x,y] of [[1024,576],[0,-720],[NaN,0],[Infinity,1]])input.add(x,y);
  expect(input.consume(1/60)).toEqual({x:0,y:0});
  for(let i=0;i<100;i++)input.add(50,50);
  const frame=input.consume(1/60);
  expect(frame.x*.0024).toBeLessThan(.27);expect(frame.y*.0024).toBeLessThan(.11);
  expect(input.consume(1/60)).toEqual({x:0,y:0});
  input.add(8,-5);expect(input.consume(1/60)).toEqual({x:8,y:-5});
  input.add(10,10);input.clear();expect(input.consume(1/60)).toEqual({x:0,y:0});
});

test('repeated full turns keep a level horizon and pitch can recover from both limits',()=>{
  let view={yaw:0,pitch:0};
  for(let i=0;i<10000;i++)view=turnFpsView(view.yaw,view.pitch,300,0);
  expect(Math.abs(view.yaw)).toBeLessThanOrEqual(Math.PI);
  const camera=new THREE.PerspectiveCamera();
  camera.quaternion.setFromEuler(new THREE.Euler(view.pitch,view.yaw,0,'YXZ'));
  expect(new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion).y).toBeCloseTo(1);
  view=turnFpsView(view.yaw,view.pitch,0,-1000);expect(view.pitch).toBe(1.35);
  view=turnFpsView(view.yaw,view.pitch,0,562.5);expect(view.pitch).toBeCloseTo(0);
  view=turnFpsView(view.yaw,view.pitch,0,1000);expect(view.pitch).toBe(-1.35);
  view=turnFpsView(view.yaw,view.pitch,0,-562.5);expect(view.pitch).toBeCloseTo(0);
  for(const delta of [NaN,Infinity,-Infinity,100000])expect(turnFpsView(view.yaw,view.pitch,delta,delta)).toEqual(view);
});

test('lens projection stays finite through the camera plane and all viewing directions',()=>{
  const camera=new THREE.PerspectiveCamera(44,1.6,.1,210),light=new THREE.Vector3(0,0,-10);
  for(let i=0;i<=720;i++){
    camera.quaternion.setFromEuler(new THREE.Euler(Math.sin(i)*1.35,i*Math.PI/360,0,'YXZ'));
    camera.updateMatrixWorld();
    const result=projectLensLight(light,camera);
    expect(Number.isFinite(result.position.x)&&Number.isFinite(result.position.y)).toBe(true);
    expect(result.visibility).toBeGreaterThanOrEqual(0);expect(result.visibility).toBeLessThanOrEqual(1);
    expect(Math.max(Math.abs(result.position.x),Math.abs(result.position.y))).toBeLessThanOrEqual(2);
  }
  camera.quaternion.identity();camera.updateMatrixWorld();
  expect(projectLensLight(light,camera).visibility).toBe(1);
  for(const point of [new THREE.Vector3(10,0,0),new THREE.Vector3(0,0,10),camera.position,new THREE.Vector3(NaN,0,0)]){
    const result=projectLensLight(point,camera);expect(result.visibility).toBe(0);
    expect(Number.isFinite(result.position.x)&&Number.isFinite(result.position.y)).toBe(true);
  }
});

async function enterFps(page:Page){
  await page.goto('./#music');await expect(page.locator('body')).toHaveClass(/scene-ready/);
  await page.getByRole('button',{name:'Postać za drzewem'}).click({force:true});
  await expect(page.locator('.forest-secret-hud')).toHaveClass(/is-arrived/);
  for(const [index,digit] of [2,1,3,7].entries())await page.locator('.forest-eye-control').nth(index).press(String(digit));
  await expect(page.locator('body')).toHaveAttribute('data-forest-secret','fps');
  await page.locator('.hunt-menu.is-intro .hunt-primary').click();
  await expect(page.locator('.forest-secret-hud')).toHaveAttribute('data-look-pitch','0');
}

test('unlocked cursor cannot turn the camera; repeatable right drags recover the view',async({page})=>{
  await page.addInitScript(()=>{
    HTMLCanvasElement.prototype.requestPointerLock=()=>Promise.reject(new DOMException('Unavailable','NotSupportedError'));
  });
  await enterFps(page);
  const hud=page.locator('.forest-secret-hud'),yaw=()=>hud.getAttribute('data-look-yaw');
  await expect(hud).toHaveAttribute('data-look-mode','drag');
  const start=await yaw();
  await page.mouse.move(400,300);await page.mouse.move(900,700);
  await expect(hud).toHaveAttribute('data-look-yaw',start!);
  await page.mouse.move(400,300);await page.mouse.down({button:'right'});
  for(let i=1;i<=10;i++){await page.mouse.move(400+i*30,300-i*15);await page.evaluate(()=>new Promise(requestAnimationFrame));}
  await page.mouse.up({button:'right'});
  await expect.poll(yaw).not.toBe(start);
  await expect.poll(async()=>Number(await hud.getAttribute('data-look-pitch'))).toBeCloseTo(.36);
  const turned=await yaw();await page.mouse.move(400,300);
  await expect(hud).toHaveAttribute('data-look-yaw',turned!);
  await page.mouse.down({button:'right'});
  for(let i=1;i<=10;i++){await page.mouse.move(400-i*30,300+i*15);await page.evaluate(()=>new Promise(requestAnimationFrame));}
  await page.mouse.up({button:'right'});
  await expect.poll(async()=>Number(await yaw())).toBeCloseTo(Number(start));
  await expect.poll(async()=>Number(await hud.getAttribute('data-look-pitch'))).toBeCloseTo(0);
  // Losing focus cancels an active drag and held movement keys.
  await page.mouse.down({button:'right'});await page.keyboard.down('KeyW');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.mouse.move(600,100);await page.mouse.up({button:'right'});await page.keyboard.up('KeyW');
  await expect.poll(async()=>Number(await yaw())).toBeCloseTo(Number(start));
  await page.keyboard.press('Escape');await expect(page.locator('body')).toHaveAttribute('data-forest-secret','none');
});

test('locked look stays upright after full turns, pitch reversal, cursor release and recapture',async({page})=>{
  test.setTimeout(60000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await enterFps(page);
  const hud=page.locator('.forest-secret-hud');await expect(hud).toHaveAttribute('data-look-mode','locked');
  const move=async(dx:number,dy:number)=>page.evaluate(async([x,y])=>{
    document.dispatchEvent(new MouseEvent('mousemove',{movementX:x,movementY:y}));await new Promise(requestAnimationFrame);
  },[dx,dy]);
  await move(0,0); // First event after acquiring the cursor establishes its new origin.
  await move(1024,-720);await expect(hud).toHaveAttribute('data-look-pitch','0');
  for(let i=0;i<24;i++)await move(0,-30);
  await expect(hud).toHaveAttribute('data-look-pitch','1.35');
  for(let i=0;i<24;i++)await move(0,25);
  expect(Number(await hud.getAttribute('data-look-pitch'))).toBeLessThan(.1);
  for(let i=0;i<35;i++)await move(120,0);
  expect(Math.abs(Number(await hud.getAttribute('data-look-yaw')))).toBeLessThanOrEqual(Math.PI);
  await move(0,100);await page.keyboard.press('KeyR');await expect(hud).toHaveAttribute('data-look-pitch','0');
  await page.evaluate(()=>document.exitPointerLock());await expect(hud).toHaveAttribute('data-look-mode','drag');
  const yaw=await hud.getAttribute('data-look-yaw');await page.mouse.move(400,300);await page.mouse.move(900,600);
  await expect(hud).toHaveAttribute('data-look-yaw',yaw!);
  await page.mouse.click(640,400);await expect(hud).toHaveAttribute('data-look-mode','locked');
  await move(0,0);await move(50,0);await expect.poll(()=>hud.getAttribute('data-look-yaw')).not.toBe(yaw);
  expect(errors).toEqual([]);
});
