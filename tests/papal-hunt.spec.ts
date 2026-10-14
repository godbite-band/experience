import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { HuntProgress, HUNT_FACTS, huntPlacements } from '../src/hunt-data';
import { firstPersonLayout } from '../src/first-person';
import { readHuntMidi } from '../src/hunt-audio';

test('ten distinct rewards, duplicate impacts and a fresh replay',()=>{
  const progress=new HuntProgress(()=>.37),facts=new Set<string>();
  for(const mask of huntPlacements(false)){
    const reward=progress.claim(mask.id)!;facts.add(reward.fact.id);
    expect(progress.claim(mask.id)).toBeNull();
  }
  expect(progress.complete).toBe(true);expect(progress.found.size).toBe(10);expect(facts.size).toBe(10);
  expect(progress.claim('unknown')).toBeNull();progress.reset();expect(progress.complete).toBe(false);expect(progress.found.size).toBe(0);
  expect(HUNT_FACTS.filter(fact=>fact.id==='prime')).toHaveLength(1);
  for(let divisor=2;divisor<=Math.sqrt(2137);divisor++)expect(2137%divisor).not.toBe(0);
});

test('two masks per room fit both layouts and the MIDI music has finite, playable notes',()=>{
  for(const mobile of [true,false]){
    const {rooms}=firstPersonLayout(mobile),masks=huntPlacements(mobile);
    for(const [name,room] of Object.entries(rooms)){
      expect(masks.filter(mask=>mask.room===name)).toHaveLength(2);
      for(const mask of masks.filter(mask=>mask.room===name)){
        expect(mask.position[0]).toBeGreaterThan(room.minX);expect(mask.position[0]).toBeLessThan(room.maxX);
        expect(mask.position[2]).toBeGreaterThan(room.minZ);expect(mask.position[2]).toBeLessThan(room.maxZ);
      }
    }
  }
  const file=readFileSync(new URL('../public/audio/fpp.mid',import.meta.url));
  const midi=readHuntMidi(Uint8Array.from(file).buffer);
  expect(midi.notes.length).toBeGreaterThan(100);expect(midi.duration).toBeGreaterThan(30);
  expect(midi.notes.every(note=>Number.isFinite(note.time+note.duration)&&note.note>=0&&note.note<=127&&note.duration>0&&note.channel!==9)).toBe(true);
});

// Compile the real world into an isolated test page: no production debug hooks.
const harness=buildSync({stdin:{contents:"import {World} from './src/world';import * as THREE from 'three';window.huntThree=THREE;window.createHuntWorld=()=>{const w=new World({canvas:document.querySelector('canvas'),onFailure:()=>{throw Error('WebGL failed')},onRelease:()=>{},onHuntHit:()=>window.hitSounds=(window.hitSounds||0)+1});window.huntWorld=w;w.setProgress(1.42);w.setForestSecretMode('fps');};",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',define:{'import.meta.env.DEV':'true','import.meta.env.BASE_URL':'"/experience/"'}}).outputFiles[0].text;

for(const mobile of [false,true]){
  test(`real stones collect all ten masks; pause, exit and replay work (${mobile?'mobile':'desktop'})`,async({page})=>{
    test.setTimeout(60000);
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize(mobile?{width:390,height:844}:{width:1280,height:800});
    await page.route('**/hunt-test?capture=1',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="pl"><body style="margin:0;background:#020306"><canvas style="position:fixed;inset:0"></canvas></body></html>'}));
    await page.goto('./hunt-test?capture=1');
    await page.addStyleTag({content:readFileSync(new URL('../src/style.css',import.meta.url),'utf8')});
    await page.addScriptTag({content:harness});
    await page.evaluate('window.createHuntWorld()');
    await expect.poll(()=>page.evaluate('Boolean(window.huntWorld.hunt.alpha)')).toBe(true);
    const hud=page.locator('.forest-secret-hud');await expect(hud).toHaveAttribute('data-hunt-score','0');
    await page.keyboard.press('KeyP');await expect(page.locator('.hunt-menu')).toBeVisible();
    await page.getByRole('button',{name:'Kontynuuj',exact:true}).click();await expect(page.locator('.hunt-menu')).toBeHidden();
    for(let index=0;index<10;index++){
      // Aim from an accessible spot a few steps in front, using the same shot path as a click.
      const shot=await page.evaluate((i)=>{
        const w=(window as any).huntWorld,mask=w.hunt.masks[i];w.enterFpsRoom(mask.userData.fpsRoom);
        w.fpsPosition.copy(mask.position);w.fpsPosition.z+=3;w.fpsPosition.y=3.5;
        const d=mask.position.clone().sub(w.fpsPosition);w.fpsYaw=Math.atan2(-d.x,-d.z);w.fpsPitch=Math.atan2(d.y,Math.hypot(d.x,d.z));
        w.draw();w.shotCooldown=0;w.shootStone();
        if(i===0){w.shotCooldown=0;w.shootStone();} // Two stones in flight may only award one point.
        return {obstructions:w.raycaster.intersectObjects(w.stoneTargets(),false).slice(0,4).map((h:any)=>({type:h.object.geometry.type,distance:h.distance,name:h.object.name})),expected:mask.userData.huntMask,actual:w.flyingStones.at(-1)?.maskId,score:w.hunt.progress.found.size};
      },index);
      expect(shot.actual,`Mask ${shot.expected} must be reachable: ${JSON.stringify(shot.obstructions)}`).toBe(shot.expected);
      expect(shot.score).toBe(index); // Scoring waits for the stone, not the mouse press.
      await expect(hud).toHaveAttribute('data-hunt-score',String(index+1));
      await expect(page.locator('.hunt-fact strong')).toHaveText('CZY WIESZ, ŻE:');
    }
    await expect(page.locator('.hunt-menu.is-complete')).toBeVisible();
    await expect(page.getByRole('heading',{name:'Gratulacje!'})).toBeVisible();
    expect(await page.evaluate('window.hitSounds')).toBe(10);
    await page.getByRole('button',{name:'Zagraj ponownie',exact:true}).click();await expect(hud).toHaveAttribute('data-hunt-score','0');
    await page.keyboard.press('KeyP');await page.getByRole('button',{name:'Wróć do experience ↗',exact:true}).click();
    await expect(page.locator('body')).toHaveAttribute('data-forest-secret','none');
    expect(await page.evaluate('(window.huntWorld.hunt.group.visible)')).toBe(false);
    expect(errors).toEqual([]);
  });
}


test('misses follow gravity and spin, then rest on a surface; walls cannot suspend rocks',async({page})=>{
  await page.route('**/hunt-physics?capture=1',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="pl"><body><canvas></canvas></body></html>'}));
  await page.goto('./hunt-physics?capture=1');await page.addScriptTag({content:harness});
  const result=await page.evaluate(()=>{
    (window as any).createHuntWorld();
    const w=(window as any).huntWorld,T=(window as any).huntThree;
    cancelAnimationFrame(w.frame);
    const realGroundSolid=w.stoneTargets().includes(w.terrain.children[0]);
    // Isolate the real projectile system with a large floor and an ordinary opaque wall.
    for(const root of [w.terrain,w.forest,w.ritual,w.cinema,w.live,w.band,w.signal,w.fpsPassages,w.hunt.group])root.clear();
    const floor=new T.Mesh(new T.PlaneGeometry(400,400),new T.MeshBasicMaterial());floor.rotation.x=-Math.PI/2;
    w.scene.add(w.terrain);w.terrain.add(floor);w.terrain.visible=true;
    w.camera.position.set(0,3.5,0);w.camera.rotation.set(0,0,0);w.camera.updateMatrixWorld(true);
    w.scene.updateMatrixWorld(true);w.shotCooldown=0;w.shootStone();
    const stone=w.firedStones.at(-1),flight=w.flyingStones.at(-1),initial=stone.position.clone(),rotation=stone.quaternion.clone(),vy=flight.velocity.y;
    w.updateStones(.2,performance.now());
    const curved=stone.position.y<initial.y+vy*.2-.1,spinning=rotation.angleTo(stone.quaternion)>.1;
    const advance=()=>{for(let i=0;i<360&&w.flyingStones.length;i++)w.updateStones(1/60,performance.now());};
    advance();stone.updateMatrixWorld(true);
    const bottom=new T.Box3().setFromObject(stone.children[0],true).min.y,settled=w.flyingStones.length===0;
    const wall=new T.Mesh(new T.BoxGeometry(30,15,.3),new T.MeshBasicMaterial());wall.position.set(0,7,-5);w.terrain.add(wall);w.scene.updateMatrixWorld(true);
    // Transparent atmospheric planes may not masquerade as a solid collision.
    const veil=new T.Mesh(new T.PlaneGeometry(30,15),new T.MeshBasicMaterial({transparent:true,opacity:.95}));veil.position.set(0,7,-2);w.terrain.add(veil);w.scene.updateMatrixWorld(true);
    w.shotCooldown=0;w.shootStone();const second=w.firedStones.at(-1);advance();second.updateMatrixWorld(true);
    return {realGroundSolid,curved,spinning,settled,bottom,wallBottom:new T.Box3().setFromObject(second.children[0],true).min.y,wallSettled:w.flyingStones.length===0,veilIsSolid:w.stoneTargets().includes(veil),finite:w.firedStones.every((s:any)=>s.position.toArray().every(Number.isFinite))};
  });
  expect(result.realGroundSolid).toBe(true);expect(result.curved).toBe(true);expect(result.spinning).toBe(true);expect(result.finite).toBe(true);
  expect(result.settled).toBe(true);expect(result.bottom).toBeCloseTo(.006,3);
  expect(result.wallSettled).toBe(true);expect(result.wallBottom).toBeCloseTo(.006,3);expect(result.veilIsSolid).toBe(false);
});
