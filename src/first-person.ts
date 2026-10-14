import * as THREE from 'three';
import { BAND_EXIT, interiorLayout, CAMERA_HEIGHT } from './journey';

export type FpsRoom='gallery'|'cinema'|'live'|'band'|'signal';
type Point=[number,number,number];
export interface FpsDoor {
  id:string;room:FpsRoom;destination:FpsRoom;position:Point;arrival:Point;
  width:number;height:number;direction:1|-1;label:string;
}
interface Obstacle {x:number;z:number;halfWidth:number;halfDepth:number}
export interface FpsRoomLayout {
  progress:number;minX:number;maxX:number;minZ:number;maxZ:number;obstacles:Obstacle[];
}
export const FPS_RADIUS=.22;

/** Keep a level horizon and bounded angles, even after many full turns. */
export function turnFpsView(yaw:number,pitch:number,dx:number,dy:number){
  // Cursor warps and invalid browser deltas must never poison the camera quaternion.
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)>4096||Math.abs(dy)>4096)return {yaw,pitch};
  return {
    yaw:THREE.MathUtils.euclideanModulo(yaw-dx*.0024+Math.PI,Math.PI*2)-Math.PI,
    pitch:THREE.MathUtils.clamp(pitch-dy*.0024,-1.35,1.35),
  };
}

/** Each door has its own landing point, so forward and backward trips never overlap a sensor. */
export function firstPersonLayout(mobile:boolean){
  const l=interiorLayout(mobile),origin=l.origin[2],s=mobile?.7:1;
  const cinemaZ=origin+l.cinemaZ,liveZ=origin+l.liveZ,bandZ=origin+l.bandZ,signalZ=origin+l.signalZ;
  const point=(x:number,z:number):Point=>[x,CAMERA_HEIGHT,z];
  const doors:FpsDoor[]=[
    {id:'gallery-cinema',room:'gallery',destination:'cinema',position:point(l.cinemaX,origin+l.exitZ),arrival:point(l.cinemaX,cinemaZ+26*s),width:2.5,height:7,direction:-1,label:'II'},
    {id:'cinema-gallery',room:'cinema',destination:'gallery',position:point(l.cinemaX,cinemaZ+32*s),arrival:point(l.cinemaX,origin+l.exitZ+2.5),width:2.5*s,height:7,direction:1,label:'I'},
    {id:'cinema-live',room:'cinema',destination:'live',position:point(l.cinemaX+7.23*s,cinemaZ-.5*s),arrival:point(l.cinemaX,liveZ+30),width:1.7*s,height:7,direction:-1,label:'III'},
    {id:'live-cinema',room:'live',destination:'cinema',position:point(l.cinemaX,liveZ+36),arrival:point(l.cinemaX+7.23*s,cinemaZ+2.5*s),width:2.5,height:7,direction:1,label:'II'},
    {id:'live-band',room:'live',destination:'band',position:point(l.cinemaX+9.5,liveZ-4.5),arrival:point(l.bandX,bandZ+23.5),width:2,height:7,direction:-1,label:'IV'},
    {id:'band-live',room:'band',destination:'live',position:point(l.bandX,bandZ+28.5),arrival:point(l.cinemaX+9.5,liveZ-2.2),width:2.5,height:7,direction:1,label:'III'},
    {id:'band-signal',room:'band',destination:'signal',position:point(l.bandExitX,bandZ-.25),arrival:point(l.signalX,signalZ+12),width:BAND_EXIT.width,height:BAND_EXIT.height,direction:-1,label:'V'},
    {id:'signal-band',room:'signal',destination:'band',position:point(l.signalX,signalZ+18),arrival:point(l.bandExitX,bandZ+2),width:2.5,height:7,direction:1,label:'IV'},
  ];
  const rooms:Record<FpsRoom,FpsRoomLayout>={
    gallery:{progress:1.42,minX:-38,maxX:40,minZ:origin+l.exitZ-12,maxZ:65,obstacles:Array.from({length:5},(_,i)=>({x:i*4.4*l.scale,z:origin-(2-Math.abs(i-2))*1.8*l.scale,halfWidth:1.325*l.scale,halfDepth:.35*l.scale}))},
    cinema:{progress:2,minX:l.cinemaX-19*s,maxX:l.cinemaX+19*s,minZ:cinemaZ-.9*s,maxZ:cinemaZ+33*s,obstacles:[
      {x:l.cinemaX,z:cinemaZ,halfWidth:6.25*s,halfDepth:.2*s},
      ...Array.from({length:84},(_,i)=>{const column=i%12,row=Math.floor(i/12);return {
        x:l.cinemaX+((column-5.5)*1.3+(column<6?-.8:.8))*s,z:cinemaZ+(7+row*2.15)*s,halfWidth:.44*s,halfDepth:.65*s,
      };}),
    ]},
    live:{progress:3,minX:l.cinemaX-15.5,maxX:l.cinemaX+15.5,minZ:liveZ-4.8,maxZ:liveZ+38,obstacles:[
      {x:l.cinemaX,z:liveZ-3,halfWidth:6.1,halfDepth:.2},
      ...[-1,1].flatMap(side=>[{x:l.cinemaX+side*7,z:liveZ-.8,halfWidth:1.3,halfDepth:.6},{x:l.cinemaX+side*12.1,z:liveZ+1,halfWidth:1.15,halfDepth:.8}]),
    ]},
    band:{progress:4,minX:l.bandX-19.5,maxX:l.bandX+19.5,minZ:bandZ-.6,maxZ:bandZ+29,obstacles:[
      {x:l.bandX-4,z:bandZ+.8,halfWidth:7.5,halfDepth:.65},
      ...Array.from({length:5},(_,i)=>({x:l.bandX-9.3+i*2.65,z:bandZ+3.1+(i%2)*.22,halfWidth:.65,halfDepth:.65})),
    ]},
    signal:{progress:5,minX:l.signalX-18,maxX:l.signalX+18,minZ:signalZ-20,maxZ:signalZ+20,obstacles:[]},
  };
  return {doors,rooms,signalFloor:point(l.signalX,signalZ)};
}

/** Test the swept segment, rather than proximity, to handle diagonal movement and fast steps. */
export function crossedFpsDoor(from:THREE.Vector3,to:THREE.Vector3,doors:readonly FpsDoor[]){
  for(const door of doors){
    const z=door.position[2],before=(from.z-z)*door.direction,after=(to.z-z)*door.direction;
    if(before>0||after<=0||Math.abs(to.z-from.z)<1e-7)continue;
    const t=(z-from.z)/(to.z-from.z),x=THREE.MathUtils.lerp(from.x,to.x,t);
    if(Math.abs(x-door.position[0])>door.width/2-FPS_RADIUS)continue;
    const landing=new THREE.Vector3().fromArray(door.arrival);
    landing.x+=THREE.MathUtils.clamp(x-door.position[0],-.35,.35);
    return {door,landing};
  }
  return null;
}

/** Slide along furniture and keep the player on the floor inside the current room. */
export function moveFpsPlayer(from:THREE.Vector3,to:THREE.Vector3,room:FpsRoomLayout){
  const result=from.clone();
  const blocked=(x:number,z:number)=>room.obstacles.some(o=>Math.abs(x-o.x)<o.halfWidth+FPS_RADIUS&&Math.abs(z-o.z)<o.halfDepth+FPS_RADIUS);
  const x=THREE.MathUtils.clamp(to.x,room.minX+FPS_RADIUS,room.maxX-FPS_RADIUS);
  const z=THREE.MathUtils.clamp(to.z,room.minZ+FPS_RADIUS,room.maxZ-FPS_RADIUS);
  // Substeps also protect narrow screens when sprinting at a low frame rate.
  const steps=Math.max(1,Math.ceil(Math.hypot(x-from.x,z-from.z)/.15));
  const dx=(x-from.x)/steps,dz=(z-from.z)/steps;
  for(let i=0;i<steps;i++){
    if(!blocked(result.x+dx,result.z))result.x+=dx;
    if(!blocked(result.x,result.z+dz))result.z+=dz;
  }
  return result;
}
