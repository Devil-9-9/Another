// Test-only stand-in for three.js r160 covering exactly the API surface Block Ops uses (no WebGL needed).
export class Vector3 { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;} clone(){return new Vector3(this.x,this.y,this.z);}
  addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;} lerp(v,t){this.x+=(v.x-this.x)*t;this.y+=(v.y-this.y)*t;this.z+=(v.z-this.z)*t;return this;}
  distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);} multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;} length(){return Math.hypot(this.x,this.y,this.z);} normalize(){const l=this.length()||1;return this.multiplyScalar(1/l);} setScalar(s){return this.set(s,s,s);} }
export class Color { constructor(c=0){this.set(c);} set(c){ if(c&&c.isColor)return this.copy(c); this.r=((c>>16)&255)/255;this.g=((c>>8)&255)/255;this.b=(c&255)/255;return this;} copy(c){this.r=c.r;this.g=c.g;this.b=c.b;return this;} clone(){return new Color().copy(this);} get isColor(){return true;}
  lerp(c,t){this.r+=(c.r-this.r)*t;this.g+=(c.g-this.g)*t;this.b+=(c.b-this.b)*t;return this;} multiplyScalar(s){this.r*=s;this.g*=s;this.b*=s;return this;} }
class Euler { constructor(){this.x=0;this.y=0;this.z=0;this.order='XYZ';} set(x,y,z,o){this.x=x;this.y=y;this.z=z;if(o)this.order=o;return this;} }
export class Object3D { constructor(){this.position=new Vector3();this.rotation=new Euler();this.scale=new Vector3(1,1,1);this.children=[];this.parent=null;this.userData={};this.visible=true;this.castShadow=false;this.receiveShadow=false;this.renderOrder=0;}
  add(...c){for(const x of c){x.parent=this;this.children.push(x);}return this;} updateMatrix(){this.matrix={};} remove(c){const i=this.children.indexOf(c);if(i>=0)this.children.splice(i,1);c.parent=null;return this;} lookAt(){} }
export class Group extends Object3D {}
export class Scene extends Object3D { constructor(){super();this.background=null;this.fog=null;} }
export class Fog { constructor(c,n,f){this.color=c;this.near=n;this.far=f;} }
export class PerspectiveCamera extends Object3D { constructor(fov,aspect,n,f){super();this.fov=fov;this.aspect=aspect;this.near=n;this.far=f;} updateProjectionMatrix(){} }
const light=(extra)=>class extends Object3D{ constructor(c,i){super();this.color=new Color(c);this.intensity=i??1;Object.assign(this,extra?.());} };
export const DirectionalLight = class extends light(()=>({shadow:{mapSize:{set(){}},camera:{left:0,right:0,top:0,bottom:0,near:0,far:0},bias:0,normalBias:0},target:new Object3D()})) {};
export const HemisphereLight = light(); export const PointLight = class extends light() { constructor(c,i,d){super(c,i);this.distance=d;} };
export class BufferGeometry { constructor(){this.attributes={};this.index=null;this.disposed=false;} setAttribute(n,a){this.attributes[n]=a;return this;} setIndex(i){this.index=i;return this;} computeBoundingSphere(){} dispose(){this.disposed=true;} }
export class BoxGeometry extends BufferGeometry {} export class SphereGeometry extends BufferGeometry {} export class CylinderGeometry extends BufferGeometry {} export class ConeGeometry extends BufferGeometry {} export class CapsuleGeometry extends BufferGeometry {} export class RingGeometry extends BufferGeometry {} export class CircleGeometry extends BufferGeometry {} export class EdgesGeometry extends BufferGeometry {}
export class Float32BufferAttribute { constructor(a,n){this.array=Float32Array.from(a);this.itemSize=n;this.count=a.length/n;} }
class Mat { constructor(o={}){Object.assign(this,{opacity:1},o);} dispose(){} }
export class MeshLambertMaterial extends Mat {} export class MeshBasicMaterial extends Mat {} export class PointsMaterial extends Mat {} export class LineBasicMaterial extends Mat {} export class SpriteMaterial extends Mat {}
export class Mesh extends Object3D { constructor(g,m){super();this.geometry=g;this.material=m;} }
export class InstancedMesh extends Mesh { constructor(g,m,n){super(g,m);this.count=n;this.setMatrixAt=()=>{};this.setColorAt=()=>{};} }
export class Points extends Mesh {} export class LineSegments extends Mesh {} export class Sprite extends Object3D { constructor(m){super();this.material=m;} }
export class CanvasTexture { constructor(c){this.image=c;this.needsUpdate=false;} }
export class WebGLRenderer { constructor(o){this.canvas=o.canvas;this.shadowMap={enabled:false,type:0};window.__renders=0;} setPixelRatio(){} setSize(){} render(){window.__renders++;} dispose(){} forceContextLoss(){} }
export const DoubleSide=2, SRGBColorSpace='srgb', NearestFilter=1003, NearestMipmapLinearFilter=1005, PCFSoftShadowMap=2;
export const MathUtils = { smoothstep(x,a,b){ if(x<=a)return 0; if(x>=b)return 1; const t=(x-a)/(b-a); return t*t*(3-2*t); } };
