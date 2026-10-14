import { interiorLayout } from './journey';
import type { FpsRoom } from './first-person';

const biography='https://www.vatican.va/special/canonizzazione-27042014/documents/biografia_gpii_canonizzazione_en.html';
export const HUNT_FACTS=[
  {id:'barka',text:'„Barka” w oryginale nazywa się „Pescador de hombres”. Zanim weszła do polskiego lore, miała hiszpański dubbing.',source:'https://ocp.org/es-us/collections/dg/428/iglesia-en-mision'},
  {id:'cream',text:'Kremówka Gromulskiego ma 331 kcal w 100 g. Inne receptury i porcje mają inne wartości. Ten loot ma konkretną statystykę.',source:'https://www.piekarniagromulski.pl/na-slodko/ciastka/ciastko-kremowka/'},
  {id:'prime',text:'2137 to liczba pierwsza. Dzieli się tylko przez 1 i samą siebie. Nawet matematyka nie potrafi jej rozłożyć.',source:null},
  {id:'composer',text:'W 2021 r. Cesáreo Gabaráinowi, autorowi „Barki” zmarłemu w 1991 r., publicznie zarzucono wykorzystywanie seksualne nieletnich. Postępowanie kościelne zamknięto bez ich potwierdzenia.',source:'https://www.ocp.org/en-us/blog/entry/statement-regarding-father-cesareo-gabarain'},
  {id:'actor',text:'Karol Wojtyła współtworzył konspiracyjny Teatr Rapsodyczny. Zanim wszedł na balkon, miał już doświadczenie sceniczne.',source:biography},
  {id:'quarry',text:'W czasie okupacji Wojtyła pracował w kamieniołomie. Kamienny ekwipunek w tej grze ma więc bardzo daleki prequel.',source:biography},
  {id:'journeys',text:'Jan Paweł II odbył 104 zagraniczne podróże apostolskie. Ta mapa ma tylko pięć scen. Speedrun nadal przed tobą.',source:biography},
  {id:'ferrari',text:'W Muzeach Watykańskich jest kierownica Ferrari F1 podarowana Janowi Pawłowi II. Papamobile miało poważną konkurencję w garażu.',source:'https://www.museivaticani.va/content/museivaticani/it/collezioni/musei/padiglione-delle-carozze/volante-della-ferrari-formula-1.html'},
  {id:'name',text:'Jan Paweł II nazywał się Karol Józef Wojtyła. Papieski nick odblokował dopiero w 1978 roku.',source:biography},
  {id:'number',text:'Jan Paweł II był 264. papieżem. Numer postaci: 264. Kod do sekretu: 2137. Nie pomyl okienek.',source:'https://www.vatican.va/content/john-paul-ii/it.html'},
] as const;
export type HuntFact=typeof HUNT_FACTS[number];

export function huntPlacements(mobile:boolean){
  const l=interiorLayout(mobile),s=mobile?.7:1,z=l.origin[2];
  const entries:{id:string;room:FpsRoom;position:[number,number,number];size:number;hint:string}[]=[
    {id:'birch',room:'gallery',position:[-10,4.4,-26],size:1.5,hint:'Za brzozą / Behind the birch'},
    {id:'records',room:'gallery',position:[17*l.scale,1.4,z-3],size:1.3,hint:'Za postumentami / Behind the plinths'},
    {id:'back-row',room:'cinema',position:[l.cinemaX-9.4*s,2.7,z+l.cinemaZ+20*s],size:1.4,hint:'Ostatni rząd / Back row'},
    {id:'curtain',room:'cinema',position:[l.cinemaX+9*s,5.1,z+l.cinemaZ+1.5*s],size:1.5,hint:'Przy kurtynie / By the curtain'},
    {id:'speaker',room:'live',position:[l.cinemaX-10,2.7,z+l.liveZ+1.9],size:1.45,hint:'Za głośnikiem / Behind the speaker'},
    {id:'rigging',room:'live',position:[l.cinemaX+5.3,7.1,z+l.liveZ-1],size:1.6,hint:'Nad sceną / Above the stage'},
    {id:'mirror',room:'band',position:[l.bandX-11.7,5.5,z+l.bandZ+1.3],size:1.4,hint:'Nad lustrem / Above the mirror'},
    {id:'backstage',room:'band',position:[l.bandX+13,1.5,z+l.bandZ+12],size:1.3,hint:'Za kulisami / Backstage'},
    {id:'signal-left',room:'signal',position:[l.signalX-8,4.8,z+l.signalZ-5],size:1.55,hint:'Wśród sygnałów / Among the signals'},
    {id:'signal-behind',room:'signal',position:[l.signalX+7,2,z+l.signalZ+6],size:1.4,hint:'Za plecami / Behind you'},
  ];
  return entries;
}

/** The shuffled deck is consumed once per distinct impact, never once per shot. */
export class HuntProgress {
  readonly found=new Set<string>();
  private deck:HuntFact[]=[];
  constructor(private random:()=>number=Math.random){this.reset();}
  get total(){return HUNT_FACTS.length;}
  get complete(){return this.found.size===this.total;}
  reset(){
    this.found.clear();this.deck=[...HUNT_FACTS];
    for(let i=this.deck.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.deck[i],this.deck[j]]=[this.deck[j],this.deck[i]];}
  }
  claim(id:string){
    if(this.found.has(id)||!huntPlacements(false).some(mask=>mask.id===id)||this.complete)return null;
    this.found.add(id);return {fact:this.deck[this.found.size-1],count:this.found.size,complete:this.complete};
  }
}
