import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { firstPersonLayout, crossedFpsDoor, moveFpsPlayer, FPS_RADIUS, type FpsRoom } from '../src/first-person';

for(const mobile of [false,true]){
  test(`every FPP door is reachable and works in both directions (${mobile?'mobile':'desktop'})`,()=>{
    const layout=firstPersonLayout(mobile);
    for(const door of layout.doors){
      const from=new THREE.Vector3().fromArray(door.position);from.z-=door.direction*1.5;
      const to=from.clone();to.z+=door.direction*2;
      const crossing=crossedFpsDoor(from,to,layout.doors.filter(item=>item.room===door.room));
      expect(crossing?.door.id).toBe(door.id);
      const destination=layout.rooms[door.destination];
      expect(crossing!.landing.x).toBeGreaterThan(destination.minX);expect(crossing!.landing.x).toBeLessThan(destination.maxX);
      expect(crossing!.landing.z).toBeGreaterThan(destination.minZ);expect(crossing!.landing.z).toBeLessThan(destination.maxZ);
      const approached=moveFpsPlayer(from,to,layout.rooms[door.room]);
      expect((approached.z-door.position[2])*door.direction).toBeGreaterThan(0);
      const miss=to.clone();miss.x+=door.width;
      const outside=from.clone();outside.x+=door.width;
      expect(crossedFpsDoor(outside,miss,[door])).toBeNull();
      expect(crossedFpsDoor(to,from,[door])).toBeNull();
      const offset=(door.width/2-FPS_RADIUS)*.9;
      const edgeFrom=from.clone(),edgeTo=to.clone();edgeFrom.x+=offset;edgeTo.x+=offset;
      const edgeLanding=crossedFpsDoor(edgeFrom,edgeTo,[door])!.landing;
      expect(Math.abs(edgeLanding.x-door.arrival[0])).toBeLessThanOrEqual(.350001);
      const nextStep=edgeLanding.clone();nextStep.z+=door.direction*.15;
      expect(moveFpsPlayer(edgeLanding,nextStep,destination).distanceTo(edgeLanding)).toBeGreaterThan(.1);
    }
  });
  test(`sprinting cannot pass through screens or leave the room (${mobile?'mobile':'desktop'})`,()=>{
    const {rooms}=firstPersonLayout(mobile);
    for(const room of Object.values(rooms)){
      const center=new THREE.Vector3((room.minX+room.maxX)/2,3.5,(room.minZ+room.maxZ)/2);
      const result=moveFpsPlayer(center,new THREE.Vector3(room.maxX+50,3.5,room.maxZ+50),room);
      expect(result.x).toBeLessThan(room.maxX);expect(result.z).toBeLessThan(room.maxZ);
    }
    for(const name of ['cinema','live'] as FpsRoom[]){
      const room=rooms[name],screen=room.obstacles[0];
      const from=new THREE.Vector3(screen.x,3.5,screen.z+2);
      const result=moveFpsPlayer(from,new THREE.Vector3(screen.x,3.5,screen.z-2),room);
      expect(result.z).toBeGreaterThan(screen.z+screen.halfDepth);
    }
  });
}
