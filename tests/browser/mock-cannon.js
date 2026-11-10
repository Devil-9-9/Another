// Test-only cannon-es stand-in: Euler-integrates gravity so falling blocks still fall.
export class Vec3 { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} }
export class Material { constructor(n){this.name=n;} } export class ContactMaterial { constructor(a,b,o){Object.assign(this,o);} }
export class Box { constructor(h){this.halfExtents=h;} } export class SAPBroadphase { constructor(w){this.world=w;} }
export class Body { constructor(o={}){this.mass=o.mass??0;this.material=o.material;this.linearDamping=o.linearDamping??0;this.position=new Vec3();this.velocity=new Vec3();this.fixedRotation=false;} updateMassProperties(){} }
export class World { constructor(o={}){this.gravity=o.gravity||new Vec3(0,-9.81,0);this.bodies=[];this.solver={iterations:10};this.broadphase=null;this.allowSleep=false;window.__cannonSteps=0;}
  addContactMaterial(){} addBody(b){this.bodies.push(b);} removeBody(b){const i=this.bodies.indexOf(b);if(i>=0)this.bodies.splice(i,1);}
  step(fixed,dt,sub){window.__cannonSteps++;for(const b of this.bodies){b.velocity.y+=this.gravity.y*dt;b.velocity.y*=1-b.linearDamping*dt;b.position.x+=b.velocity.x*dt;b.position.y+=b.velocity.y*dt;b.position.z+=b.velocity.z*dt;}} }
