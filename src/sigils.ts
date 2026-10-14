import * as THREE from 'three';

export const SIGIL_COUNT=5;

export function createSigil(index: number) {
  const group=new THREE.Group();group.userData.sigil=index;
  const material=new THREE.MeshBasicMaterial({color:new THREE.Color('#ffd4b8').multiplyScalar(2.4),toneMapped:false,fog:false});
  const addCircle=(x:number,y:number,radius:number)=>{
    const circle=[];
    for(let i=0;i<=64;i++){const a=i/64*Math.PI*2;circle.push(new THREE.Vector3(x+Math.cos(a)*radius,y+Math.sin(a)*radius,0));}
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(circle),64,.014,5,false),material));
  };
  const wireGeometry=new THREE.CylinderGeometry(.014,.014,1,6);
  type Point=[number,number];
  const addEdge=(from:Point,to:Point)=>{
    const start=new THREE.Vector3(...from,0),end=new THREE.Vector3(...to,0);
    const direction=end.clone().sub(start);
    const wire=new THREE.Mesh(wireGeometry,material);
    wire.position.copy(start).add(end).multiplyScalar(.5);
    wire.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize());
    wire.scale.y=direction.length();group.add(wire);
  };
  const addPolygon=(points:Point[])=>{
    for(let i=0;i<points.length;i++)addEdge(points[i],points[(i+1)%points.length]);
  };
  // Keep every figure within the same footprint and use the same luminous wire radius.
  if(index===0){
    // Vesica piscis: each circle passes through the other's centre.
    const radius=.62/1.5;
    addCircle(-radius/2,0,radius);addCircle(radius/2,0,radius);
  }else if(index===1){
    // The existing unicursal hexagram also appears in the masthead.
    addPolygon([[0,.62],[.543,-.31],[-.543,.31],[0,-.62],[.543,.31],[-.543,-.31]]);
  }else if(index===2){
    // Seed of Life: one central circle and six equally spaced intersecting circles.
    addCircle(0,0,.31);
    for(let i=0;i<6;i++){
      const a=Math.PI/2+i*Math.PI/3;
      addCircle(Math.cos(a)*.31,Math.sin(a)*.31,.31);
    }
  }else if(index===3){
    // Project a rotated regular octahedron: four equatorial vertices join both poles.
    const rotation=new THREE.Euler(.45,.6,.1);
    const vertices=[[0,1,0],[0,-1,0],[-1,0,0],[0,0,1],[1,0,0],[0,0,-1]]
      .map(([x,y,z])=>new THREE.Vector3(x,y,z).applyEuler(rotation));
    const scale=.62/Math.max(...vertices.map(vertex=>Math.hypot(vertex.x,vertex.y)));
    const projected:Point[]=vertices.map(vertex=>[vertex.x*scale,vertex.y*scale]);
    const equator=projected.slice(2);
    addPolygon(equator);
    for(const point of equator){addEdge(projected[0],point);addEdge(projected[1],point);}
  }else{
    // The Pythagorean pentagram's five chords form a smaller pentagon at the centre.
    const pentagram:Point[]=Array.from({length:5},(_,i)=>{
      const a=Math.PI/2+i*Math.PI*4/5;
      return [Math.cos(a)*.62,Math.sin(a)*.62];
    });
    addCircle(0,0,.62);addPolygon(pentagram);
  }
  return group;
}
