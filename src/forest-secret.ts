import * as THREE from 'three';

export const FIGURE_POSITION = new THREE.Vector3(innerWidth < 800 ? -6.5 : -10, 0, -67.5);
export const FACE_HEIGHT = 6.25;
export const EYE_RADIUS = .14;

const segmentDigits = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
const segmentPaths: Record<string, number[]> = {
  a:[218,162,294,162], b:[304,174,304,246], c:[304,268,304,340],
  d:[218,352,294,352], e:[208,268,208,340], f:[208,174,208,246], g:[218,257,294,257],
};

/** The glass and the illuminated wire are separate strokes, with a fine hot core. */
function eyeTexture(value: number) {
  const canvas = document.createElement('canvas');canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const halo = ctx.createRadialGradient(256,256,150,256,256,252);
  halo.addColorStop(0,'#080103');halo.addColorStop(.48,'#1b0207');
  halo.addColorStop(.73,'#31030b');halo.addColorStop(1,'#00000000');
  ctx.fillStyle=halo;ctx.fillRect(0,0,512,512);
  ctx.beginPath();ctx.arc(256,256,192,0,Math.PI*2);
  ctx.strokeStyle='#751326';ctx.lineWidth=9;ctx.shadowColor='#dd1231';ctx.shadowBlur=25;ctx.stroke();
  ctx.strokeStyle='#e73a4d';ctx.lineWidth=2.5;ctx.shadowBlur=8;ctx.stroke();
  ctx.beginPath();ctx.arc(256,256,183,Math.PI*1.12,Math.PI*1.72);
  ctx.strokeStyle='#e8959342';ctx.lineWidth=2;ctx.shadowBlur=0;ctx.stroke();
  ctx.lineCap='round';
  for(const [key,[x1,y1,x2,y2]] of Object.entries(segmentPaths)){
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);
    const lit=segmentDigits[value].includes(key);
    ctx.lineWidth=12;ctx.strokeStyle=lit?'#641126':'#22070c';ctx.shadowBlur=0;ctx.stroke();
    if(!lit)continue;
    ctx.strokeStyle='#f43a4d';ctx.lineWidth=7;ctx.shadowColor='#f92348';ctx.shadowBlur=18;ctx.stroke();
    ctx.strokeStyle='#ffb0a0';ctx.lineWidth=2;ctx.shadowBlur=3;ctx.stroke();
    ctx.beginPath();ctx.moveTo(x1+2,y1+2);ctx.lineTo(x2+2,y2+2);
    ctx.strokeStyle='#ffd8bd55';ctx.lineWidth=1;ctx.shadowBlur=0;ctx.stroke();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

function birchTexture(){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=1024;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#78817c';ctx.fillRect(0,0,256,1024);
  for(let i=0;i<850;i++){
    const n=(Math.sin(i*127.1)*43758.5453)%1,x=Math.abs(n)*256,y=(i*137.23)%1024;
    ctx.fillStyle=i%5===0?'#222d27':'#515d5455';
    ctx.fillRect(x,y,5+Math.abs(Math.sin(i*1.71))*54,i%5===0?3:1);
  }
  for(let i=0;i<14;i++){
    const x=(i*47)%256;ctx.fillStyle='#bac0ad22';ctx.fillRect(x,0,2,1024);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(1,2);
  return texture;
}

export function createForestFigure() {
  const group=new THREE.Group();group.position.copy(FIGURE_POSITION);
  const tree=new THREE.Group(),actor=new THREE.Group();tree.position.x=-.12;group.add(actor,tree);
  const ink=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uNear:{value:0},uPresence:{value:1}},transparent:true,
    vertexShader:`varying vec3 vNormal,vView,vPosition;
      void main(){vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);
      vView=normalize(-p.xyz);vPosition=position;gl_Position=projectionMatrix*p;}`,
    fragmentShader:`uniform float uTime,uNear,uPresence;varying vec3 vNormal,vView,vPosition;
      void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),3.8);
      float edge=.4+.6*smoothstep(-.45,.9,vNormal.x);
      float vein=sin(vPosition.y*37.+vPosition.x*19.)*.001;
      vec3 color=vec3(.001,.0013,.002)+vec3(.035,.043,.05)*rim*edge;
      color+=vec3(.003,.004,.006)*uNear+vein*uNear;
      gl_FragColor=vec4(color,uPresence);}`,
  });
  const curve=(points:number[][],radius:number)=>{
    const mesh=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p[0],p[1],p[2]))),24,radius,8,false),ink);
    actor.add(mesh);return mesh;
  };
  // An off-balance spine, narrow shoulders and unequal arms break the mannequin silhouette.
  const torso=new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(.25,2.25),new THREE.Vector2(.34,3.15),new THREE.Vector2(.25,4.25),
    new THREE.Vector2(.43,4.85),new THREE.Vector2(.28,5.2),new THREE.Vector2(.15,5.3),
  ],32),ink);torso.scale.z=.56;torso.position.x=-.16;torso.rotation.z=-.08;actor.add(torso);
  curve([[-.24,2.5,-.03],[-.38,1.3,-.02],[-.5,.02,.03]],.12);
  curve([[.12,2.5,-.04],[.14,1.2,-.05],[.04,.02,.02]],.105);
  curve([[-.53,4.96,.04],[-.69,3.6,.03],[-.76,1.85,.1]],.09);
  curve([[.2,4.97,.02],[.77,4.55,.27],[.48,4.13,.7]],.085);
  curve([[.13,5.05,0],[.38,5.57,.01],[.8,5.93,.04]],.13);
  // Long fingertips curl over the visible edge of the bark.
  for(let i=0;i<4;i++)curve([[.45,4.16-i*.07,.7],[.32,4.15-i*.08,.95],[.15,4.03-i*.1,.91]],.022);
  const face=new THREE.Group();face.position.set(.8,FACE_HEIGHT,.08);face.rotation.set(0,.12,-.16);actor.add(face);
  const headGeometry=new THREE.SphereGeometry(1,48,32),vertices=headGeometry.attributes.position;
  for(let i=0;i<vertices.count;i++){
    const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i);
    const jaw=THREE.MathUtils.lerp(.72,1,THREE.MathUtils.smoothstep(y,-.8,.1));
    vertices.setXYZ(i,x*.48*jaw,y*.83,z*.36*(1+.045*Math.sin(y*9)));
  }
  headGeometry.computeVertexNormals();const head=new THREE.Mesh(headGeometry,ink);face.add(head);
  const textures=Array.from({length:10},(_,digit)=>eyeTexture(digit));
  const eyes:THREE.Mesh<THREE.CircleGeometry,THREE.MeshBasicMaterial>[]=[];
  // Read the cipher left to right across the upper row, then the lower row.
  const positions=[[-.235,.23],[.235,.23],[-.255,-.13],[.255,-.13]];
  const faceSurface=(x:number,y:number)=>{
    const ny=y/.83,jaw=THREE.MathUtils.lerp(.72,1,THREE.MathUtils.smoothstep(ny,-.8,.1));
    const nx=x/(.48*jaw);
    return Math.sqrt(Math.max(0,1-nx*nx-ny*ny))*.36*(1+.045*Math.sin(ny*9))+.014;
  };
  for(let i=0;i<4;i++){
    const geometry=new THREE.CircleGeometry(EYE_RADIUS,64),points=geometry.attributes.position;
    for(let vertex=0;vertex<points.count;vertex++)points.setZ(vertex,faceSurface(positions[i][0]+points.getX(vertex),positions[i][1]+points.getY(vertex)));
    geometry.computeVertexNormals();
    const eye=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({
      map:textures[0],transparent:true,opacity:0,depthWrite:false,toneMapped:false,fog:false,
    }));
    eye.position.set(positions[i][0],positions[i][1],0);eye.userData.eye=i;
    eye.userData.surfaceZ=faceSurface(positions[i][0],positions[i][1]);
    eye.userData.edgeZ=faceSurface(positions[i][0]+EYE_RADIUS,positions[i][1]);
    eyes.push(eye);face.add(eye);
  }
  const bark=new THREE.MeshStandardMaterial({map:birchTexture(),color:'#7a8880',roughness:1,emissive:'#1a2323',emissiveIntensity:.24});
  const trunkGeometry=new THREE.CylinderGeometry(.23,.51,15,20,30);
  const trunkVertices=trunkGeometry.attributes.position;
  for(let i=0;i<trunkVertices.count;i++){
    const y=trunkVertices.getY(i)+7.5;
    trunkVertices.setX(i,trunkVertices.getX(i)+Math.sin(y*.19)*.13);
    trunkVertices.setZ(i,trunkVertices.getZ(i)+Math.sin(y*.31)*.08);
  }
  trunkGeometry.computeVertexNormals();
  const trunk=new THREE.Mesh(trunkGeometry,bark);trunk.position.set(-.05,7.5,.67);tree.add(trunk);
  for(const [height,endX,endY,endZ] of [[9,-2.1,12,-.4],[11,1.8,13,-.7]]){
    const branch=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0,height,.67),new THREE.Vector3(endX*.45,height+1,.2),new THREE.Vector3(endX,endY,endZ),
    ]),16,.055,7,false),bark);tree.add(branch);
  }
  actor.traverse(object=>{object.userData.forestFigure=true;});
  return {group,tree,actor,hit:actor,face,eyes,textures,ink};
}

export function createSigilStone() {
  const group=new THREE.Group();
  const stone=new THREE.Mesh(new THREE.IcosahedronGeometry(.23,1),new THREE.MeshStandardMaterial({color:'#41413d',roughness:.95,flatShading:true}));
  stone.scale.set(1.3,.78,1);group.add(stone);
  const mark=new THREE.Mesh(new THREE.TorusGeometry(.105,.014,4,5),new THREE.MeshBasicMaterial({color:'#d33b50',toneMapped:false}));
  mark.rotation.x=-Math.PI/2;mark.position.y=.18;group.add(mark);
  return group;
}
