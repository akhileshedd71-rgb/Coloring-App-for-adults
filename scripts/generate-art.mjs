/**
 * Musemallow original vector drawing collection.
 * Run: node scripts/generate-art.mjs
 * Every shape below is authored here; no stock images, fonts, or remote assets.
 * The generated JSON is the editable master, SVG files are colored browse previews.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/art');
fs.mkdirSync(OUT, { recursive: true });
const W=768,H=1024;
const palettes=[
  ['#f4e6dc','#e7b69b','#754d4b','#e699ac','#b9c9a3','#f3cf78'],
  ['#eee4f3','#9b654b','#342e42','#b9a2d3','#a3c7bd','#f1bd99'],
  ['#e6efed','#d6a883','#423d37','#82aca3','#ecc18b','#e5a2a4'],
  ['#faeadf','#713f31','#322f35','#d5906f','#dec791','#a7bec7'],
  ['#e9eafa','#f0cbb0','#846456','#a4a5d4','#d5aece','#abc9bc'],
  ['#f5e6e9','#b78061','#3d3642','#d78a9e','#9aafbe','#e9d089'],
];
const fmt = n => Number(n.toFixed(2));
const xml = text => String(text).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
const ellipse = (x,y,rx,ry=rx) => `M ${x-rx} ${y} C ${x-rx} ${y-ry*.5523} ${x-rx*.5523} ${y-ry} ${x} ${y-ry} C ${x+rx*.5523} ${y-ry} ${x+rx} ${y-ry*.5523} ${x+rx} ${y} C ${x+rx} ${y+ry*.5523} ${x+rx*.5523} ${y+ry} ${x} ${y+ry} C ${x-rx*.5523} ${y+ry} ${x-rx} ${y+ry*.5523} ${x-rx} ${y} Z`;
const poly = points => `M ${points.map(p=>p.join(' ')).join(' L ')} Z`;
const tr = (p,{x=0,y=0,sx=1,sy=sx,a=0}={}) => {
  const c=Math.cos(a*Math.PI/180),s=Math.sin(a*Math.PI/180);
  const ts=p.match(/[A-Z]|-?(?:\d*\.)?\d+(?:e[+-]?\d+)?/gi); let out=[];
  for(let i=0;i<ts.length;) {
    if(/[A-Z]/i.test(ts[i])){out.push(ts[i++]);continue;}
    const xx=Number(ts[i++])*sx,yy=Number(ts[i++])*sy;
    out.push(fmt(x+xx*c-yy*s),fmt(y+xx*s+yy*c));
  }
  return out.join(' ');
};
class Art {
  constructor(id,variation,difficulty){this.id=id;this.regions=[];this.lines=[];this.colors=[];this.variant=variation;this.level=difficulty;this.palette=palettes[variation%palettes.length];}
  region(p,label='detail',color,transform){this.regions.push({id:`r${String(this.regions.length+1).padStart(3,'0')}`,path:transform?tr(p,transform):p,label});this.colors.push(color||this.pick(label));}
  line(p,width=2,transform){this.lines.push({path:transform?tr(p,transform):p,width:fmt(width)});}
  pick(label){const p=this.palette;if(/skin|face|neck|hand|ear|arm|leg|nose/.test(label))return p[1];if(/hair|brow|pupil|beard/.test(label))return p[2];if(/eye white|tooth/.test(label))return '#fff9f0';if(/lip|makeup/.test(label))return ['#bc6577','#925563','#ad634e'][this.variant%3];if(/iris/.test(label))return ['#8ca697','#b48b56','#88779e'][this.variant%3];if(/background/.test(label))return p[0];if(/halo|frame/.test(label))return '#fff9f0';if(/jewel|button|buckle|gold/.test(label))return p[5];return p[3+(this.regions.length+this.variant)%3];}
  json(){return {id:this.id,width:W,height:H,regions:this.regions,lines:this.lines};}
}

function background(a,style=0) {
  a.region('M 0 0 L 768 0 L 768 1024 L 0 1024 Z','background');
  const frames=[
    'M 88 970 L 88 338 C 88 78 680 78 680 338 L 680 970 Z',
    'M 68 194 Q 68 78 184 78 L 584 78 Q 700 78 700 194 L 700 928 L 68 928 Z',
    ellipse(384,455,325,365),
    'M 82 182 L 616 78 L 706 842 L 150 942 Z',
  ];
  a.region(frames[style%4],'halo');
}
function smallFlower(a,x,y,size=18,n=5,transform) {
  for(let j=0;j<n;j++) {
    const angle=360*j/n;
    a.region(tr(`M 0 0 C -${size*.65} -${size*.45} -${size*.5} -${size*1.5} 0 -${size*1.45} C ${size*.5} -${size*1.5} ${size*.65} -${size*.45} 0 0 Z`,{x,y,a:angle}),'flower petal',undefined,transform);
  }
  a.region(ellipse(x,y,size*.25),'jewel center',undefined,transform);
}
function leaf(a,x,y,w,h,angle=0,label='fabric leaf',transform) {
  a.region(tr(`M 0 0 Q ${-w} ${-h*.5} 0 ${-h} Q ${w} ${-h*.5} 0 0 Z`,{x,y,a:angle}),label,undefined,transform);
}
function jewelry(a,t,style=0) {
  const size=a.level===0?10:15;
  for(const side of [-1,1]) {
    if(style%3===0) {
      a.region(ellipse(side*115,64,size,size*1.45),'gold earring',undefined,t);
      if(a.level>0)a.region(ellipse(side*115,64,size*.5,size*.86),'earring inset',a.palette[0],t);
    } else if(style%3===1) {
      a.region(`M ${side*115} 48 L ${side*115+11} 70 L ${side*115} 88 L ${side*115-11} 70 Z`,'jewel earring',undefined,t);
      if(a.level>0)a.line(`M ${side*115-11} 70 L ${side*115+11} 70 M ${side*115} 48 L ${side*115} 88`,1,t);
    } else {
      a.region(ellipse(side*115,58,8),'gold earring',undefined,t);
      if(a.level>0)a.region(`M ${side*115} 67 Q ${side*115-20} 92 ${side*115} 107 Q ${side*115+20} 92 ${side*115} 67 Z`,'jewel drop',undefined,t);
    }
  }
}
// Twelve distinctly constructed hairstyles. Coordinates are relative to the face.
function hairBack(a,t,style) {
  const styles=[
    'M -119 105 C -172 55 -150 -141 -96 -169 C -39 -213 77 -192 117 -127 C 155 -66 151 57 121 115 L 65 150 L -74 150 Z',
    'M -115 -33 C -166 -52 -126 -118 -148 -132 C -107 -123 -112 -190 -67 -177 C -29 -211 20 -191 40 -191 C 84 -209 129 -162 118 -140 C 165 -113 145 -73 115 -44 Z',
    'M -121 86 C -184 103 -190 61 -182 24 C -224 -6 -205 -52 -184 -70 C -213 -113 -165 -162 -139 -158 C -138 -208 -86 -230 -57 -218 C -29 -252 27 -235 50 -215 C 95 -248 135 -212 141 -185 C 196 -183 211 -129 185 -101 C 226 -71 219 -20 194 -2 C 216 48 176 95 146 89 C 139 124 98 128 80 112 L -66 120 Z',
    'M -124 34 C -151 -113 -94 -191 -3 -195 C 102 -201 163 -99 125 41 L 136 113 L 82 155 L -81 143 Z',
    'M -119 -9 C -167 -56 -105 -152 -126 -168 C -72 -130 -53 -224 34 -183 C 62 -219 147 -153 129 -108 L 119 -6 Z',
    'M -97 -157 C -40 -209 64 -195 107 -142 C 168 -91 146 -21 152 25 C 181 91 142 111 161 170 C 147 235 95 261 59 239 L -100 249 C -150 224 -181 184 -151 140 C -187 90 -148 47 -155 9 C -169 -65 -159 -113 -97 -157 Z',
    'M -95 -95 C -156 -141 -140 -204 -82 -213 C -126 -278 16 -320 57 -242 C 117 -237 155 -188 113 -143 L 121 22 L -119 22 Z',
    'M -121 -50 C -170 -128 -94 -199 1 -199 C 104 -204 152 -116 127 -48 L 165 215 L 90 245 L -116 231 L -155 155 Z',
    'M -111 -99 C -67 -184 63 -190 114 -103 C 149 -56 134 30 141 90 L 166 230 L -163 230 C -127 124 -160 -42 -111 -99 Z',
    'M -122 -48 C -156 -151 -42 -199 30 -184 C 108 -213 181 -150 157 -95 C 211 -42 179 67 195 139 C 176 189 139 210 123 175 L 124 -6 Z',
    'M -116 46 C -169 -13 -158 -136 -104 -179 C -47 -232 82 -201 124 -139 C 150 -94 160 -5 133 48 L 162 136 L 100 196 L -101 184 L -159 120 Z',
    'M -119 -33 C -161 -82 -137 -130 -94 -142 C -94 -192 -35 -204 -4 -184 C 39 -223 95 -180 93 -158 C 144 -160 157 -100 125 -69 L 124 43 L -122 45 Z',
  ];
  a.region(styles[style%12],'hair silhouette',undefined,t);
  // Curl and loc perimeter cells are real closed hair regions, never decorative raster noise.
  if(style===2&&a.level>0) {
    const n=a.level===2?22:10;
    for(let j=0;j<n;j++) {
      const ang=Math.PI*(1.05+j/(n-1)*.91),x=Math.cos(ang)*158,y=-50+Math.sin(ang)*154;
      a.region(ellipse(x,y,a.level===2?19:27,a.level===2?25:30),'hair coil',undefined,t);
      a.line(`M ${x-7} ${y-5} C ${x-7} ${y-18} ${x+15} ${y-9} ${x+7} ${y+7}`,1.3,t);
    }
  }
  if(style===7) {
    for(let j=0;j<(a.level===0?4:a.level===1?8:16);j++) {
      const n=a.level===0?4:a.level===1?8:16,x=-139+j*278/(n-1),end=210+(j%3)*13;
      if(Math.abs(x)<94)continue;
      a.region(`M ${x-9} -97 C ${x-20} 10 ${x+12} 127 ${x-9} ${end} Q ${x} ${end+19} ${x+9} ${end} C ${x+22} 87 ${x-5} 14 ${x+9} -97 Z`,'hair loc',undefined,t);
      if(a.level===2)for(let y=75;y<190;y+=30)a.region(`M ${x-10} ${y} L ${x+10} ${y} L ${x+10} ${y+8} L ${x-10} ${y+8} Z`,'gold hair cuff',undefined,t);
    }
  }
}
function face(a,t,{style=0,expression=0,mature=false,masculine=false,fullness=0}={}) {
  const f=fullness*8,jaw=masculine?77+f:54+f;
  for(const side of [-1,1]) {
    a.region(tr('M 104 -7 C 139 -25 142 35 121 48 L 109 40 Z',{sx:side,sy:1}),'ear skin',undefined,t);
    a.line(tr('M 117 5 Q 134 -4 128 25 L 118 32',{sx:side,sy:1}),1.5,t);
  }
  a.region(`M -108 -77 C -101 -157 -51 -169 0 -166 C 63 -166 105 -133 111 -67 L ${112+f} 30 Q ${109+f} 87 ${jaw} 116 Q 32 158 0 158 Q -30 157 ${-jaw} 116 Q ${-109-f} 84 ${-112-f} 26 Z`,'face skin',undefined,t);
  // Eye whites form their own closed regions, supporting precise tap fills.
  for(const side of [-1,1]) {
    const e={...t}; const mir=p=>tr(p,{sx:side,sy:1});
    if(expression===2) {
      a.line(mir('M 29 -6 Q 56 9 82 -8'),2.7,e);
      a.line(mir('M 70 -1 L 76 6 M 79 -6 L 86 0'),1.6,e);
    } else {
      const eye=expression===1?'M 27 -8 Q 54 -24 85 -8 Q 57 3 27 -8 Z':expression===3?'M 27 -1 Q 55 -24 86 -4 Q 61 12 27 -1 Z':'M 27 -5 Q 56 -24 86 -5 Q 61 10 27 -5 Z';
      a.region(mir(eye),'eye white','#fffaf2',e);
      a.region(mir('M 50 -13 Q 58 -16 66 -13 L 66 0 Q 58 4 50 0 Z'),'iris',undefined,e);
      // Pupils stay crisp line detail rather than extremely small hit targets.
      a.line(mir('M 58 -11 L 58 -3'),4.1,e);
      a.line(mir('M 28 -5 Q 56 -24 86 -5'),2.8,e);
      if(!masculine)a.line(mir('M 77 -11 L 80 -18 M 84 -7 L 88 -14'),1.5,e);
      if(a.level>0)a.line(mir('M 31 -21 Q 60 -34 85 -20'),1.2,e);
    }
    const brow=expression===3?'M 24 -37 Q 47 -51 79 -37 L 88 -31 Q 54 -42 29 -30 Z':'M 23 -36 Q 52 -49 84 -31 L 89 -26 Q 54 -37 27 -29 Z';
    a.region(mir(brow),'brow',undefined,e);
    if(mature) {
      a.line(mir('M 92 -4 L 104 -8 M 93 4 L 103 8 M 33 15 Q 54 24 81 16'),1.1,e);
      a.line(mir('M 41 68 Q 51 82 50 93'),1,e);
    }
  }
  a.line('M 5 -15 C 6 8 7 29 20 45 Q 13 54 6 50 M -7 50 Q -17 55 -23 47 M -14 58 Q 0 63 14 58',1.8,t);
  if(expression===1) {
    a.region('M -37 82 Q -15 81 0 77 Q 16 82 38 81 Q 23 96 0 97 Q -22 96 -37 82 Z','upper lip',undefined,t);
    a.region('M -37 82 Q 0 107 38 81 Q 24 117 0 119 Q -24 116 -37 82 Z','lower lip',undefined,t);
    a.region('M -30 88 Q 0 99 30 87 Q 22 106 0 107 Q -19 105 -30 88 Z','tooth','#fffaf2',t);
    a.line('M -42 77 L -45 87 M 43 77 L 46 87',1.4,t);
  } else {
    const wide=masculine?31:35;
    a.region(`M ${-wide} 87 Q -15 80 -8 79 L 0 82 L 9 79 Q 19 81 ${wide} 87 Q 14 91 0 92 Q -16 91 ${-wide} 87 Z`,'upper lip',undefined,t);
    a.region(`M ${-wide} 87 Q 0 96 ${wide} 87 Q 20 107 0 109 Q -20 106 ${-wide} 87 Z`,'lower lip',undefined,t);
  }
  a.line('M -14 127 Q 0 131 14 127',1.1,t);
  if(mature)a.line('M -37 -73 Q 0 -82 35 -71 M -29 -62 Q 1 -69 29 -61',1.1,t);
  if(masculine&&style%3===1) {
    a.region('M -104 54 Q -83 99 -60 103 L -33 83 Q 0 77 35 84 L 61 104 Q 93 83 105 50 Q 101 104 65 128 Q 24 164 0 159 Q -39 153 -70 124 Q -105 96 -104 54 Z','beard',undefined,t);
    a.region('M -35 96 Q 0 86 35 96 Q 19 113 0 115 Q -21 112 -35 96 Z','lower lip',undefined,t);
    a.line('M -67 108 L -58 120 M -45 117 L -37 131 M -17 125 L -14 140 M 13 125 L 15 140 M 39 116 L 36 130 M 60 106 L 55 120',1.4,t);
  }
}
function hairFront(a,t,style) {
  switch(style) {
    case 0:
      a.region('M -114 -60 C -124 -151 -65 -199 9 -182 C 83 -193 126 -134 117 -48 C 63 -71 34 -118 25 -133 Q -33 -80 -114 -60 Z','hair fringe',undefined,t);
      a.region('M -115 -74 Q -96 -38 -104 25 L -82 130 L -126 116 Q -147 44 -115 -74 Z','hair left bob',undefined,t);
      a.region('M 113 -67 Q 103 -24 109 29 L 94 135 L 133 115 Q 145 41 113 -67 Z','hair right bob',undefined,t);
      for(let j=0;j<(a.level===2?10:4);j++)a.line(`M ${-94+j*19} -137 Q ${-74+j*16} -116 ${-104+j*24} -76`,1.2,t);
      break;
    case 1:
    case 4:
    case 11:
      a.region(style===4?'M -113 -55 C -116 -141 -75 -168 -35 -168 C 10 -235 142 -170 120 -103 Q 45 -120 11 -91 Q -42 -49 -113 -55 Z':style===11?'M -115 -59 Q -147 -117 -93 -147 C -46 -202 13 -157 45 -170 Q 113 -173 122 -95 Q 71 -128 35 -102 C -22 -50 -59 -122 -115 -59 Z':'M -115 -65 Q -133 -125 -84 -144 Q -92 -184 -47 -177 Q -12 -209 21 -178 Q 59 -198 91 -160 Q 136 -147 119 -89 Q 75 -112 48 -106 Q 19 -127 -1 -99 Q -43 -124 -63 -94 Z','hair swept crown',undefined,t);
      if(a.level>0)for(let j=0;j<(a.level===2?15:7);j++) {
        const x=-101+j*(213/(a.level===2?15:7));
        a.line(`M ${x} -115 Q ${x+16} -149 ${x+36} -145`,1.1,t);
      }
      break;
    case 2:
      a.region('M -111 -51 Q -128 -113 -91 -146 Q -64 -184 -35 -168 Q 0 -196 28 -170 Q 63 -187 90 -145 Q 129 -130 110 -63 Q 96 -86 88 -104 Q 30 -133 -7 -122 Q -67 -132 -95 -84 Z','hair crown',undefined,t);
      break;
    case 3:
      a.region('M -114 -57 C -150 -115 -77 -201 4 -190 C 89 -184 147 -121 118 -54 Q 89 -97 66 -122 Q -19 -108 -71 -67 Z','hair braided crown',undefined,t);
      {
        const n=a.level===0?5:a.level===1?10:22;
        for(let j=0;j<n;j++) {
          const y=5+j*234/n,x=128+Math.sin(j*.46)*12,dy=234/n;
          a.region(`M ${x} ${y} Q ${x-39} ${y+dy*.2} ${x-10} ${y+dy} Q ${x+31} ${y+dy*.8} ${x} ${y} Z`,'hair braid left',undefined,t);
          a.region(`M ${x+5} ${y} Q ${x+44} ${y+dy*.2} ${x+15} ${y+dy} Q ${x-21} ${y+dy*.8} ${x+5} ${y} Z`,'hair braid right',undefined,t);
        }
        a.region('M 118 244 L 147 244 L 146 257 L 120 257 Z','gold braid tie',undefined,t);
      }
      break;
    case 5:
    case 8:
    case 9:
      a.region('M -117 -47 C -143 -137 -66 -207 9 -182 Q 76 -206 120 -110 L 107 -38 C 76 -61 51 -112 20 -143 Q -30 -86 -91 -66 Z','hair part',undefined,t);
      if(style===5||style===8) {
        for(const side of [-1,1]) {
          a.region(tr(style===5?'M 108 -79 C 89 -12 131 21 109 86 C 88 122 143 148 104 206 L 141 229 Q 174 173 142 135 C 169 76 126 39 141 -9 Z':'M 108 -80 C 92 -11 114 87 96 144 L 112 219 L 144 225 C 121 142 153 49 132 -27 Z',{sx:side,sy:1}),'hair side wave',undefined,t);
          if(a.level>0)a.line(tr('M 122 -18 C 114 28 143 70 127 112 Q 107 166 126 197',{sx:side,sy:1}),1.5,t);
        }
      }
      break;
    case 6:
      a.region('M -116 -23 C -155 -127 -43 -226 22 -183 Q 119 -186 121 -69 L 111 -18 Q 75 -101 26 -135 Q -40 -125 -111 -26 Z','hair pulled back',undefined,t);
      a.region('M -71 -212 Q -81 -261 -24 -271 Q 40 -281 51 -228 Q 15 -204 -71 -212 Z','hair top knot',undefined,t);
      for(let j=0;j<(a.level===2?14:5);j++)a.line(`M ${-105+j*16} ${-58-Math.sin(j*.2)*42} Q ${-60+j*10} -160 ${-20+j*6} -203`,1.2,t);
      break;
    case 7:
      a.region('M -114 -57 C -147 -147 -55 -217 12 -185 Q 111 -189 123 -75 Q 66 -76 32 -127 Q -24 -80 -114 -57 Z','hair loc crown',undefined,t);
      for(let j=0;j<(a.level===2?12:5);j++) {
        const x=-111+j*19;
        a.line(`M ${x} -83 Q ${x+18} -139 ${x+48} -161`,2,t);
      }
      break;
    case 10:
      a.region('M -121 -55 C -151 -146 -53 -201 22 -185 C 100 -179 153 -105 120 -39 Q 76 -110 20 -139 Q -41 -112 -121 -55 Z','headwrap crown',undefined,t);
      a.region('M -114 -44 Q -144 55 -100 138 L -65 196 L -137 224 Q -170 137 -150 59 Z','headwrap drape',undefined,t);
      a.region('M 111 -39 Q 134 27 113 102 L 155 191 L 83 204 L 75 151 Q 121 52 111 -39 Z','headwrap right drape',undefined,t);
      a.line('M -121 -70 Q -23 -186 99 -87 M -134 87 Q -131 160 -108 186 M 113 110 L 136 182',1.6,t);
      break;
  }
  // In medium/hard editions, closed locks trace the sweep of the hairline.
  if(a.level>0&&![2,3,6,10].includes(style)) {
    const n=a.level===2?18:6;
    for(let j=0;j<n;j++) {
      const x=-89+j*169/n,w=169/n*.72,y=-150+Math.abs(x)*.37;
      a.region(`M ${x} ${y} Q ${x+18} ${y-18} ${x+w} ${y-27} Q ${x+32} ${y-15} ${x+22} ${y+6} Z`,'hair ribbon',undefined,t);
    }
  }
}
function head(a,{x=384,y=396,s=1.25,angle=0,style=a.variant%12,expression=a.variant%4,mature=false,masculine=false,fullness=0,jewels=true}={}) {
  const t={x,y,sx:s,a:angle};
  hairBack(a,t,style);
  a.region('M -51 116 L -49 186 Q 0 226 50 186 L 49 116 Z','neck skin',undefined,t);
  a.line('M -35 152 Q -15 176 -12 189 M 36 151 Q 15 177 14 190',1.3,t);
  face(a,t,{style,expression,mature,masculine,fullness});
  hairFront(a,t,style);
  if(jewels)jewelry(a,t,a.variant);
  return t;
}

function blouse(a,style=0,{top=642,wide=0}={}) {
  const left=117-wide,right=651+wide;
  a.region(`M 316 ${top} Q 270 ${top+6} ${left+66} ${top+69} Q ${left} ${top+115} ${left-12} 998 L ${right+12} 998 Q ${right} ${top+115} ${right-66} ${top+69} Q 498 ${top+6} 452 ${top} Q 385 ${top+69} 316 ${top} Z`,'blouse fabric');
  if(style%5===0) {
    a.region(`M 313 ${top} L 384 ${top+60} L 343 ${top+120} L 287 ${top+29} Z`,'left collar');
    a.region(`M 455 ${top} L 384 ${top+60} L 425 ${top+120} L 481 ${top+29} Z`,'right collar');
    a.line(`M 384 ${top+67} L 384 997 M ${left+107} ${top+100} Q ${left+85} 867 ${left+85} 997 M ${right-107} ${top+100} Q ${right-85} 867 ${right-85} 997`,2);
    for(let y=top+145;y<990;y+=65)a.region(ellipse(386,y,5),'gold button');
  } else if(style%5===1) {
    a.region(`M 302 ${top+9} Q 384 ${top+95} 466 ${top+9} L 482 ${top+40} Q 384 ${top+156} 286 ${top+40} Z`,'sweater neckline');
    a.line(`M ${left+78} ${top+99} L ${left+108} 997 M ${right-78} ${top+99} L ${right-108} 997`,2);
  } else if(style%5===2) {
    a.region(`M 304 ${top+3} Q 281 ${top+142} 238 878 L 317 839 L 364 997 L 381 ${top+69} Z`,'jacket left lapel');
    a.region(`M 464 ${top+3} Q 487 ${top+142} 530 878 L 451 839 L 404 997 L 387 ${top+69} Z`,'jacket right lapel');
    a.line(`M 183 843 L 223 997 M 585 843 L 545 997`,2);
    if(a.level>0)a.region('M 533 864 L 614 842 L 618 860 L 538 881 Z','breast pocket');
  } else if(style%5===3) {
    a.region(`M 310 ${top} Q 285 ${top+65} 303 ${top+105} L 376 ${top+36} L 457 ${top+111} Q 482 ${top+58} 455 ${top} L 397 ${top+13} L 357 ${top+13} Z`,'scarf collar');
    a.region(`M 376 ${top+36} Q 420 853 338 972 L 420 994 Q 476 846 397 ${top+35} Z`,'scarf tail');
  } else {
    a.region(`M 305 ${top+8} L 278 ${top+54} Q 384 ${top+187} 490 ${top+54} L 463 ${top+8} Q 384 ${top+102} 305 ${top+8} Z`,'embroidered neckline');
  }
  a.line(`M ${left+32} 875 Q ${left+18} 933 ${left+19} 983 M ${right-32} 875 Q ${right-18} 933 ${right-19} 983`,1.3);
  if(a.level>0&&style%5===1) {
    const n=a.level===2?16:7;
    for(let j=0;j<n;j++) {
      const x=200+j*368/n;
      a.region(`M ${x} 881 Q ${x+9} 859 ${x+18} 881 L ${x+18} 997 L ${x} 997 Z`,'knit panel');
    }
  }
}

function addNecklace(a,x=384,y=749,style=0) {
  if(style%2===0) {
    a.line(`M ${x-74} ${y-72} Q ${x-54} ${y+20} ${x} ${y+30} Q ${x+54} ${y+20} ${x+74} ${y-72}`,2);
    a.region(`M ${x} ${y+18} L ${x+18} ${y+38} L ${x} ${y+64} L ${x-18} ${y+38} Z`,'jewel pendant');
  } else {
    const n=a.level===2?16:8;
    for(let j=0;j<n;j++) {
      const angle=Math.PI*.12+j/(n-1)*Math.PI*.76;
      a.region(ellipse(x+Math.cos(angle)*90,y-47+Math.sin(angle)*83,7.5),'gold necklace bead');
    }
  }
}

function portrait(a,i) {
  background(a,i%4);
  blouse(a,i,{top:650,wide:i%4===1?30:0});
  const t=head(a,{x:384+(i%3-1)*13,y:400,s:1.25,angle:[-5,3,0,6,-3,4,-4,0,3,-5,0,4][i],style:i,expression:i%4,mature:[1,4,8,11].includes(i),masculine:[1,4,7,8,11].includes(i),fullness:i%3-1});
  if(a.level>0)addNecklace(a,384,734,i);
  if(a.level===2)for(const side of [-1,1])smallFlower(a,side*155,146,16,6,t);
}
function features(a,i) {
  background(a,(i+2)%4);
  // Beauty studies crop close enough to explore lashes, lips and facial contours.
  const s=[1.76,1.58,1.68,1.75][i%4],cy=[430,434,438][i%3];
  a.region('M 152 1024 Q 126 806 272 744 L 497 744 Q 631 811 620 1024 Z','draped fabric');
  const t=head(a,{x:384,y:cy,s,angle:(i%5-2)*3,style:[0,4,2,8,6,5,1,9,10,3,11,7][i],expression:[0,3,2,1][i%4],mature:i%4===1,masculine:i%4===1,fullness:i%3-1,jewels:i%3!==1});
  if(i%4===0) {
    for(const side of [-1,1])a.line(tr('M 33 31 Q 57 23 80 31',{sx:side,sy:1}),1.1,t);
    if(a.level>0)for(const side of [-1,1])for(let j=0;j<5;j++)a.region(ellipse(side*(32+j*9),28+(j%2)*5,1.8),'makeup freckles',a.palette[2],t);
  }
  if(i%4===2) {
    a.region('M 253 860 Q 385 941 517 860 L 543 914 Q 386 1000 225 914 Z','silk scarf');
    a.line('M 269 889 Q 381 954 501 890',1.5);
  }
  if(a.level===2)for(let j=0;j<10;j++)a.region(ellipse(223+j*35,943+Math.sin(j*.6)*20,7),'gold hem bead');
}
function hairstyles(a,i) {
  background(a,(i+1)%4);
  blouse(a,(i+1)%5,{top:665});
  const t=head(a,{x:i===3?346:384,y:418,s:i===6?1.12:1.22,style:i,angle:i%2?-4:4,expression:i%4,mature:i===1,masculine:[1,4,7,11].includes(i),fullness:0});
  if(i===10) {
    a.region('M 232 470 Q 206 650 277 745 L 370 681 Q 273 626 232 470 Z','headwrap shoulder drape');
    if(a.level>0)for(let j=0;j<7;j++)a.region(`M ${230+j*7} ${571+j*10} L ${250+j*9} ${680+j*8} L ${259+j*9} ${676+j*8} L ${238+j*7} ${569+j*10} Z`,'woven scarf stripe');
  }
  if(a.level>0&&i%3===0)smallFlower(a,-104,-118,19,5,t);
  if(a.level===2&&i%3!==0)for(let j=0;j<12;j++)a.region(ellipse(-106+j*19,-142+Math.abs(j-5.5)*9,4.5),'jewel hair pin',undefined,t);
}

function hat(a,t,style) {
  if(style%3===0) {
    a.region('M -176 -78 Q -11 -155 175 -93 Q 180 -53 3 -33 Q -165 -17 -176 -78 Z','hat brim',undefined,t);
    a.region('M -105 -89 L -79 -209 Q 5 -250 93 -204 L 115 -87 Q 7 -49 -105 -89 Z','hat crown',undefined,t);
    a.region('M -100 -115 Q 10 -79 109 -112 L 115 -87 Q 7 -49 -105 -89 Z','hat ribbon',undefined,t);
    a.line('M -64 -207 Q -9 -184 66 -210',1.8,t);
  } else if(style%3===1) {
    a.region('M -133 -86 C -184 -143 -67 -214 16 -202 C 146 -219 158 -95 87 -86 Z','beret',undefined,t);
    a.region('M -113 -99 Q -10 -134 110 -96 L 106 -73 Q -4 -105 -112 -73 Z','beret band',undefined,t);
    a.region('M 5 -201 L 8 -223 L 19 -223 L 19 -202 Z','beret stem',undefined,t);
  } else {
    a.region('M -140 -61 Q -139 -127 -102 -166 Q 0 -219 102 -165 Q 139 -127 140 -61 Q 23 -87 -140 -61 Z','cloche hat',undefined,t);
    a.region('M -140 -83 Q -11 -124 139 -83 L 149 -58 Q -3 -92 -148 -54 Z','cloche ribbon',undefined,t);
    if(a.level>0)smallFlower(a,99,-79,22,5,t);
  }
}
function editorial(a,i) {
  background(a,i%4);
  blouse(a,2,{top:647,wide:i%3===1?41:0});
  // Oversized sculptural collar changes the silhouette of each fashion portrait.
  if(i%3===0) {
    a.region('M 264 650 L 192 516 L 135 709 L 283 886 L 350 732 Z','sculptural left collar');
    a.region('M 504 650 L 576 516 L 633 709 L 485 886 L 418 732 Z','sculptural right collar');
    a.line('M 202 570 L 287 815 M 566 570 L 481 815',1.6);
  }
  const t=head(a,{x:384,y:386,s:1.15,angle:i%2?6:-6,style:[0,6,4,8,1,9,11,5,2,10,3,7][i],expression:i%4,masculine:i%4===2,mature:i===4});
  if(i%3===1)hat(a,t,i);
  if(i%3===2) {
    a.region('M -106 -19 Q -65 -45 -21 -20 L -24 13 Q -68 39 -101 7 Z','left sunglasses',a.palette[4],t);
    a.region('M 106 -19 Q 65 -45 21 -20 L 24 13 Q 68 39 101 7 Z','right sunglasses',a.palette[4],t);
    a.line('M -21 -18 Q 0 -25 21 -18 M -106 -19 L -119 -24 M 106 -19 L 119 -24',3,t);
    a.line('M -84 -13 L -48 8 M 48 -12 L 82 9',1,t);
  }
  if(a.level>0)addNecklace(a,384,736,i);
  if(a.level===2)for(let j=0;j<5;j++)for(const side of [-1,1])leaf(a,384+side*(178+j*12),880+j*18,10,34,side*30,'appliqué leaf');
}

function streetwear(a,i) {
  background(a,(i+3)%4);
  const y=649;
  a.region('M 310 644 Q 230 641 169 699 Q 119 784 97 1004 L 669 1004 Q 649 784 598 699 Q 536 641 458 644 Q 385 703 310 644 Z','streetwear jacket');
  if(i%4===0) {
    a.region('M 304 653 Q 254 614 235 669 Q 220 735 314 783 L 383 704 Z','hood left');
    a.region('M 464 653 Q 514 614 533 669 Q 548 735 454 783 L 385 704 Z','hood right');
    a.region('M 266 890 L 502 890 L 529 976 L 240 976 Z','hoodie kangaroo pocket');
    a.line('M 323 754 L 317 850 M 445 754 L 451 850 M 281 906 L 263 952 M 487 906 L 505 952',2);
  } else if(i%4===1) {
    a.region('M 306 645 L 291 787 L 359 748 L 383 700 Z','denim left collar');
    a.region('M 462 645 L 477 787 L 409 748 L 385 700 Z','denim right collar');
    for(const x of [228,435])a.region(`M ${x} 825 L ${x+105} 825 L ${x+103} 895 L ${x+52} 919 L ${x+2} 895 Z`,'denim chest pocket');
    a.line('M 384 715 L 384 1003 M 180 759 L 225 1003 M 588 759 L 543 1003',2);
  } else if(i%4===2) {
    a.region('M 298 652 L 254 821 L 346 806 L 363 1004 L 385 701 Z','bomber left panel');
    a.region('M 470 652 L 514 821 L 422 806 L 405 1004 L 385 701 Z','bomber right panel');
    a.region('M 344 738 L 425 738 L 405 1004 L 363 1004 Z','shirt');
    a.line('M 251 941 L 297 904 M 517 941 L 471 904',2);
  } else {
    a.region('M 305 648 Q 383 707 463 648 L 477 679 Q 386 750 291 679 Z','tee neckline');
    a.region('M 281 811 L 487 811 L 487 944 L 281 944 Z','graphic shirt patch');
    a.region(ellipse(384,874,43),'shirt sun');
    a.line('M 176 747 L 231 1003 M 592 747 L 537 1003',2);
  }
  const t=head(a,{x:384,y:390,s:1.18,style:[4,3,2,0,7,9,1,5,8,11,6,10][i],expression:i%4,masculine:[0,4,6,8].includes(i),fullness:i%3-1});
  if(i%4===0) {
    a.region('M -121 -60 Q -125 -198 5 -191 Q 131 -186 119 -61 Z','beanie cap',undefined,t);
    a.region('M -128 -89 Q 0 -102 128 -87 L 127 -55 Q 0 -73 -127 -56 Z','beanie band',undefined,t);
    if(a.level>0)for(let x=-98;x<110;x+=18)a.line(`M ${x} -94 Q ${x*.7} -168 ${x*.45} -181`,1.3,t);
  }
  if(a.level>0) {
    const n=a.level===2?18:5;
    for(let j=0;j<n;j++)a.region(ellipse(208+(j%3)*20,802+Math.floor(j/3)*26,6),'jacket button');
  }
  if(a.level===2)for(let j=0;j<8;j++)a.region(`M ${489+j*10} ${931-j*10} L ${513+j*10} ${958-j*10} L ${520+j*10} ${951-j*10} L ${496+j*10} ${924-j*10} Z`,'sleeve stripe');
}

function evening(a,i) {
  background(a,(i+1)%4);
  const suit=i%3===1,full=i%3===2;
  if(full){figure(a,i,{gown:true,background:false});return;}
  blouse(a,suit?2:4,{top:652,wide:i%2?12:33});
  if(!suit) {
    a.region('M 194 742 Q 258 801 329 768 L 384 822 L 439 768 Q 510 801 574 742 L 626 994 L 142 994 Z','gown bodice');
    a.line('M 329 790 Q 336 887 312 994 M 439 790 Q 432 887 456 994 M 384 835 L 384 994',1.5);
  } else {
    a.region('M 358 724 L 384 753 L 410 724 L 412 761 L 384 756 L 356 761 Z','bow tie');
    a.region(ellipse(384,751,9),'tie knot');
  }
  head(a,{x:384,y:401,s:1.21,style:[6,4,5,8,1,3,9,7,2,11,0,10][i],expression:i%4,masculine:suit,mature:i===4});
  if(a.level>0)addNecklace(a,384,743,i);
  if(a.level===2)for(let j=0;j<4;j++)for(const side of [-1,1])smallFlower(a,384+side*(91+j*29),896+(j%2)*52,14,5);
}

function cultural(a,i) {
  background(a,i%4);
  blouse(a,4,{top:658,wide:30});
  const t=head(a,{x:384,y:402,s:1.17,style:[10,6,3,4,8,2,0,5,7,9,1,11][i],expression:i%4,masculine:[3,8,10].includes(i),mature:i===10,fullness:i%3-1});
  const style=i%6;
  if(style===0) {
    a.region('M 495 653 L 573 711 L 331 1004 L 193 1004 Z','sari inspired drape');
    a.region('M 495 653 L 518 671 L 261 1004 L 229 1004 Z','sari woven border');
    a.line('M 535 731 L 326 987 M 551 750 L 368 987',1.5);
  } else if(style===1) {
    a.region('M 290 648 L 400 800 L 526 681 L 555 714 L 383 870 L 266 679 Z','kimono inspired collar');
    a.region('M 187 906 Q 384 870 580 906 L 602 998 L 165 998 Z','obi inspired sash');
    a.line('M 202 938 Q 384 915 566 938 M 225 730 L 265 895 M 543 730 L 503 895',1.8);
  } else if(style===2) {
    a.region('M 309 655 Q 259 713 192 790 L 269 1000 L 384 841 L 499 1000 L 576 790 Q 509 713 459 655 Q 384 750 309 655 Z','embroidered shawl');
    a.line('M 211 797 L 271 963 L 384 810 L 497 963 L 557 797',2);
  } else if(style===3) {
    a.region('M 310 653 L 363 707 L 358 963 L 410 963 L 405 707 L 458 653 L 478 682 L 436 732 L 442 998 L 326 998 L 331 732 L 290 682 Z','kurta inspired placket');
    for(let y=748;y<929;y+=44)a.region(ellipse(384,y,6),'gold button');
  } else if(style===4) {
    a.region('M 297 659 Q 385 738 471 659 L 488 699 Q 385 796 280 699 Z','hanbok inspired collar');
    a.region('M 407 748 L 491 719 L 492 768 L 415 773 L 449 878 L 416 894 L 394 785 L 356 861 L 327 838 L 391 768 Z','tied fabric ribbon');
    a.line('M 182 805 Q 384 858 586 805',1.8);
  } else {
    a.region('M 296 655 L 354 723 L 299 1000 L 175 1000 L 213 740 Z','woven left vest');
    a.region('M 472 655 L 414 723 L 469 1000 L 593 1000 L 555 740 Z','woven right vest');
    if(a.level>0)for(let j=0;j<6;j++)for(const side of [-1,1])a.region(`M ${384+side*105} ${793+j*30} L ${384+side*163} ${768+j*30} L ${384+side*168} ${782+j*30} L ${384+side*108} ${809+j*30} Z`,'woven stripe');
  }
  if(a.level>0&&style!==5)for(let j=0;j<(a.level===2?8:3);j++)leaf(a,240+j*39,958-(j%2)*29,10,31,j%2?25:-25,'embroidered leaf');
  if(a.level===2) {
    smallFlower(a,576,881,18,6);
    smallFlower(a,185,873,18,6);
  }
}

function vintage(a,i) {
  background(a,(i+2)%4);
  blouse(a,i%2===0?3:2,{top:658,wide:i%3*10});
  const t=head(a,{x:384,y:416,s:1.14,style:[11,4,0,1,5,8,6,2,9,3,10,7][i],expression:i%4,masculine:i%4===1,mature:i===5});
  if(i%3!==2)hat(a,t,i%3);
  else {
    a.region('M -115 -76 Q -12 -137 118 -83 L 118 -59 Q -8 -109 -113 -52 Z','retro headband',undefined,t);
    a.region('M 78 -95 L 88 -146 L 113 -121 L 140 -142 L 150 -82 L 115 -104 Z','headband bow',undefined,t);
  }
  if(a.level>0)addNecklace(a,384,765,i);
  if(a.level===2)for(let row=0;row<4;row++)for(let col=0;col<5;col++) {
    const x=220+col*82+(row%2)*12,y=806+row*51;
    if(Math.abs(x-384)>50)a.region(ellipse(x,y,7),'polka dot fabric');
  }
}

function limb(a,points,width1,width2,label) {
  const [p,q,r]=points;
  const norm=(from,to)=>{const dx=to[0]-from[0],dy=to[1]-from[1],l=Math.hypot(dx,dy);return [-dy/l,dx/l];};
  const n1=norm(p,q),n2=norm(q,r),blend=[(n1[0]+n2[0])/2,(n1[1]+n2[1])/2];
  const s=(v,w,n)=>[fmt(v[0]+n[0]*w),fmt(v[1]+n[1]*w)];
  const mid=(v,w)=>[(v[0]+w[0])/2,(v[1]+w[1])/2];
  const l0=s(p,width1,n1),l1=s(q,(width1+width2)/2,blend),l2=s(r,width2,n2),r2=s(r,-width2,n2),r1=s(q,-(width1+width2)/2,blend),r0=s(p,-width1,n1);
  // Separate upper/lower contours retain real elbows/knees even in a bent seated pose.
  a.region(`M ${l0.join(' ')} Q ${mid(l0,l1).join(' ')} ${l1.join(' ')} Q ${mid(l1,l2).join(' ')} ${l2.join(' ')} L ${r2.join(' ')} Q ${mid(r2,r1).join(' ')} ${r1.join(' ')} Q ${mid(r1,r0).join(' ')} ${r0.join(' ')} Z`,label);
}
function hand(a,x,y,angle=0,scale=1) {
  const t={x,y,a:angle,sx:scale};
  a.region('M -11 -6 L -12 13 Q -22 16 -23 26 Q -22 34 -16 28 L -12 24 L -9 45 Q -7 53 -3 46 L -4 27 L 0 48 Q 3 56 7 47 L 5 26 L 10 46 Q 15 49 15 40 L 11 22 L 17 35 Q 23 38 21 28 L 14 8 L 11 -6 Z','hand skin',undefined,t);
  a.line('M -8 15 Q -2 17 5 11 M -8 32 L -4 30',.9,t);
}
const poses=[
  {name:'contrapposto',shoulders:[[320,326],[444,326]],arms:[[[320,331],[272,409],[281,489]],[[444,331],[493,404],[483,491]]],hips:[[339,560],[414,560]],legs:[[[342,567],[333,728],[307,911]],[[413,566],[436,728],[450,909]]]},
  {name:'walking',shoulders:[[321,325],[443,332]],arms:[[[321,331],[283,414],[301,488]],[[443,337],[474,411],[509,463]]],hips:[[337,556],[414,562]],legs:[[[342,568],[319,726],[254,893]],[[412,568],[449,731],[464,915]]]},
  {name:'seated',shoulders:[[316,310],[446,310]],arms:[[[318,321],[277,421],[330,514]],[[444,321],[479,421],[437,514]]],hips:[[337,530],[419,530]],legs:[[[345,542],[485,630],[467,903]],[[416,540],[550,651],[546,903]]]},
  {name:'dancer',shoulders:[[324,327],[446,326]],arms:[[[324,328],[244,235],[206,113]],[[446,328],[532,246],[574,125]]],hips:[[347,550],[415,550]],legs:[[[351,560],[332,720],[314,910]],[[414,560],[510,683],[604,747]]]},
  {name:'quiet seated',shoulders:[[321,310],[443,310]],arms:[[[321,320],[290,422],[369,519]],[[443,320],[484,415],[411,513]]],hips:[[338,537],[420,537]],legs:[[[342,548],[243,699],[426,760]],[[416,548],[519,693],[336,771]]]},
  {name:'hand on hip',shoulders:[[319,325],[442,325]],arms:[[[319,330],[247,409],[331,483]],[[442,330],[478,422],[466,504]]],hips:[[337,558],[417,558]],legs:[[[342,569],[349,731],[368,914]],[[412,569],[438,728],[459,914]]]},
  {name:'sway',shoulders:[[325,318],[447,332]],arms:[[[325,327],[263,354],[186,301]],[[447,337],[501,399],[574,366]]],hips:[[337,553],[416,558]],legs:[[[343,566],[314,726],[278,910]],[[412,568],[417,731],[445,910]]]},
  {name:'perched',shoulders:[[313,311],[439,308]],arms:[[[315,318],[261,412],[273,542]],[[438,317],[476,411],[424,515]]],hips:[[335,531],[416,528]],legs:[[[341,542],[457,648],[390,903]],[[412,539],[495,650],[524,905]]]},
  {name:'reaching',shoulders:[[320,327],[443,327]],arms:[[[320,332],[269,418],[259,504]],[[443,327],[484,217],[519,99]]],hips:[[337,557],[417,557]],legs:[[[342,568],[350,732],[339,911]],[[412,568],[457,727],[495,899]]]},
  {name:'ballet',shoulders:[[322,326],[444,326]],arms:[[[322,330],[254,255],[281,148]],[[444,330],[515,255],[483,148]]],hips:[[338,552],[417,552]],legs:[[[343,563],[343,733],[327,919]],[[411,563],[520,643],[430,748]]]},
  {name:'wide stance',shoulders:[[317,324],[449,324]],arms:[[[317,331],[276,426],[311,512]],[[449,331],[491,426],[462,512]]],hips:[[333,559],[424,559]],legs:[[[339,571],[305,731],[268,912]],[[418,571],[470,731],[493,912]]]},
  {name:'flow',shoulders:[[326,328],[448,319]],arms:[[[326,332],[252,391],[193,465]],[[448,325],[507,255],[565,200]]],hips:[[345,558],[420,551]],legs:[[[350,568],[371,732],[380,909]],[[415,563],[473,692],[581,791]]]},
];
function figure(a,i,{gown=false,background:trueBg=true}={}) {
  if(trueBg)background(a,i%4);
  const p=poses[i],seated=[2,4,7].includes(i),headY=seated?225:241;
  const bold=i%4===2;
  if(seated) {
    if(i===4)a.region('M 151 790 Q 385 717 613 790 L 592 849 Q 383 884 174 849 Z','floor cushion');
    else {
      a.region('M 271 608 L 578 608 L 578 644 L 271 644 Z','studio seat');
      a.region('M 288 644 L 304 644 L 295 923 L 279 923 Z','seat left leg');
      a.region('M 546 644 L 562 644 L 573 923 L 557 923 Z','seat right leg');
    }
  }
  // Rear limbs first: adults use seven-to-eight head-height body proportions.
  for(let side=0;side<2;side++) {
    const leg=p.legs[side];limb(a,leg,bold?36:28,gown?17:20,gown?'leg skin':'trouser fabric');
    const end=leg[2],footAngle=side===0?-6:6;
    a.region('M -17 -10 L 17 -10 L 23 6 Q 58 15 50 27 L -24 27 L -25 12 Z','shoe',undefined,{x:end[0],y:end[1],a:footAngle,sx:side===0?-1:1,sy:1});
    a.line('M -20 17 L 48 17',1.3,{x:end[0],y:end[1],a:footAngle,sx:side===0?-1:1,sy:1});
    if(a.level>0&&!gown) {
      const [q,k,r]=leg;a.line(`M ${q[0]} ${q[1]+43} Q ${k[0]+5} ${k[1]} ${r[0]+4} ${r[1]-32}`,1.3);
      a.region(`M ${r[0]-22} ${r[1]-30} L ${r[0]+22} ${r[1]-30} L ${r[0]+21} ${r[1]-11} L ${r[0]-21} ${r[1]-11} Z`,'trouser cuff');
    }
  }
  for(let side=0;side<2;side++) {
    const arm=p.arms[side];limb(a,arm,bold?23:19,12,'arm skin');
    const [q,k,r]=arm;const ang=Math.atan2(r[1]-k[1],r[0]-k[0])*180/Math.PI-90;
    hand(a,r[0],r[1],ang,.8);
  }
  const sy=seated?-18:0,hipWide=bold?18:0;
  a.region(`M 321 ${318+sy} Q 384 ${292+sy} 445 ${318+sy} Q 455 ${390+sy} 421 ${451+sy} L ${436+hipWide} ${557+sy} Q 384 ${589+sy} ${332-hipWide} ${557+sy} L 346 ${451+sy} Q 313 ${390+sy} 321 ${318+sy} Z`,gown?'gown bodice':'shirt bodice');
  if(gown||[3,9,11].includes(i)) {
    const dancer=!gown;
    a.region(dancer?`M 347 ${469+sy} Q 384 ${489+sy} 421 ${469+sy} L 530 ${604+sy} Q 389 ${657+sy} 239 ${601+sy} Z`:`M 347 ${469+sy} Q 384 ${489+sy} 421 ${469+sy} C 459 651 537 816 609 968 Q 376 1011 154 968 C 236 814 305 650 347 ${469+sy} Z`,'flowing skirt');
    const n=a.level===0?3:a.level===1?7:15;
    for(let j=0;j<n;j++) {
      const x=350+j*68/(n-1),xe=dancer?263+j*240/(n-1):195+j*365/(n-1),bottom=dancer?606+sy:974;
      if(a.level>0)a.region(`M ${x} ${488+sy} Q ${x+(xe-x)*.32} ${dancer?546:719} ${xe-8} ${bottom} L ${xe+8} ${bottom} Q ${x+(xe-x)*.54} ${dancer?546:719} ${x+4} ${488+sy} Z`,'skirt pleat');
      else a.line(`M ${x} ${488+sy} Q ${x+(xe-x)*.44} ${dancer?546:719} ${xe} ${bottom}`,1.3);
    }
  } else if(i%3===0) {
    a.region(`M 333 ${322+sy} L 384 ${367+sy} L 357 ${397+sy} L 314 ${346+sy} Z`,'shirt left collar');
    a.region(`M 435 ${322+sy} L 384 ${367+sy} L 411 ${397+sy} L 453 ${346+sy} Z`,'shirt right collar');
    a.line(`M 384 ${373+sy} L 384 ${548+sy}`,1.4);
  } else if(i%3===1) {
    a.region(`M 335 ${322+sy} L 320 ${365+sy} L 366 ${401+sy} L 367 ${544+sy} L 333 ${547+sy} Q 350 433 317 ${360+sy} Z`,'jacket left lapel');
    a.region(`M 433 ${322+sy} L 448 ${365+sy} L 402 ${401+sy} L 401 ${544+sy} L 435 ${547+sy} Q 419 433 451 ${360+sy} Z`,'jacket right lapel');
  }
  const t=head(a,{x:384,y:headY,s:.44,angle:i%3===0?-7:i%3===1?5:0,style:[0,4,2,6,8,3,5,1,9,11,7,10][i],expression:i%4,masculine:[1,7,10].includes(i),fullness:bold?1:0,jewels:a.level>0});
  if(!gown&&![3,9,11].includes(i)) {
    a.region(`M ${333-hipWide} ${542+sy} Q 384 ${554+sy} ${435+hipWide} ${542+sy} L ${436+hipWide} ${558+sy} Q 384 ${570+sy} ${332-hipWide} ${558+sy} Z`,'waist belt');
    a.region(`M 373 ${548+sy} L 395 ${548+sy} L 395 ${566+sy} L 373 ${566+sy} Z`,'gold belt buckle');
  }
  if(a.level>0) {
    a.line(`M 345 ${416+sy} L 358 ${430+sy} M 423 ${416+sy} L 409 ${430+sy}`,1.2);
    if(!gown)for(let y=403+sy;y<527+sy;y+=32)a.region(ellipse(384,y,3.8),'gold button');
  }
  if(a.level===2) {
    const n=gown?12:16;
    for(let j=0;j<n;j++) {
      const angle=j*Math.PI*2/n;
      const x=384+Math.cos(angle)*26,y=397+sy+Math.sin(angle)*43;
      leaf(a,x,y,5,14,angle*180/Math.PI,'embroidered leaf');
    }
  }
}

function fantasy(a,i) {
  background(a,(i+1)%4);
  blouse(a,4,{top:655,wide:25});
  a.region('M 301 659 L 250 725 L 329 899 L 384 830 L 439 899 L 518 725 L 467 659 Q 384 735 301 659 Z','fantasy mantle');
  const t=head(a,{x:384,y:407,s:1.15,angle:(i%3-1)*4,style:[8,2,6,7,5,10,3,0,9,11,4,1][i],expression:i%4,masculine:[3,10,11].includes(i),mature:i===11});
  const crown=i%4;
  if(crown===0) {
    a.region('M -104 -107 L -99 -165 L -60 -137 L -34 -191 L 0 -151 L 34 -191 L 60 -137 L 99 -165 L 104 -107 Q 0 -132 -104 -107 Z','gold crown',undefined,t);
    for(let j=-2;j<=2;j++)a.region(ellipse(j*35,-134-Math.abs(j)*2,6,9),'crown jewel',undefined,t);
  } else if(crown===1) {
    for(let j=-2;j<=2;j++)leaf(a,j*43,-128+Math.abs(j)*15,17,53,j*19,'hair botanical leaf',t);
    if(a.level>0)smallFlower(a,0,-145,18,6,t);
  } else if(crown===2) {
    a.region('M -109 -91 Q 0 -169 108 -91 L 102 -69 Q 0 -143 -104 -68 Z','gold celestial tiara',undefined,t);
    a.region('M 0 -166 L 9 -147 L 29 -145 L 15 -129 L 19 -109 L 0 -119 L -19 -109 L -15 -129 L -29 -145 L -9 -147 Z','star jewel',undefined,t);
  } else {
    a.region('M -106 -98 Q 0 -163 106 -98 L 97 -76 Q 0 -130 -98 -76 Z','fantasy diadem',undefined,t);
    for(const side of [-1,1]) {
      a.region(tr('M 94 -104 Q 143 -153 131 -195 Q 173 -171 157 -127 L 116 -77 Z',{sx:side,sy:1}),'sculpted crown wing',undefined,t);
      a.line(tr('M 114 -114 Q 140 -140 143 -166',{sx:side,sy:1}),1.2,t);
    }
  }
  addNecklace(a,384,780,i);
  if(a.level>0)for(const side of [-1,1])for(let j=0;j<(a.level===2?8:3);j++) {
    const x=384+side*(89+j*12),y=819+j*17;
    leaf(a,x,y,9,32,side*35,'mantle embroidered leaf');
  }
  if(a.level===2)for(let j=0;j<9;j++)a.region(ellipse(247+j*34,947+Math.sin(j*.7)*12,7),'mantle gold bead');
}

const groups=[
  {key:'portrait',category:'Portraits',fn:portrait,titles:['Sunday Reverie','Silver & Sage','Golden Hour Muse','Quiet Confidence','The Thoughtful Poet','Softly Speaking','A Moment of Stillness','Warm Welcome','Stories in Silver','An Open Heart','Wrapped in Calm','A Knowing Smile'],tags:['portrait','expressive face','adult']},
  {key:'beauty',category:'Faces & Features',fn:features,titles:['Petal Lips','The Looking Glass','Eyes at Rest','A Smile Unfolds','Freckle Constellations','Lines of Experience','Close Your Eyes','A Gentle Laugh','The Quiet Gaze','Lipstick Study','Lashes & Light','Express Yourself'],tags:['eyes','lips','facial features','beauty study']},
  {key:'hair',category:'Hair Stories',fn:hairstyles,titles:['The Perfect Bob','Silver Curls','Crown of Coils','Braided Poetry','Sculpted Sweep','Waves Like Water','The Artful Topknot','Locs & Gold','Silken Lengths','High Pony Days','Woven Headwrap','Finger Wave Reverie'],tags:['hair','curly','coily','wavy','straight','braided']},
  {key:'editorial',category:'Fashion Editorial',fn:editorial,titles:['Sculpture in Silk','The Beret Issue','Statement Shades','Architectural Elegance','Cover Story','Through Rose Glasses','Folded Form','The Atelier Edit','Modern Muse','Editorial Geometry','Satin & Shadow','Front Row Feeling'],tags:['fashion','editorial','portrait','couture']},
  {key:'street',category:'Streetwear',fn:streetwear,titles:['Sunday Hoodie','Denim & Braids','The Bomber Edit','Everyday Graphic','Beanie Weather','Layers of Denim','City Jacket','The Favorite Tee','Weekend Layers','Street Studio','The Patch Collection','Soft City Afternoon'],tags:['streetwear','contemporary','casual','outfit']},
  {key:'evening',category:'Gowns & Suits',fn:evening,titles:['Velvet Evening','The Perfect Lapel','A Gown in Motion','Pearl Light','Midnight Tailoring','Silk Steps','The Opera Dress','Black Tie Reverie','Satin Silhouette','A Dress to Remember','The Dinner Jacket','The Last Waltz'],tags:['gown','suit','fabric','elegant']},
  {key:'heritage',category:'Cultural Threads',fn:cultural,titles:['Sari & Soft Light','A Folded Garden','The Embroidered Shawl','Kurta in Bloom','Ribbon & Reverie','A Woven Story','Silken Drape','Quiet Kimono','Heritage Stitches','A Celebratory Collar','The Gentle Ribbon','Threads of Memory'],tags:['traditional','cultural clothing','textile','heritage inspired']},
  {key:'vintage',category:'Vintage Studio',fn:vintage,titles:['The Afternoon Hat','Cafe on the Corner','The Silk Headband','A Letter from Paris','The Velvet Beret','Sunday in the Sixties','A Golden Age','The Vintage Shop','Cherry Ribbon','A Long-Ago Afternoon','The Classic Edit','Dancing Through Decades'],tags:['vintage','retro','hat','fashion']},
  {key:'figure',category:'Figures & Movement',fn:figure,titles:['A Quiet Stance','Across the Studio','A Seated Moment','Reach for the Light','Slow Sunday','Hand on Hip','The Gentle Sway','On the Studio Stool','Stretch Toward Morning','Ballet Rehearsal','Grounded & Present','A Ribbon of Motion'],tags:['full body','pose','seated','dancer','adult']},
  {key:'fantasy',category:'Dreamer Portraits',fn:fantasy,titles:['The Gentle Monarch','Botanical Dreamer','Keeper of Stars','Winged Diadem','Silk Kingdom','Garden of Thought','The Celestial Braid','A Storybook Crown','A Crown of Quiet','The Flower Guardian','Starlit Tailoring','The Silver Regent'],tags:['fantasy','graphic','stylized','human portrait']},
];
function descriptiveTags(key,i,base) {
  const styles={portrait:[0,1,2,3,4,5,6,7,8,9,10,11],beauty:[0,4,2,8,6,5,1,9,10,3,11,7],hair:[0,1,2,3,4,5,6,7,8,9,10,11],editorial:[0,6,4,8,1,9,11,5,2,10,3,7],street:[4,3,2,0,7,9,1,5,8,11,6,10],evening:[6,4,2,8,1,3,9,7,9,11,0,10],heritage:[10,6,3,4,8,2,0,5,7,9,1,11],vintage:[11,4,0,1,5,8,6,2,9,3,10,7],figure:[0,4,2,6,8,3,5,1,9,11,7,10],fantasy:[8,2,6,7,5,10,3,0,9,11,4,1]};
  const hairTags=[['bob','straight hair'],['short curls','curly hair'],['coily hair','afro'],['braided hair','braid'],['undercut','swept hair'],['wavy hair','long hair'],['bun','topknot'],['locs','textured hair'],['straight hair','long hair'],['ponytail'],['headwrap'],['finger waves','retro hair']];
  const masculine={portrait:[1,4,7,8,11],beauty:[1,5,9],hair:[1,4,7,11],editorial:[2,6,10],street:[0,4,6,8],evening:[1,4,7,10],heritage:[3,8,10],vintage:[1,5,9],figure:[1,7,10],fantasy:[3,10,11]};
  const mature={portrait:[1,4,8,11],beauty:[1,5,9],hair:[1],editorial:[4],street:[],evening:[4],heritage:[10],vintage:[5],figure:[],fantasy:[11]};
  const tags=base.filter(tag=>!['curly','coily','wavy','straight','braided','seated','dancer','gown','suit'].includes(tag));
  tags.push('adult',...hairTags[styles[key][i]],masculine[key].includes(i)?'masculine':'feminine');
  if(mature[key].includes(i))tags.push('mature adult','face lines');
  if(key==='figure')tags.push(poses[i].name,...([2,4,7].includes(i)?['seated']:[]),...([3,6,9,11].includes(i)?['dancer']:[]));
  if(key==='evening')tags.push(i%3===1?'suit':'gown');
  if(key==='street')tags.push(['hoodie','denim','bomber jacket','graphic tee'][i%4]);
  if(key==='heritage')tags.push(['sari inspired','kimono inspired','embroidered shawl','kurta inspired','hanbok inspired','woven vest'][i%6]);
  return [...new Set(tags)];
}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--disable-dev-shm-usage']});
const validationPage=await browser.newPage();
// Remove construction silhouettes completely hidden by later garments/accessories.
// Sampling actual Path2D coverage keeps all advertised coloring regions reachable.
async function pruneHidden(a) {
  const visible=await validationPage.evaluate(art=>{
    const canvas=document.createElement('canvas');canvas.width=art.width;canvas.height=art.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});const colors=new Map();
    for(let i=0;i<art.regions.length;i++) {
      const color=(i+1)*1771;colors.set(color,i);ctx.fillStyle=`#${color.toString(16).padStart(6,'0')}`;ctx.fill(new Path2D(art.regions[i].path));
    }
    const count=Array(art.regions.length).fill(0),pixels=ctx.getImageData(0,0,art.width,art.height).data;
    for(let i=0;i<pixels.length;i+=4){const region=colors.get((pixels[i]<<16)|(pixels[i+1]<<8)|pixels[i+2]);if(region!==undefined&&pixels[i+3]===255)count[region]++;}
    // Keep a margin above one-pixel antialias fringes. Features below this size
    // are represented by fine line detail instead of unusable paint targets.
    return count.map(n=>n>=12);
  },a.json());
  a.regions=a.regions.filter((_,i)=>visible[i]);a.colors=a.colors.filter((_,i)=>visible[i]);
  // IDs follow authored shapes: do not renumber after pruning, to preserve identity.
  if(visible.some(v=>!v))await pruneHidden(a);
}
const catalog=[];const hashes=new Set();
for(let g=0;g<groups.length;g++)for(let i=0;i<12;i++) {
  const group=groups[g],id=`${group.key}-${String(i+1).padStart(2,'0')}`,level=i%3;
  const a=new Art(id,i+g*3,level);group.fn(a,i);
  await pruneHidden(a);
  // Difficulty reflects actual region count. Tiny freckles/jewels are counted;
  // the art also varies line and garment detail so levels stay meaningful.
  const difficulty=a.regions.length<=32?'Easy':a.regions.length<60?'Medium':'Hard';
  const meta={id,title:group.titles[i],category:group.category,difficulty,tags:[...descriptiveTags(group.key,i,group.tags),['simple','detailed','intricate'][level]],thumbnail:`/art/${id}.svg`,regionCount:a.regions.length};
  catalog.push(meta);
  const j=JSON.stringify(a.json()); const hash=crypto.createHash('sha256').update(j.replaceAll(id,'')).digest('hex');
  if(hashes.has(hash))throw new Error(`Duplicate drawing geometry: ${id}`);hashes.add(hash);
  fs.writeFileSync(path.join(OUT,`${id}.json`),j+'\n');
  const header=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${xml(meta.title)}"><title>${xml(meta.title)} — original Musemallow illustration</title>`;
  const attrs='stroke="#44383f" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"';
  const regions=a.regions.map((r,idx)=>`<path d="${r.path}" fill="${a.colors[idx]}" ${attrs}/>`).join('');
  const lines=a.lines.map(l=>`<path d="${l.path}" fill="none" stroke="#44383f" stroke-width="${l.width||2}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  fs.writeFileSync(path.join(OUT,`${id}.svg`),header+regions+lines+'</svg>\n');
  const sourceRegions=a.regions.map(r=>`<path id="${r.id}" d="${r.path}" fill="#fffdf8" ${attrs}><title>${xml(r.label)}</title></path>`).join('');
  fs.writeFileSync(path.join(OUT,`${id}.line.svg`),header+sourceRegions+lines+'</svg>\n');
}
await browser.close();
const supplementalPath=path.join(OUT,'supplemental-catalog.json');
if(fs.existsSync(supplementalPath)) {
  const supplemental=JSON.parse(fs.readFileSync(supplementalPath,'utf8'));
  for(const item of supplemental) {
    if(catalog.some(existing=>existing.id===item.id))throw new Error(`Duplicate supplemental ID: ${item.id}`);
    catalog.push(item);
  }
}
fs.writeFileSync(path.join(OUT,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
console.log(`Generated ${catalog.length} original drawings: ${catalog.filter(x=>x.difficulty==='Easy').length} Easy, ${catalog.filter(x=>x.difficulty==='Medium').length} Medium, ${catalog.filter(x=>x.difficulty==='Hard').length} Hard.`);
for(const group of groups) {
  const items=catalog.filter(x=>x.category===group.category);
  console.log(`${group.category}: ${items.length}; regions ${Math.min(...items.map(x=>x.regionCount))}–${Math.max(...items.map(x=>x.regionCount))}`);
}
