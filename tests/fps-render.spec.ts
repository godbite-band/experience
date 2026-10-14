import { test, expect, chromium } from '@playwright/test';
import { buildSync } from 'esbuild';

const harness=buildSync({stdin:{contents:`
  import {World} from './src/world';
  import * as THREE from 'three';
  window.THREE=THREE;
  window.w=new World({canvas:document.querySelector('canvas'),onFailure:()=>{throw Error('WebGL context lost')},onRelease:()=>{}});
  w.setProgress(1.42);
  document.querySelector('button').onclick=()=>w.setForestSecretMode('fps');
`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',define:{'import.meta.env.DEV':'true','import.meta.env.BASE_URL':'"/experience/"'}}).outputFiles[0].text;

for(const software of [false,true]){
  test(`actual mouse turns render finite frames, and broken effects cannot hide the world (${software?'software':'native GPU'})`,async({baseURL})=>{
    test.setTimeout(60000);
    const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args:software?['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-gpu-sandbox']:[]});
    try{
      const page=await browser.newPage({viewport:{width:1280,height:800}}),errors:string[]=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/render-test?capture=1',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0"><canvas></canvas><button style="position:fixed;top:0;left:0">Play</button></body>'}));
      await page.goto(new URL('render-test?capture=1',baseURL).href);await page.addScriptTag({content:harness});
      await page.getByRole('button',{name:'Play',exact:true}).click();
      await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(true);
      for(let i=0;i<24;i++){
        await page.mouse.move(640+i*55,400+Math.sin(i*.7)*130);
        await page.evaluate(()=>new Promise(requestAnimationFrame));
      }
      const frame=await page.evaluate(()=>{
        const w=(window as any).w,r=w.renderer,gl=r.getContext(),errors=[];
        for(const name of ['source','glowX','glowY','mist']){
          const target=w.lens[name];r.setRenderTarget(target);
          const data=new Float32Array(32*32*4);gl.readPixels(Math.floor(target.width/2)-16,Math.floor(target.height/2)-16,32,32,gl.RGBA,gl.FLOAT,data);
          if(data.some(value=>!Number.isFinite(value)))errors.push(name);
        }
        r.setRenderTarget(null);return {errors,glError:gl.getError(),pitch:w.fpsPitch,yaw:w.fpsYaw};
      });
      expect(frame.errors).toEqual([]);expect(frame.glError).toBe(0);
      // Simulate a Windows pointer-lock recentering event, then render a frame.
      const before=await page.locator('.forest-secret-hud').getAttribute('data-look-pitch');
      await page.evaluate(async()=>{document.dispatchEvent(new MouseEvent('mousemove',{movementX:1024,movementY:-720}));await new Promise(requestAnimationFrame);});
      await expect(page.locator('.forest-secret-hud')).toHaveAttribute('data-look-pitch',before!);
      const fault=await page.evaluate(()=>{
        const w=(window as any).w,T=(window as any).THREE;
        // These are GPU texture values, not a mocked renderer. Old compositing
        // spread NaN/Infinity across the final frame and erased valid geometry.
        const bad=new T.DataTexture(new Float32Array([NaN,Infinity,NaN,NaN]),1,1,T.RGBAFormat,T.FloatType);bad.needsUpdate=true;
        w.lens.grade.uniforms.uMist.value=bad;w.lens.grade.uniforms.uGlow.value=bad;
        w.fpsYaw=0;w.fpsPitch=0;w.fpsLookInput.clear();w.draw();
        const gl=w.renderer.getContext(),data=new Uint8Array(128*128*4);
        gl.readPixels(Math.floor(gl.drawingBufferWidth/2)-64,Math.floor(gl.drawingBufferHeight/2)-64,128,128,gl.RGBA,gl.UNSIGNED_BYTE,data);
        let sum=0,peak=0;for(let i=0;i<data.length;i+=4){sum+=data[i]+data[i+1]+data[i+2];peak=Math.max(peak,data[i],data[i+1],data[i+2]);}
        return {mean:sum/(128*128*3),peak,error:gl.getError()};
      });
      expect(fault.error).toBe(0);expect(fault.mean).toBeGreaterThan(5);expect(fault.peak).toBeGreaterThan(30);
      expect(errors).toEqual([]);
    }finally{await browser.close();}
  });
}
