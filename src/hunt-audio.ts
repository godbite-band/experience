import { asset } from './content';

export interface MidiNote {time:number;duration:number;note:number;velocity:number;channel:number}
/** Read SMF tempo events as well as running status. Percussion is intentionally omitted. */
export function readHuntMidi(buffer:ArrayBuffer){
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);
  if(String.fromCharCode(...bytes.slice(0,4))!=='MThd')throw new Error('Invalid MIDI');
  const division=view.getUint16(12);if(division&0x8000)throw new Error('SMPTE timing is unsupported');
  const events:{tick:number;kind:'tempo'|'on'|'off';channel:number;note:number;value:number}[]=[];
  let offset=8+view.getUint32(4);
  for(let track=0;track<view.getUint16(10);track++){
    const end=offset+8+view.getUint32(offset+4);offset+=8;let tick=0,status=0;
    const variable=()=>{let value=0,next:number;do{next=bytes[offset++];value=(value<<7)|(next&127);}while(next&128);return value;};
    while(offset<end){
      tick+=variable();let command=bytes[offset];if(command&128){offset++;if(command<240)status=command;}else command=status;
      if(command===255){
        const type=bytes[offset++],length=variable();
        if(type===81&&length===3)events.push({tick,kind:'tempo',channel:0,note:0,value:(bytes[offset]<<16)|(bytes[offset+1]<<8)|bytes[offset+2]});
        offset+=length;
      }else if(command===240||command===247){const length=variable();offset+=length;}
      else{
        const kind=command>>4,channel=command&15,note=bytes[offset++],value=kind===12||kind===13?0:bytes[offset++];
        if((kind===8||kind===9)&&channel!==9)events.push({tick,kind:kind===9&&value>0?'on':'off',channel,note,value});
      }
    }
    offset=end;
  }
  events.sort((a,b)=>a.tick-b.tick);
  const notes:MidiNote[]=[],held=new Map<string,{time:number;velocity:number}[]>();let tick=0,time=0,tempo=500000;
  for(const event of events){
    time+=(event.tick-tick)/division*tempo/1000000;tick=event.tick;
    if(event.kind==='tempo'){tempo=event.value;continue;}
    const key=event.channel+':'+event.note,queue=held.get(key)??[];
    if(event.kind==='on'){queue.push({time,velocity:event.value/127});held.set(key,queue);}
    else{
      const start=queue.shift();if(start)notes.push({time:start.time,duration:Math.max(.04,time-start.time),note:event.note,velocity:start.velocity,channel:event.channel});
    }
  }
  if(!notes.length)throw new Error('Empty MIDI');
  return {notes:notes.sort((a,b)=>a.time-b.time),duration:Math.max(time,...notes.map(note=>note.time+note.duration))+.8};
}

/** Reuses the site's audio context and mute switch; no hidden third-party player. */
export class HuntAudio {
  private master:GainNode;
  private music:ReturnType<typeof readHuntMidi>|null=null;
  private scream:AudioBuffer|null=null;
  private active=false;
  private timer:ReturnType<typeof setInterval>|undefined;
  private epoch=0;
  private cycle=0;
  private index=0;
  private voices=new Set<AudioScheduledSourceNode>();
  private loading:Promise<void>|undefined;
  private pendingScream=false;
  constructor(private context:AudioContext){
    this.master=context.createGain();this.master.gain.value=0;
    const limiter=context.createDynamicsCompressor();limiter.threshold.value=-12;limiter.ratio.value=5;
    this.master.connect(limiter).connect(context.destination);
  }
  setActive(active:boolean){
    if(this.active===active)return;this.active=active;
    this.master.gain.setTargetAtTime(active?.45:0,this.context.currentTime,.08);
    if(active){
      if(!this.loading)this.loading=this.load();
      if(this.music)this.start();
    }else {this.pendingScream=false;this.stop();}
  }
  prepare(){return this.loading??=this.load();}
  hit(){
    if(!this.active)return;
    if(!this.scream){
      this.pendingScream=true;
      void this.prepare().then(()=>{if(this.pendingScream&&this.active&&this.scream){this.pendingScream=false;this.hit();}});
      return;
    }
    const source=this.context.createBufferSource(),gain=this.context.createGain();source.buffer=this.scream;gain.gain.value=.8;
    source.connect(gain).connect(this.master);this.voices.add(source);
    source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();};source.start();
  }
  private async load(){
    const results=await Promise.allSettled([
      fetch(asset('audio/fpp.mid')).then(async response=>{if(!response.ok)throw Error('Music unavailable');this.music=readHuntMidi(await response.arrayBuffer());if(this.active)this.start();}),
      fetch(asset('audio/wilhelm-scream.ogg')).then(async response=>{if(!response.ok)throw Error('Scream unavailable');this.scream=await this.context.decodeAudioData(await response.arrayBuffer());}),
    ]);
    if(results.some(result=>result.status==='rejected'))this.loading=undefined;
  }
  private start(){
    if(this.timer||!this.music)return;
    this.epoch=this.context.currentTime+.08;this.index=0;this.cycle=0;
    this.schedule();this.timer=setInterval(()=>this.schedule(),80);
  }
  private schedule(){
    if(!this.music||!this.active)return;
    const until=this.context.currentTime+.3;
    while(this.epoch+this.cycle*this.music.duration+this.music.notes[this.index].time<until){
      const note=this.music.notes[this.index],when=this.epoch+this.cycle*this.music.duration+note.time;
      if(when>=this.context.currentTime-.05)this.playNote(note,Math.max(when,this.context.currentTime));
      this.index++;
      if(this.index===this.music.notes.length){this.index=0;this.cycle++;}
    }
  }
  private playNote(note:MidiNote,when:number){
    const tone=this.context.createOscillator(),gain=this.context.createGain();tone.type=note.channel===0?'triangle':'sine';
    tone.frequency.value=440*2**((note.note-69)/12);
    const duration=Math.min(note.duration,6),level=note.velocity*(note.channel===0?.065:.025);
    gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(level,when+.025);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0001,level*.35),when+Math.max(.04,duration));
    gain.gain.linearRampToValueAtTime(0,when+duration+.2);
    tone.connect(gain).connect(this.master);this.voices.add(tone);
    tone.onended=()=>{this.voices.delete(tone);tone.disconnect();gain.disconnect();};tone.start(when);tone.stop(when+duration+.22);
  }
  private stop(){
    clearInterval(this.timer);this.timer=undefined;
    for(const voice of this.voices){try{voice.stop();}catch{/* Already ended. */}}
    this.voices.clear();
  }
}
