import * as THREE from 'three';
import { asset } from './content';
import { HuntProgress, huntPlacements } from './hunt-data';
import type { FpsRoom } from './first-person';

export class PapalHunt {
  readonly group=new THREE.Group();
  readonly progress=new HuntProgress();
  readonly masks:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>[]=[];
  private alpha:{data:Uint8ClampedArray;width:number;height:number}|null=null;
  private texture=new THREE.TextureLoader().load(asset('images/papal-mask.webp'),texture=>{
    const canvas=document.createElement('canvas');canvas.width=texture.image.width;canvas.height=texture.image.height;
    const ctx=canvas.getContext('2d')!;ctx.drawImage(texture.image,0,0);
    this.alpha={data:ctx.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width,height:canvas.height};
  });
  private glowTexture:THREE.CanvasTexture;
  private bursts:{group:THREE.Group;started:number;room:FpsRoom}[]=[];
  private mobile:boolean;
  constructor(mobile:boolean){
    this.mobile=mobile;this.group.name='papal-hunt';this.group.visible=false;
    this.texture.colorSpace=THREE.SRGBColorSpace;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const ctx=canvas.getContext('2d')!,glow=ctx.createRadialGradient(64,64,1,64,64,64);
    glow.addColorStop(0,'#fff6bd');glow.addColorStop(.2,'#ffdf53cc');glow.addColorStop(.55,'#ffb80055');glow.addColorStop(1,'#ffb80000');
    ctx.fillStyle=glow;ctx.fillRect(0,0,128,128);this.glowTexture=new THREE.CanvasTexture(canvas);
    for(const placement of huntPlacements(mobile)){
      const material=new THREE.MeshBasicMaterial({map:this.texture,transparent:true,alphaTest:.18,side:THREE.DoubleSide,toneMapped:false,color:'#d9d0b2'});
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(placement.size,placement.size*.95),material);
      mesh.name='hunt-'+placement.id;mesh.userData={huntMask:placement.id,fpsRoom:placement.room,baseX:placement.position[0],baseY:placement.position[1],nextShake:performance.now()+1000+Math.random()*4000,shakeStarted:-Infinity};
      mesh.position.fromArray(placement.position);this.group.add(mesh);this.masks.push(mesh);
    }
  }
  resize(mobile:boolean){
    if(this.mobile===mobile)return;this.mobile=mobile;
    huntPlacements(mobile).forEach((placement,i)=>{
      this.masks[i].position.fromArray(placement.position);this.masks[i].userData.baseX=placement.position[0];this.masks[i].userData.baseY=placement.position[1];
    });
  }
  collect(id:string,now:number){
    const reward=this.progress.claim(id);if(!reward)return null;
    const mask=this.masks.find(mesh=>mesh.userData.huntMask===id)!;mask.visible=false;
    const burst=new THREE.Group();burst.position.copy(mask.position);
    const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTexture,color:'#ffe77b',transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));
    glow.scale.setScalar(3);burst.add(glow);
    const points=new Float32Array(32*3);
    for(let i=0;i<32;i++){
      const angle=i*2.39996,r=.5+Math.random();points[i*3]=Math.cos(angle)*r;points[i*3+1]=(Math.random()-.4)*1.5;points[i*3+2]=Math.sin(angle)*r;
    }
    const sparks=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(points,3)),new THREE.PointsMaterial({color:'#ffe286',size:.09,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));
    burst.add(sparks);this.group.add(burst);this.bursts.push({group:burst,started:now,room:mask.userData.fpsRoom});return reward;
  }
  isMaskSurface(hit:THREE.Intersection){
    if(!hit.object.userData.huntMask)return true;
    if(!hit.uv||!this.alpha)return false;
    const {data,width,height}=this.alpha;
    const x=THREE.MathUtils.clamp(Math.floor(hit.uv.x*width),0,width-1),y=THREE.MathUtils.clamp(Math.floor((1-hit.uv.y)*height),0,height-1);
    return data[(y*width+x)*4+3]>60;
  }
  update(camera:THREE.Camera,room:FpsRoom,active:boolean,now:number){
    this.group.visible=active;
    for(const [i,mask] of this.masks.entries()){
      mask.visible=active&&mask.userData.fpsRoom===room&&!this.progress.found.has(mask.userData.huntMask);
      if(mask.visible&&now>=mask.userData.nextShake){
        mask.userData.shakeStarted=now;mask.userData.nextShake=now+1000+Math.random()*4000;
      }
      const t=THREE.MathUtils.clamp((now-mask.userData.shakeStarted)/360,0,1);
      const shake=mask.visible&&t>=0&&t<1&&!matchMedia('(prefers-reduced-motion: reduce)').matches?Math.sin(t*Math.PI)*(1-t):0;
      mask.quaternion.copy(camera.quaternion);
      mask.rotateZ(Math.sin(now*.0005+i)*.035+Math.sin(t*32)*shake*.12);
      mask.position.x=mask.userData.baseX+Math.sin(t*39)*shake*.13;
      mask.position.y=mask.userData.baseY+Math.sin(now*.0012+i)*.045+Math.sin(t*45)*shake*.065;
    }
    this.bursts=this.bursts.filter(burst=>{
      const t=Math.min(1,(now-burst.started)/1100);burst.group.visible=active&&burst.room===room;
      const glow=burst.group.children[0] as THREE.Sprite,sparks=burst.group.children[1] as THREE.Points<THREE.BufferGeometry,THREE.PointsMaterial>;
      glow.scale.setScalar(2+4*t);glow.material.opacity=(1-t)**2;
      sparks.scale.setScalar(.1+t*2);sparks.position.y=t*.9;sparks.material.opacity=1-t;
      if(t<1)return true;
      this.disposeBurst(burst.group);return false;
    });
  }
  reset(){this.progress.reset();for(const burst of this.bursts)this.disposeBurst(burst.group);this.bursts=[];}
  private disposeBurst(group:THREE.Group){
    group.removeFromParent();group.traverse(object=>{
      if(object instanceof THREE.Points)object.geometry.dispose();
      if(object instanceof THREE.Sprite||object instanceof THREE.Points)(object.material as THREE.Material).dispose();
    });
  }
  destroy(){
    this.reset();for(const mask of this.masks){mask.geometry.dispose();mask.material.dispose();}
    this.texture.dispose();this.glowTexture.dispose();this.group.removeFromParent();
  }
}
