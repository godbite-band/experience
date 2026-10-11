import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// Compile the complete grading pass: the old seams appeared only in this GPU path,
// not in isolated noise functions. Flat textures make discontinuities measurable.
const source=await readFile(new URL('../src/cinematic.ts',import.meta.url),'utf8');
const film=source.split('const film =')[1];
const fragment=film.match(/`([\s\S]*?)`;/)[1].replace(/#include <[^>]+>/g,'');
for(const [name,args] of [['native',[]],['software',['--enable-unsafe-swiftshader','--use-angle=swiftshader']]]){
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,args});
  try{
    const page=await browser.newPage();
    const jump=await page.evaluate(fragment=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
      const gl=canvas.getContext('webgl');if(!gl)throw new Error('WebGL unavailable');
      const shader=(type,code)=>{
        const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);
        if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const program=gl.createProgram();
      gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 position;varying vec2 vUv;void main(){vUv=(position+1.)/2.;gl_Position=vec4(position,0.,1.);}'));
      gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision highp float;'+fragment));
      gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
      const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      for(const [unit,name,pixel] of [[0,'uScene',[100,100,100,255]],[1,'uGlow',[0,0,0,255]],[2,'uMist',[0,0,0,255]]]){
        gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(pixel));
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
        gl.uniform1i(gl.getUniformLocation(program,name),unit);
      }
      gl.uniform2f(gl.getUniformLocation(program,'uPixel'),1/512,1/512);
      gl.uniform2f(gl.getUniformLocation(program,'uLight'),.5,.4);
      gl.uniform1f(gl.getUniformLocation(program,'uAspect'),1);
      gl.uniform1f(gl.getUniformLocation(program,'uAtmosphere'),1);
      gl.drawArrays(gl.TRIANGLES,0,3);
      const pixels=new Uint8Array(512*512*4);gl.readPixels(0,0,512,512,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let maximum=0;
      for(let y=0;y<511;y++)for(let x=0;x<511;x++){
        const i=(y*512+x)*4;
        maximum=Math.max(maximum,Math.abs(pixels[i]-pixels[i+4]),Math.abs(pixels[i]-pixels[i+512*4]));
      }
      if(!pixels.some(value=>value>0&&value<255))throw new Error('Grading was not rendered');
      return maximum/255;
    },fragment);
    assert(jump<.04,`${name}: discontinuous fog noise (${jump})`);
    console.log(`${name}: maximum neighboring grading change ${jump.toFixed(4)}`);
  }finally{await browser.close();}
}
