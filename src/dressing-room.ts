import * as THREE from 'three';
import { BAND_EXIT } from './journey';

// A deliberately impossible reflection: bodies exist inside the glass only.
const mirrorFragment=/* glsl */`
  uniform float uTime,uPresence;varying vec2 vUv;
  #include <fog_pars_fragment>
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
  float ellipse(vec2 p,vec2 radius){return 1.-smoothstep(.9,1.08,length(p/radius));}
  void main(){
    vec2 uv=vUv;
    float bodies=0.;
    for(int i=0;i<5;i++){
      float fi=float(i),x=.12+fi*.19;
      float height=.73+.025*sin(fi*2.4);
      vec2 p=uv-vec2(x,height);
      float head=ellipse(p,vec2(.022,.068));
      float neck=ellipse(p+vec2(0.,.074),vec2(.012,.04));
      float shoulders=ellipse(p+vec2(0.,.16),vec2(.048,.085));
      float torso=ellipse(p+vec2(0.,.3),vec2(.038,.17));
      float arms=ellipse(p+vec2(.045,.31),vec2(.01,.17))+ellipse(p+vec2(-.045,.31),vec2(.01,.17));
      float legs=ellipse(p+vec2(.017,.52),vec2(.014,.18))+ellipse(p+vec2(-.017,.52),vec2(.014,.18));
      bodies=max(bodies,clamp(head+neck+shoulders+torso+arms+legs,0.,1.));
    }
    float stain=noise(uv*vec2(25.,17.));
    float tarnish=smoothstep(.46,.82,noise(uv*vec2(7.,5.)))*.24;
    vec3 glass=vec3(.2,.255,.28)*(1.-tarnish)+vec3(.03)*stain;
    glass=mix(glass,vec3(.012,.018,.021),bodies*.95);
    // Continuous drifting condensation reveals each unmoving reflection at a different pace.
    vec2 flow=vec2(uTime*.019,-uTime*.012);
    float cloud=noise(uv*vec2(6.,3.)+flow)*.68+noise(uv*vec2(13.,8.)-flow*.7)*.32;
    float vapor=smoothstep(.3,.75,cloud)*.8;
    glass=mix(glass,vec3(.24,.285,.3),vapor);
    float scratch=pow(max(0.,sin(uv.x*379.+noise(uv*25.)*3.)),48.)*.022;
    glass+=scratch;
    float edge=smoothstep(0.,.025,uv.x)*smoothstep(0.,.025,1.-uv.x)*smoothstep(0.,.04,uv.y)*smoothstep(0.,.04,1.-uv.y);
    gl_FragColor=vec4(glass*mix(.5,1.,edge),uPresence);
    #include <fog_fragment>
  }
`;

export function createDressingRoom(){
  const group=new THREE.Group();group.name='dressing-room';
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const paint=canvas.getContext('2d')!;paint.fillStyle='#51585a';paint.fillRect(0,0,256,256);
  // Deterministic plaster and water damage, independent of the rest of the world's seed.
  let seed=39;const random=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
  for(let i=0;i<1800;i++){
    paint.fillStyle=i%2?'#31393b':'#6d7270';paint.globalAlpha=.18;
    paint.fillRect(random()*256,random()*256,1+random()*9,1+random()*28);
  }
  paint.globalAlpha=1;
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3,2);
  const plaster=new THREE.MeshStandardMaterial({map:texture,color:'#687378',roughness:.97});
  const floor=new THREE.MeshStandardMaterial({map:texture,color:'#393d3c',roughness:.85,metalness:.15});
  const metal=new THREE.MeshStandardMaterial({color:'#4c5557',roughness:.66,metalness:.6});
  const leather=new THREE.MeshStandardMaterial({color:'#342628',roughness:.9});
  const dark=new THREE.MeshStandardMaterial({color:'#0b0f10',roughness:.8});
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,material:THREE.Material)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);group.add(mesh);return mesh;
  };
  box(0,-.15,14,44,.3,36,floor);
  const {x:exitX,z:exitZ,width:exitWidth,height:exitHeight}=BAND_EXIT;
  const left=exitX-exitWidth/2,right=exitX+exitWidth/2;
  box((-22+left)/2,4,exitZ,left+22,8,.4,plaster);
  box((right+22)/2,4,exitZ,22-right,8,.4,plaster);
  box(exitX,(exitHeight+8)/2,exitZ,exitWidth,8-exitHeight,.4,plaster);
  box(-20,4,14,.4,8,30,plaster);box(20,4,14,.4,8,30,plaster);box(0,8,14,44,.3,30,dark);
  const mirror=new THREE.ShaderMaterial({
    vertexShader:/* glsl */`varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:mirrorFragment,uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uTime:{value:0},uPresence:{value:1}}]),
    fog:true,transparent:true,
  });
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(14,5),mirror);glass.position.set(-4,3.7,0);glass.name='five-reflections';group.add(glass);
  for(const x of [-11.15,3.15])box(x,3.7,.05,.18,5.35,.16,metal);
  for(const y of [1.07,6.33])box(-4,y,.05,14.45,.16,.16,metal);
  box(-4,.94,.8,15,.16,1.3,floor);
  for(const x of [-10.5,2.5])box(x,.45,.8,.13,.9,1.1,metal);
  for(let i=0;i<5;i++){
    const x=-9.3+i*2.65,z=3.1+(i%2)*.22;
    box(x,.94,z,1.3,.17,1.25,leather);
    const back=box(x,1.63,z-.54,1.3,1.25,.17,leather);back.rotation.x=-.08;
    for(const side of [-.53,.53]){
      for(const depth of [-.47,.47])box(x+side,.44,z+depth,.075,.88,.075,metal);
      box(x+side,1.25,z,.075,.52,.075,metal);
      box(x+side,1.5,z,.11,.07,.8,metal);
    }
  }
  // A cold practical light above the mirror; red leaks beneath the hinged exit.
  box(-4,6.9,.45,12,.16,.25,metal);
  box(-4,6.84,.62,11.6,.045,.07,new THREE.MeshBasicMaterial({color:'#adc4c8',toneMapped:false}));
  const cold=new THREE.SpotLight('#afc6d0',700,40,1.1,.85,1.5);
  cold.position.set(-4,7.2,8);cold.target.position.set(-4,1.6,1);group.add(cold,cold.target);
  const fill=new THREE.PointLight('#849ca6',135,24,1.5);fill.position.set(-4,4.8,4);group.add(fill);
  const exitDoor=new THREE.Group();exitDoor.name='band-exit-door';exitDoor.position.set(left,0,-.45);group.add(exitDoor);
  const leaf=box(exitX,exitHeight/2,-.45,exitWidth,exitHeight,.3,dark);
  exitDoor.attach(leaf);
  for(const x of [6.45,9.55])box(x,2.85,-.24,.13,5.75,.15,metal);
  box(8,5.7,-.24,3.2,.13,.15,metal);
  box(8,.045,-.18,2.9,.055,.06,new THREE.MeshBasicMaterial({color:'#b92035',toneMapped:false}));
  exitDoor.attach(box(9.12,2.5,-.15,.08,.08,.28,metal));
  const red=new THREE.PointLight('#ba1530',90,13,1.5);red.position.set(8,.25,1);group.add(red);
  // Neglected bottles and a towel belong on the counter, never on the five empty seats.
  box(-10,1.25,.7,.2,.48,.2,metal);box(1.8,1.21,.7,.2,.4,.2,dark);
  const towel=box(-6,1.05,1.1,1.3,.05,.7,leather);towel.rotation.y=.16;
  return {group,mirror,exitDoor};
}
