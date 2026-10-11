import { copy, releases, type Language } from './content';

type Role = 'vocals' | 'guitar' | 'bass' | 'drums';
interface Member { name: string; role: Role; from?: number; until?: number }
export const members: readonly Member[] = [
  {name:'Arkadiusz Zieliński',role:'vocals',from:2008},
  {name:'Arkadiusz Szoplik',role:'guitar',from:2017},
  {name:'Arkadiusz Rykaczewski',role:'guitar',from:2017},
  {name:'Tomasz Tomczak',role:'bass',from:2024},
  {name:'Tomasz HoRacy Jurkiewicz',role:'drums',from:2008},
];
const history: readonly Member[] = [
  members[0],
  {name:'Patryk Kleparski',role:'guitar',from:2008,until:2014},
  {name:'Jarosław Witek',role:'guitar',from:2008,until:2015},
  {name:'Adrian Fiałkowski',role:'guitar',from:2014,until:2017},
  members[1],members[2],
  {name:'Iwo Andrulaniec-Gustowski',role:'bass',until:2024},
  members[3],members[4],
];

// One list supplies both the visual bars and their readable chronology.
export function renderBand(language: Language){
  const text=copy[language],lineup=document.querySelector('#band-members')!;
  lineup.replaceChildren(...members.map(member=>{
    const row=document.createElement('li'),name=document.createElement('span'),role=document.createElement('span');
    name.textContent=member.name;role.textContent=text[member.role];role.className='member-role';
    row.append(name,role);return row;
  }));
  const timeline=document.querySelector('#band-timeline')!;
  timeline.replaceChildren(...history.map(member=>{
    const row=document.createElement('li');row.className='timeline-row';row.dataset.role=member.role;
    const name=document.createElement('span');name.className='timeline-name';name.textContent=member.name;
    const dates=document.createElement('span');dates.className='timeline-dates';
    const range=member.from?`${member.from}–${member.until??text.historyPresent}`:text.historyUnknown;
    dates.textContent=`${text[member.role]} · ${range}`;
    const rail=document.createElement('span'),bar=document.createElement('i');rail.className='timeline-rail';rail.setAttribute('aria-hidden','true');
    if(!member.from)bar.className='unknown-start';
    bar.style.left=((member.from??2008)-2008)/18*100+'%';
    bar.style.width=((member.until??2026)-(member.from??2008))/18*100+'%';
    rail.append(bar);row.append(name,dates,rail);return row;
  }));
  const milestones=document.querySelector('#band-milestones')!;
  const events=[{year:2008,title:language==='pl'?'Powstanie zespołu · Szczecin':'Formation · Szczecin'},
    ...releases.map(release=>({year:release.year,title:release.id==='horse'?'You can lead a horse':release.title}))];
  milestones.replaceChildren(...events.sort((a,b)=>a.year-b.year).map(event=>{
    const row=document.createElement('li'),year=document.createElement('span');year.textContent=String(event.year);
    row.append(year,document.createTextNode(event.title));return row;
  }));
}
