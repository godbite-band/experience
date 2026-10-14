import '@fontsource/bodoni-moda/latin-500.css';
import '@fontsource/bodoni-moda/latin-ext-500.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-ext-400.css';
import './style.css';
import { asset, copy, films, releases, socials, tracklists, liveConcert, secretConcert } from './content';
import type { Chapter, Language } from './content';
import { Ambient } from './ambient';
import { renderBand } from './band';
import { VideoPlayer } from './video-player';
import { SCENE_ANCHORS, RETREAT_LIMIT, RETREAT_TRIGGER, activeRecording, atmospherePresence, chapterPresentation, liveFigureStillBounds } from './journey';
import type { World } from './world';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const chapters: Chapter[] = ['threshold', 'music', 'cinema', 'live', 'band', 'contact'];
const sections = chapters.map(id => $('#'+id));
const stages = sections.map(section => section.querySelector<HTMLElement>('.chapter-stage')!);
const chapterKeys = ['threshold', 'music', 'cinema', 'club', 'bandRoom', 'signal'] as const;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
document.documentElement.classList.add('journey-input');
let language: Language = 'en';
try { if (localStorage.getItem('godbite-language') === 'pl') language = 'pl'; } catch { /* Storage can be unavailable in private browser contexts. */ }
let selectedRelease = 0;
let currentRecording = -1;
let selectedFilm = films[0];
let cinemaPlayer: VideoPlayer | undefined;
let livePlayer: VideoPlayer | undefined;
let dialogPlayer: VideoPlayer | undefined;

let lastInvoker: HTMLElement | null = null;
const invokers = new WeakMap<HTMLDialogElement, HTMLElement>();
document.addEventListener('click',event=>{
  if(event.target instanceof Element)lastInvoker=event.target.closest<HTMLElement>('a,button');
},true);
let currentChapter = 0;
let stillMode = false;
let world: World | undefined;
let worldGeneration = 0;
let forestSecretMode:'none'|'eyes'|'fps'='none';
const ambient = new Ambient(()=>updateControls());
const releaseDialog = $<HTMLDialogElement>('#release-dialog');
const releasePlayer = $('#release-player');
const filmDialog = $<HTMLDialogElement>('#film-dialog');
const dialogs = [releaseDialog, filmDialog];
const releaseList = $('#release-list');
const filmList = $('#film-list');
const still = $('#still-world');

// Reserve the measured frame space, including wrapped navigation and larger text.
function updateFrameMetrics(){
  const root=document.documentElement;
  root.style.setProperty('--navigation-height',$('.main-nav').getBoundingClientRect().height+'px');
  root.style.setProperty('--masthead-height',$('.masthead').getBoundingClientRect().height+'px');
  root.style.setProperty('--footer-height',$('.frame-footer').getBoundingClientRect().height+'px');
}
const frameObserver=new ResizeObserver(updateFrameMetrics);
for(const selector of ['.main-nav','.masthead','.frame-footer'])frameObserver.observe($(selector));
updateFrameMetrics();

function link(label: string, href: string) {
  const element = document.createElement('a');
  element.href = href; element.target = '_blank'; element.rel = 'noopener noreferrer';
  element.textContent = label;
  const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden','true');
  element.append(arrow); return element;
}
for (const [name, url] of socials) {
  const element = document.createElement('a'); element.href=url; element.target='_blank';
  element.rel='noopener noreferrer'; element.textContent=name; $('#social-links').append(element);
}
releases.forEach((release,index)=>{
  const item=document.createElement('li'),button=document.createElement('button');
  const number=document.createElement('span'),title=document.createElement('span'),year=document.createElement('span');
  number.className='release-list-no';number.textContent=String(index+1).padStart(2,'0');
  title.className='release-list-title';title.textContent=release.title;
  title.id='release-label-'+release.id;
  year.className='release-list-year';year.textContent=String(release.year)+' ↗';
  button.dataset.release=release.id;button.append(number,title,year);
  const drawer=document.createElement('div'),inner=document.createElement('div'),tracks=document.createElement('ol');
  drawer.className='release-track-drawer';drawer.inert=true;drawer.setAttribute('aria-hidden','true');
  inner.className='release-track-inner';tracks.className='release-tracks';tracks.setAttribute('aria-labelledby',title.id);
  (tracklists[release.id]??[]).forEach(([name,duration],number)=>{
    const row=document.createElement('li'),position=document.createElement('span'),label=document.createElement('span'),time=document.createElement('span');
    position.className='track-number';position.textContent=String(number+1).padStart(2,'0');
    label.className='track-title';label.textContent=name;
    time.className='track-duration';time.textContent=duration??'';
    row.append(position,label,time);tracks.append(row);
  });
  inner.append(tracks);drawer.append(inner);
  button.addEventListener('click',()=>openRelease(index));item.append(button,drawer);releaseList.append(item);
});
films.forEach((film,index)=>{
  const button=document.createElement('button'),title=document.createElement('span'),number=document.createElement('span');
  button.dataset.film=film.id;button.setAttribute('aria-pressed',String(index===0));
  title.textContent=film.title;number.textContent=String(index+1).padStart(2,'0');
  button.append(title,number);button.addEventListener('click',()=>selectFilm(film.id));filmList.append(button);
});

function updateRelease() {
  const release=releases[selectedRelease],text=copy[language];
  if(releasePlayer.dataset.release!==release.id)stopRelease();
  const cover=$<HTMLImageElement>('#release-cover');
  cover.src=asset('images/cover-'+release.cover+'.webp');cover.alt=release.title;
  $('#release-title').textContent=release.title;
  $('#release-meta').textContent=text[release.kind]+' / '+release.year;
  $('#art-credit').textContent=release.artwork?text.artwork+' / '+release.artwork:'';
  const container=$('#release-links');container.replaceChildren();
  if(release.spotify)container.append(link('Spotify',release.spotify));
  container.append(link('Bandcamp',release.bandcamp));
  if(release.youtube){
    const button=document.createElement('button');
    button.type='button';button.className='release-youtube';button.textContent='YouTube';
    button.setAttribute('aria-label',text.listen+' / '+release.title+' / YouTube');
    button.setAttribute('aria-controls','release-player');
    const icon=document.createElement('span');icon.textContent='▷';icon.setAttribute('aria-hidden','true');button.append(icon);
    button.addEventListener('click',()=>{
      stopCinema();stopLive();
      const params=new URLSearchParams({autoplay:'1',rel:'0',playsinline:'1',controls:'1',hl:language});
      if(release.youtube!.playlistId)params.set('list',release.youtube!.playlistId);
      const frame=document.createElement('iframe');
      frame.src=`https://www.youtube-nocookie.com/embed/${release.youtube!.videoId}?${params}`;
      frame.title=release.title+' / YouTube';frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
      releasePlayer.replaceChildren(frame);releasePlayer.dataset.release=release.id;releasePlayer.hidden=false;
      syncModalState();releasePlayer.scrollIntoView({block:'nearest'});
    });
    container.append(button);
  }
  $('#release-position').textContent=String(selectedRelease+1).padStart(2,'0')+' / 05';
}
function stopRelease(){
  releasePlayer.replaceChildren();releasePlayer.hidden=true;delete releasePlayer.dataset.release;
  syncModalState();
}
function showRecording(index: number){
  if(index===currentRecording)return;
  currentRecording=index;
  const release=releases[index];
  document.body.dataset.currentRecording=release.id;
  releaseList.querySelectorAll('button').forEach((button,item)=>{
    button.classList.toggle('is-current',item===index);
    button.parentElement!.classList.toggle('is-current',item===index);
    const drawer=button.parentElement!.querySelector<HTMLElement>('.release-track-drawer')!;
    drawer.inert=item!==index;drawer.setAttribute('aria-hidden',String(item!==index));
    if(item===index)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');
  });
}
function syncModalState() {
  const open=dialogs.some(dialog=>dialog.open);
  const livePlaying=Boolean(livePlayer);
  document.body.classList.toggle('modal-open',open);
  document.body.classList.toggle('live-playing',livePlaying);
  document.body.classList.toggle('cinema-playing',Boolean(cinemaPlayer));
  ambient.setBlocked(filmDialog.open||livePlaying||Boolean(cinemaPlayer)||!releasePlayer.hidden);
  world?.setLivePlaying(livePlaying);
  world?.setCinemaPlaying(Boolean(cinemaPlayer));
  if(stillMode)updateStill();
}
function openDialog(dialog: HTMLDialogElement) {
  const invoker=lastInvoker ?? (document.activeElement instanceof HTMLElement?document.activeElement:null);
  if(invoker)invokers.set(dialog,invoker);
  for(const existing of dialogs)if(existing.open && existing!==dialog)existing.close();
  if(!dialog.open)dialog.showModal();
  syncModalState();
}
function openRelease(index: number) {
  selectedRelease=(index+releases.length)%releases.length;
  updateRelease();openDialog(releaseDialog);
}
function selectFilm(id: string) {
  const playing=Boolean(cinemaPlayer);
  const changed=selectedFilm.id!==id;
  selectedFilm=films.find(film=>film.id===id) ?? films[0];
  $('#cinema-title').textContent=selectedFilm.title;
  $('#film-kind').textContent=copy[language][selectedFilm.kind==='video'?'film':'visualiser'];
  filmList.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.film===id)));
  world?.selectFilm(id);
  if(stillMode)updateStill();
  if(playing&&changed)startCinema();
}
function openFilm(id: string) {
  selectFilm(id);
  navigate('cinema',true);
  startCinema();
}
function startCinema(){
  stopLive();stopCinema();
  for(const dialog of dialogs)if(dialog.open)dialog.close();
  cinemaPlayer=new VideoPlayer($('#cinema-screen-player'),selectedFilm.title,selectedFilm.youtubeId,language);
  $('#cinema-play').hidden=true;$('#cinema-stop').hidden=false;
  syncModalState();
}
function stopCinema(){
  cinemaPlayer?.destroy();cinemaPlayer=undefined;
  $('#cinema-play').hidden=false;$('#cinema-stop').hidden=true;
  syncModalState();
}
function openProjection(title:string,youtubeId:string,kind:'cinema'|'club'){
  stopLive();stopCinema();dialogPlayer?.destroy();
  $('#projection-kind').dataset.i18n=kind;$('#projection-kind').textContent=copy[language][kind];
  $('#projection-title').textContent=title;
  $<HTMLAnchorElement>('#external-film').href='https://www.youtube.com/watch?v='+youtubeId;
  dialogPlayer=new VideoPlayer($('#film-player'),title,youtubeId,language);openDialog(filmDialog);
}
for(const [selector,direction] of [['#previous-film',-1],['#next-film',1]] as const){
  $(selector).addEventListener('click',()=>{
    const index=films.findIndex(film=>film.id===selectedFilm.id);
    selectFilm(films[(index+direction+films.length)%films.length].id);
  });
}
dialogs.forEach(dialog=>{
  dialog.querySelector<HTMLButtonElement>('[data-close]')!.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;
    const bounds=dialog.getBoundingClientRect();
    if(event.clientX<bounds.left || event.clientX>bounds.right || event.clientY<bounds.top || event.clientY>bounds.bottom)dialog.close();
  });
  dialog.addEventListener('close',()=>{
    if(dialog===releaseDialog)stopRelease();
    if(dialog===filmDialog){dialogPlayer?.destroy();dialogPlayer=undefined;}
    syncModalState();
    if(!dialogs.some(item=>item.open)){
      const trigger=invokers.get(dialog);
      if(trigger?.isConnected)trigger.focus({preventScroll:true});
    }
  });
});
$('#previous-release').addEventListener('click',()=>{selectedRelease=(selectedRelease+4)%5;updateRelease();});
$('#next-release').addEventListener('click',()=>{selectedRelease=(selectedRelease+1)%5;updateRelease();});
$('#cinema-play').addEventListener('click',()=>openFilm(selectedFilm.id));
function stopLive(){
  livePlayer?.destroy();livePlayer=undefined;$('#live-play').hidden=false;$('#live-stop').hidden=true;
  syncModalState();
}
$('#live-play').addEventListener('click',()=>{
  stopCinema();stopLive();
  livePlayer=new VideoPlayer($('#live-screen-player'),liveConcert.title,liveConcert.youtubeId,language);
  $('#live-play').hidden=true;$('#live-stop').hidden=false;
  syncModalState();
});
$('#live-stop').addEventListener('click',()=>{stopLive();$('#live-play').focus({preventScroll:true});});
$('#cinema-stop').addEventListener('click',()=>{stopCinema();$('#cinema-play').focus({preventScroll:true});});
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||dialogs.some(dialog=>dialog.open)||document.fullscreenElement)return;
  if(cinemaPlayer){stopCinema();$('#cinema-play').focus({preventScroll:true});}
  else if(livePlayer){stopLive();$('#live-play').focus({preventScroll:true});}
});
$('#secret-figure').addEventListener('click',()=>openProjection(secretConcert.title,secretConcert.youtubeId,'club'));
document.querySelectorAll<HTMLButtonElement>('[data-play]').forEach(button=>button.addEventListener('click',()=>openFilm(button.dataset.play!)));
$('#sound-toggle').addEventListener('click',()=>{void ambient.toggle();});
const fullscreenToggle=$<HTMLButtonElement>('#fullscreen-toggle');
let fullscreenPending=false;
function updateFullscreen(){
  const active=Boolean(document.fullscreenElement);
  const label=copy[language][active?'exitFullscreen':'enterFullscreen'];
  fullscreenToggle.hidden=!document.fullscreenEnabled;
  fullscreenToggle.setAttribute('aria-pressed',String(active));
  fullscreenToggle.setAttribute('aria-label',label);
  fullscreenToggle.title=label;
}
fullscreenToggle.addEventListener('click',async()=>{
  if(fullscreenPending)return;
  fullscreenPending=true;fullscreenToggle.disabled=true;
  $('#fullscreen-status').textContent='';
  try{
    if(document.fullscreenElement)await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }catch{
    $('#fullscreen-status').textContent=copy[language].fullscreenFailed;
  }finally{
    fullscreenPending=false;fullscreenToggle.disabled=false;updateFullscreen();
  }
});
document.addEventListener('fullscreenchange',()=>{
  $('#fullscreen-status').textContent='';updateFullscreen();
});
$('#sound-hint').addEventListener('click',()=>{
  if(!ambient.requested)void ambient.toggle();else void ambient.unlock();
});
function awakenSound(event: Event){
  if(event.target instanceof Element && event.target.closest('#sound-toggle') &&
    ['pointerdown','pointerup','touchstart','touchend','click','keydown'].includes(event.type))return;
  void ambient.unlock();
}
for(const type of ['pointermove','pointerdown','pointerup','mousemove','mousedown','mouseup','wheel','scroll','touchstart','touchmove','touchend','click','keydown','keyup']){
  document.addEventListener(type,awakenSound,{passive:true,capture:true});
}
function updateControls() {
  const text=copy[language],state=ambient.state;
  const unavailable=state==='unavailable';
  world?.setHuntSoundEnabled(ambient.requested);
  document.body.dataset.sound=state;
  $('#sound-state').textContent=unavailable?text.unavailableState:text[ambient.requested?'on':'off'];
  const toggle=$<HTMLButtonElement>('#sound-toggle');
  toggle.setAttribute('aria-pressed',String(ambient.requested));
  toggle.setAttribute('aria-label',unavailable?text.unavailable:text[ambient.requested?'mute':'unmute']);
  toggle.disabled=unavailable;toggle.setAttribute('aria-disabled',String(unavailable));
  updateSoundInvitation();
}
function updateSoundInvitation(){
  const state=ambient.state,hint=$('#sound-hint');
  hint.hidden=secretPlaying||!(state==='waiting'||(state==='off'&&retreat<0));
  if(hint.textContent!==copy[language].soundHint)hint.textContent=copy[language].soundHint;
}
function translate() {
  const text=copy[language];document.documentElement.lang=language;
  renderBand(language);
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(element=>{
    const key=element.dataset.i18n as keyof typeof text;
    if(key in text)element.textContent=text[key];
  });
  document.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.lang===language)));
  document.querySelector('.language-switch')!.setAttribute('aria-label',text.language);
  releaseList.setAttribute('aria-label',text.selectRelease);filmList.setAttribute('aria-label',text.chooseFilm);
  $('#previous-film').setAttribute('aria-label',text.previousFilm);$('#next-film').setAttribute('aria-label',text.nextFilm);
  $('#secret-figure').setAttribute('aria-label',text.secretFigure);
  $('#live-stop').setAttribute('aria-label',text.stopLive);
  $('#cinema-stop').setAttribute('aria-label',text.stopLive);
  for(const player of [cinemaPlayer,livePlayer,dialogPlayer])player?.translate(language);
  document.querySelectorAll('[data-close]').forEach(button=>button.setAttribute('aria-label',text.close));
  $('#previous-release').setAttribute('aria-label',text.previous);$('#next-release').setAttribute('aria-label',text.next);
  $('#chapter-name').textContent=text[chapterKeys[currentChapter]];
  updateControls();updateFullscreen();selectFilm(selectedFilm.id);
  if(releaseDialog.open)updateRelease();
  document.title=language==='pl'?'GODBITE — Muzyka zależna / Brak alternatywy':'GODBITE — Dependent music / No alternative';
}
document.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach(button=>button.addEventListener('click',()=>{
  language=button.dataset.lang as Language;
  try{localStorage.setItem('godbite-language',language);}catch{}
  translate();
}));

let retreat=0;
let retreatTriggered=false;
let secretPlaying=false;
function resetRetreat(){
  retreat=0;retreatTriggered=false;
  secretPlaying=false;delete document.body.dataset.easterEgg;
  world?.setSecretPlaying(false);
  ambient.cancelSample();
  document.body.style.setProperty('--sound-demand','0');
  updateSoundInvitation();
}
function canRetreat(target: EventTarget | null){
  // Short-screen copy has its own native scrolling; do not turn it into a retreat gesture.
  const stage=target instanceof Element?target.closest<HTMLElement>('.hero-stage'):null;
  if(stage&&retreat===0&&stage.scrollHeight>stage.clientHeight+1)return false;
  return !stillMode&&Boolean(world)&&!reducedMotion.matches&&scrollY<=0&&!dialogs.some(dialog=>dialog.open)
    &&!(target instanceof Element&&target.closest('a,button,input,textarea,select,iframe'));
}
function moveRetreat(delta: number){
  retreat=Math.max(RETREAT_LIMIT,Math.min(0,retreat+delta));
  if(retreat<0)void ambient.prepareSample(asset('audio/never-should-have-come-here.mp3'));
  else resetRetreat();
  requestJourney();
}
function nestedScroller(target:EventTarget|null){
  let element=target instanceof Element?target:null;
  while(element&&element!==document.body&&element!==document.documentElement){
    if(element instanceof HTMLElement&&element.scrollHeight>element.clientHeight+1&&/auto|scroll/.test(getComputedStyle(element).overflowY))return element;
    element=element.parentElement;
  }
  return null;
}
function canScroll(element:HTMLElement,pixels:number){
  return pixels<0?element.scrollTop>1:element.scrollTop+element.clientHeight<element.scrollHeight-1;
}
let wheelFrame=0;
let wheelMotion:{scroller:HTMLElement|null;position:number;target:number;written:number;time:number;direction:number}|null=null;
function stopWheelScroll(){
  cancelAnimationFrame(wheelFrame);wheelFrame=0;wheelMotion=null;
}
function smoothWheelScroll(pixels:number,scroller:HTMLElement|null=null){
  if(!pixels)return;
  const current=scroller?scroller.scrollTop:scrollY;
  const maximum=scroller?scroller.scrollHeight-scroller.clientHeight:document.documentElement.scrollHeight-document.documentElement.clientHeight;
  if(reducedMotion.matches){
    stopWheelScroll();
    if(scroller)scroller.scrollBy({top:pixels,behavior:'instant'});
    else window.scrollBy({top:pixels,behavior:'instant'});
    return;
  }
  const direction=Math.sign(pixels);
  if(!wheelMotion||wheelMotion.scroller!==scroller||wheelMotion.direction!==direction||Math.abs(current-wheelMotion.written)>2){
    stopWheelScroll();
    wheelMotion={scroller,position:current,target:current,written:current,time:performance.now(),direction};
  }
  // Accumulate every high-resolution wheel delta instead of restarting an animation per event.
  wheelMotion.target=Math.max(0,Math.min(maximum,wheelMotion.target+pixels));
  if(wheelFrame)return;
  wheelMotion.time=performance.now();
  const frame=(time:number)=>{
    const motion=wheelMotion;
    if(!motion)return;
    const actual=motion.scroller?motion.scroller.scrollTop:scrollY;
    if(Math.abs(actual-motion.written)>2){stopWheelScroll();return;}
    const elapsed=Math.max(0,time-motion.time);motion.time=time;
    motion.position+=(motion.target-motion.position)*(1-Math.exp(-elapsed/65));
    const settled=Math.abs(motion.target-motion.position)<.5;
    if(settled)motion.position=motion.target;
    if(motion.scroller)motion.scroller.scrollTo({top:motion.position,behavior:'instant'});
    else window.scrollTo({top:motion.position,behavior:'instant'});
    motion.written=motion.scroller?motion.scroller.scrollTop:scrollY;
    // Keep fractional input after settling; tiny trackpad deltas must not disappear.
    if(settled)wheelFrame=0;
    else wheelFrame=requestAnimationFrame(frame);
  };
  wheelFrame=requestAnimationFrame(frame);
}
function moveJourney(pixels:number,target:EventTarget|null,smooth=false){
  if(retreat<0||(canRetreat(target)&&scrollY<=0&&pixels<0)){
    stopWheelScroll();moveRetreat(pixels/2400);return;
  }
  if(smooth)smoothWheelScroll(pixels);
  else window.scrollBy({top:pixels,behavior:'instant'});
}
addEventListener('wheel',event=>{
  if(event.ctrlKey)return;
  if(forestSecretMode!=='none'){event.preventDefault();return;}
  if(secretPlaying){event.preventDefault();return;}
  if(dialogs.some(dialog=>dialog.open)||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
  const scroller=nestedScroller(event.target);
  const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1);
  event.preventDefault();
  // Use the same wheel direction in copy and scenes, then leave copy at its edge.
  if(retreat===0&&scroller&&canScroll(scroller,-pixels)){
    smoothWheelScroll(-pixels,scroller);return;
  }
  moveJourney(-pixels,event.target,true);
},{passive:false});
for(const type of ['pointerdown','keydown','resize'])addEventListener(type,stopWheelScroll,{passive:true});
let retreatTouch: {id:number;x:number;y:number;target:EventTarget|null} | null=null;
addEventListener('touchstart',event=>{
  stopWheelScroll();
  retreatTouch=null;
  if(event.touches.length!==1||dialogs.some(dialog=>dialog.open)
    ||(event.target instanceof Element&&event.target.closest('input,textarea,select,iframe')))return;
  const touch=event.touches[0];
  retreatTouch={id:touch.identifier,x:touch.clientX,y:touch.clientY,target:event.target};
},{passive:true});
addEventListener('touchmove',event=>{
  if(forestSecretMode!=='none'){if(event.cancelable)event.preventDefault();return;}
  if(event.touches.length!==1){retreatTouch=null;return;}
  if(secretPlaying){if(event.cancelable)event.preventDefault();return;}
  if(!retreatTouch)return;
  const touch=event.touches[0];
  if(touch.identifier!==retreatTouch.id)return;
  const dx=touch.clientX-retreatTouch.x,dy=touch.clientY-retreatTouch.y;
  // Own vertical gestures from their first movement, before Chrome pans its toolbar.
  if(Math.abs(dx)>Math.abs(dy)&&retreat===0){retreatTouch=null;return;}
  retreatTouch.x=touch.clientX;retreatTouch.y=touch.clientY;
  // Native copy scrolling owns the gesture only while it can move in that direction.
  // A new swipe at its boundary must be allowed to return to the journey.
  const scroller=nestedScroller(retreatTouch.target);
  if(retreat===0&&scroller&&canScroll(scroller,-dy))return;
  if(!event.cancelable)return;
  event.preventDefault();
  if(retreat<0||(canRetreat(retreatTouch.target)&&scrollY<=0&&dy>0)){
    moveRetreat(-dy/Math.max(360,innerHeight*.7));
  }else moveJourney(-dy,retreatTouch.target);
},{passive:false});
for(const type of ['touchend','touchcancel'])addEventListener(type,()=>{retreatTouch=null;},{passive:true});
function progress(){
  if(scrollY<=0&&retreat<0)return retreat;
  const y=Math.max(0,scrollY);
  for(let index=0;index<sections.length-1;index++){
    const start=sections[index].offsetTop,end=sections[index+1].offsetTop;
    if(y<end)return SCENE_ANCHORS[index]+(SCENE_ANCHORS[index+1]-SCENE_ANCHORS[index])*Math.max(0,(y-start)/(end-start));
  }
  return SCENE_ANCHORS[SCENE_ANCHORS.length-1];
}
let scrollPending=false;
function updateStill(){
  const scene=chapters[currentChapter];
  const image=scene==='cinema'&&selectedFilm.id!==films[0].id?'cinema-'+selectedFilm.id:(scene==='live'||scene==='band')&&innerWidth<800?scene+'-mobile':scene;
  still.style.backgroundImage='url("'+asset('images/'+image+'.webp')+'")';
  still.style.backgroundSize=scene==='cinema'&&innerWidth<800?`${innerWidth*1.61}px auto`:'cover';
  if(scene==='cinema'){
    // The fallback stills are 1600×1000; the projection's corners are (392,270) and (1207,729).
    const scale=innerWidth<800?innerWidth*1.61/1600:Math.max(innerWidth/1600,innerHeight/1000);
    const bounds={left:(innerWidth-1600*scale)/2+392*scale,top:(innerHeight-1000*scale)/2+270*scale,width:815*scale,height:459*scale};
    for(const [key,value] of Object.entries(bounds))stages[2].style.setProperty('--cinema-'+key,value+'px');
  }
  if(scene==='live')$('#still-live-playing').style.backgroundImage='url("'+asset('images/'+image+'-playing.webp')+'")';
  if(scene==='live')positionSecretFigure(liveFigureStillBounds(innerWidth,innerHeight));
}
function positionSecretFigure(bounds:{x:number;y:number;width:number;height:number}|null){
  const trigger=$('#secret-figure');trigger.hidden=!bounds;
  if(!bounds)return;
  for(const [key,value] of Object.entries(bounds))trigger.style.setProperty('--figure-'+key,value+'px');
}
function updateJourney() {
  scrollPending=false;
  if(scrollY>0&&retreat<0)resetRetreat();
  const p=progress(),{index,opacity}=chapterPresentation(p);
  document.body.style.setProperty('--atmosphere-presence',String(atmospherePresence(p)));
  stages.forEach((stage,i)=>{
    const hidden=i!==index||opacity<.001;
    stage.hidden=hidden;stage.inert=hidden;
    stage.style.opacity=String(i===index?opacity:0);
    sections[i].setAttribute('aria-hidden',String(hidden));
  });
  currentChapter=index;
  if(index!==3&&$('#live-screen-player').childElementCount)stopLive();
  if(index!==2&&cinemaPlayer)stopCinema();
  document.body.dataset.chapter=chapters[index];
  if(index!==2)world?.setFilmHovered(false);
  $('#chapter-name').textContent=copy[language][chapterKeys[index]];
  $('#chapter-number').textContent=String(index+1).padStart(2,'0');
  $('#position-fill').style.width=(Math.max(0,p)/SCENE_ANCHORS[SCENE_ANCHORS.length-1]*100)+'%';
  document.querySelectorAll<HTMLAnchorElement>('[data-nav]').forEach(anchor=>{
    if(anchor.dataset.nav===chapters[index])anchor.setAttribute('aria-current','location');
    else anchor.removeAttribute('aria-current');
  });
  if(stillMode)updateStill();
  if(!world)showRecording(activeRecording(p));
  world?.setProgress(p);ambient.setProgress(Math.max(0,p));
}
function requestJourney() { if(!scrollPending){scrollPending=true;requestAnimationFrame(updateJourney);} }
addEventListener('scroll',requestJourney,{passive:true});
addEventListener('resize',requestJourney,{passive:true});

function navigate(chapter: Chapter, instant=false) {
  stopWheelScroll();
  resetRetreat();requestJourney();
  const section=$('#'+chapter);
  history.replaceState(null,'','#'+chapter);
  window.scrollTo({top:section.offsetTop,behavior:instant||reducedMotion.matches?'instant':'smooth'});
  if(instant)updateJourney();
}
document.querySelectorAll<HTMLAnchorElement>('[data-nav]').forEach(anchor=>anchor.addEventListener('click',event=>{
  event.preventDefault();const chapter=anchor.dataset.nav as Chapter;
  navigate(chapter,true);
}));
document.querySelectorAll<HTMLAnchorElement>('[data-journey]').forEach(anchor=>anchor.addEventListener('click',event=>{
  event.preventDefault();navigate(anchor.dataset.journey as Chapter);
}));
$('.brand').addEventListener('click',event=>{event.preventDefault();navigate('threshold');});
$('.skip-link').addEventListener('click',event=>{
  event.preventDefault();navigate('contact',true);$<HTMLAnchorElement>('.contact-address>a').focus({preventScroll:true});
});
function onHash() {
  const hash=location.hash.slice(1) as Chapter;
  if(chapters.includes(hash))navigate(hash,true);
}
addEventListener('hashchange',onHash);

const projection=$('#cinema-play');
projection.addEventListener('pointerenter',()=>world?.setFilmHovered(true));
projection.addEventListener('pointerleave',()=>world?.setFilmHovered(false));
projection.addEventListener('focus',()=>world?.setFilmHovered(true));
projection.addEventListener('blur',()=>world?.setFilmHovered(false));

function useStills() {
  resetRetreat();
  for(const key of ['left','top','width','height'])stages[3].style.removeProperty('--live-'+key);
  for(const key of ['left','top','width','height'])stages[2].style.removeProperty('--cinema-'+key);
  stillMode=true;document.body.classList.add('still-mode');document.body.classList.remove('scene-ready');
  world?.destroy();world=undefined;
  updateJourney();
}
async function startWorld() {
  const generation=++worldGeneration;
  if(reducedMotion.matches){useStills();return;}
  try {
    const {World}=await import('./world');
    if(generation!==worldGeneration || reducedMotion.matches)return;
    world=new World({canvas:$<HTMLCanvasElement>('#world-canvas'),onFailure:useStills,onRelease:openRelease,onFilm:()=>openFilm(selectedFilm.id),onForestSecret:mode=>{forestSecretMode=mode;ambient.setHunt(mode==='fps');if(mode==='eyes')ambient.prepareHunt();if(mode==='none')ambient.setProgress(progress());},onHuntHit:()=>ambient.playHuntHit(),onHuntUnlock:()=>ambient.playHuntUnlock(),onToggleHuntSound:()=>{void ambient.toggle();},isSoundEnabled:()=>ambient.requested,onFpsProgress:p=>ambient.setProgress(p),onLiveScreen:bounds=>{
      const stage=stages[3];
      stage.style.setProperty('--live-left',bounds.x+'px');stage.style.setProperty('--live-top',bounds.y+'px');
      stage.style.setProperty('--live-width',bounds.width+'px');stage.style.setProperty('--live-height',bounds.height+'px');
    },onCinemaScreen:bounds=>{
      for(const [key,value] of Object.entries({left:bounds.x,top:bounds.y,width:bounds.width,height:bounds.height}))stages[2].style.setProperty('--cinema-'+key,value+'px');
    },onSecretFigure:positionSecretFigure,onRetreat:p=>{
      const demand=(ambient.state==='off'||ambient.state==='waiting')?Math.pow(Math.max(0,-p),3):0;
      document.body.style.setProperty('--sound-demand',String(demand));
      updateSoundInvitation();
      if(retreat<0&&p<=RETREAT_TRIGGER&&!retreatTriggered){
        retreatTriggered=ambient.playSample({
          start:()=>{
            secretPlaying=true;document.body.dataset.easterEgg='playing';
            world?.setSecretPlaying(true);
            updateSoundInvitation();
          },
          end:()=>{
            if(!secretPlaying)return;
            document.body.dataset.easterEgg='fading';
            const complete=()=>{
              resetRetreat();world?.returnToStart();
              window.scrollTo({top:0,behavior:'instant'});requestJourney();
            };
            const returnCamera=()=>{
              document.body.dataset.easterEgg='returning';
              if(world)world.beginReturnToStart(complete);else complete();
            };
            if(world)world.finishSecretEffect(returnCamera);else complete();
          },
        });
      }
    },onRecording:index=>{
      showRecording(index);
    }});
    stillMode=false;document.body.classList.remove('still-mode');
    world.setProgress(progress());
    world.setLivePlaying(Boolean($('#live-screen-player').childElementCount));
    world.setCinemaPlaying(Boolean(cinemaPlayer));
    if(selectedFilm.id!==films[0].id)world.selectFilm(selectedFilm.id);
  } catch {useStills();}
}
reducedMotion.addEventListener('change',()=>{
  ++worldGeneration;
  if(reducedMotion.matches)useStills();else void startWorld();
});
translate();updateJourney();onHash();ambient.boot();void startWorld();
