import { HudLayout, STORAGE_KEY, sanitize } from '../src/ui/HudLayout.js';
const mem = new Map(); const storage = { getItem:k=>mem.get(k)??null, setItem:(k,v)=>mem.set(k,v) };
let L = new HudLayout(storage);
L.set('btn-shoot',{x:80,y:70,s:1.5,o:0.6}); L.set('hp',{x:10,y:8,hidden:true}); L.save();
// persists across "page reloads"
let L2 = new HudLayout(storage);
console.log('reloaded btn-shoot', JSON.stringify(L2.get('btn-shoot')), '| hp hidden', L2.get('hp').hidden);
console.assert(L2.get('btn-shoot').x===80 && L2.get('btn-shoot').s===1.5 && L2.get('hp').hidden===true);
// clamping: can't drag off screen, can't make invisible/huge
const c = L2.set('btn-jump',{x:-50,y:500,s:99,o:0}); console.log('clamped', JSON.stringify(c));
console.assert(c.x===2 && c.y===97 && c.s===2.6 && c.o===0.15);
// partial updates keep position
L2.set('btn-shoot',{s:2}); console.assert(L2.get('btn-shoot').x===80 && L2.get('btn-shoot').s===2);
// mirror for left-handed players
L2.mirror(); console.log('mirrored shoot x', L2.get('btn-shoot').x, '(was 80)'); console.assert(L2.get('btn-shoot').x===20 && L2.get('hp').x===90);
L2.mirror(); console.assert(L2.get('btn-shoot').x===80);
// untouched items stay untouched (null = CSS default)
L2.set('btn-reload',{o:0.5}); console.assert(L2.get('btn-reload').x===null); L2.mirror(); console.assert(L2.get('btn-reload').x===null);
// reset one / all
L2.reset('btn-shoot'); console.assert(L2.get('btn-shoot')===null); L2.resetAll(); console.assert(Object.keys(L2.items).length===0);
// corrupt / hostile storage never crashes and never leaks garbage
mem.set(STORAGE_KEY,'{not json'); console.assert(Object.keys(new HudLayout(storage).items).length===0);
mem.set(STORAGE_KEY, '{"items":{"__proto__":{"x":50,"y":50,"polluted":true},"ok":{"x":50,"y":50,"s":"big","o":null},"<script>":{"x":1}}}');
const L3=new HudLayout(storage); console.log('hostile data ->', JSON.stringify(L3.items), '| Object.prototype untouched:', ({}).polluted===undefined && ({}).x===undefined);
console.assert(Object.keys(L3.items).join()==='ok' && L3.get('ok').s===1 && ({}).x===undefined);
L3.set('__proto__',{x:10,y:10}); console.assert(({}).x===undefined, 'set("__proto__") must not pollute');
// storage blocked entirely (private mode)
const blocked={getItem(){throw new Error('x')},setItem(){throw new Error('x')}}; const L4=new HudLayout(blocked); L4.set('a',{x:5,y:5}); L4.save(); console.log('blocked storage: ok');
console.log('ALL OK');
