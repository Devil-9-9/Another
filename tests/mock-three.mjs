// Minimal stand-in for three.js so creature logic can be tested in Node without WebGL. Test-only.
class V { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} setScalar(s){this.x=this.y=this.z=s;return this;} }
class E { constructor(){this.x=0;this.y=0;this.z=0;this.order='XYZ';} }
class Obj { constructor(){this.position=new V();this.rotation=new E();this.scale=new V(1,1,1);this.children=[];this.userData={};this.visible=true;this.castShadow=false;this.renderOrder=0;} add(c){this.children.push(c);return this;} }
export class Group extends Obj {} export class Mesh extends Obj { constructor(g,m){super();this.geometry=g;this.material=m;} } export class Sprite extends Obj { constructor(m){super();this.material=m;} }
export class BoxGeometry {} export class MeshLambertMaterial { constructor(o){Object.assign(this,o);} } export class SpriteMaterial { constructor(o){Object.assign(this,o);} }
export class CanvasTexture { constructor(c){this.image=c;this.needsUpdate=false;} } export class Color { constructor(c){this.c=c;} multiplyScalar(){return this;} }

export class SphereGeometry {} export class CylinderGeometry {} export class CapsuleGeometry {} export class RingGeometry {} export class MeshBasicMaterial { constructor(o){Object.assign(this,o); this.color={ v:o&&o.color, setHex(h){this.v=h;} };} }
export const SRGBColorSpace='srgb', DoubleSide=2;
