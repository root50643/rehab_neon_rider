import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { chapterAt, gradeAt } from './ride';
import type { Quality } from './types';
import { createNebula } from './nebula';

const elevations = [0];
for (let i=1;i<=1100;i++) elevations.push(elevations[i-1]+gradeAt(i*5)/100*5);
function height(d:number) { const p=Math.max(0,Math.min(5499,d))/5,i=Math.floor(p); return T.MathUtils.lerp(elevations[i],elevations[i+1]??elevations[i],p-i); }
function point(d:number) { return new T.Vector3(Math.sin(d*.003)*20+Math.sin(d*.009)*7,height(d),-d); }
function tangent(d:number) { return point(d+1).sub(point(d)).normalize(); }
function random(i:number) { const n=Math.sin(i*127.1+311.7)*43758.5453; return n-Math.floor(n); }
const glow = (color:T.ColorRepresentation, intensity=2) => new T.MeshStandardMaterial({ color, emissive:color, emissiveIntensity:intensity, roughness:.4, metalness:.5, toneMapped:false });
function rod(a:T.Vector3,b:T.Vector3,r:number,mat:T.Material) {
  const mesh=new T.Mesh(new T.CylinderGeometry(r,r,a.distanceTo(b),7),mat);
  mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize()); return mesh;
}

export class NeonScene {
  private renderer:T.WebGLRenderer;
  private scene=new T.Scene();
  private camera=new T.PerspectiveCamera(55,1,.1,1000);
  private composer:EffectComposer;
  private bloom:UnrealBloomPass;
  private road:T.Mesh;
  private rails:T.Mesh;
  private bike=new T.Group();
  private wheels:T.Group[]=[];
  private crank=new T.Group();
  private legs:T.Mesh[]=[];
  private lane:T.InstancedMesh;
  private towers:T.InstancedMesh;
  private towerLights:T.InstancedMesh;
  private portals:T.Group[]=[];
  private planet:T.Mesh;
  private planetGroup=new T.Group();
  private stars:T.Points;
  private nebula=createNebula();
  private streaks:T.LineSegments;
  private sparks:T.Points;
  private trail:T.Points;
  private theme=new T.Color('#b4ff48');
  private elapsed=0;
  private crankAngle=0;
  private quality:Quality='auto';
  private reduced=false;
  private low=false;
  private frames=0;
  private frameTime=0;
  private lastRoad=-Infinity;
  private observer:ResizeObserver;
  private onLost:()=>void;
  onQualityChange:(low:boolean)=>void=()=>{};
  private dummy=new T.Object3D();
  constructor(private canvas:HTMLCanvasElement,onLost:()=>void) {
    this.onLost=onLost;
    this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setClearColor('#061116'); this.renderer.toneMapping=T.ACESFilmicToneMapping; this.renderer.toneMappingExposure=1.25;
    this.scene.fog=new T.FogExp2('#091b24',.006);
    this.scene.add(this.nebula);
    this.scene.add(new T.HemisphereLight('#b8f5ff','#202028',1.4));
    const key=new T.DirectionalLight('#e2fff8',1.8); key.position.set(-8,15,8); this.scene.add(key);
    const accent=new T.DirectionalLight('#ff643f',1.4); accent.position.set(7,3,-5); this.scene.add(accent);
    this.composer=new EffectComposer(this.renderer); this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.bloom=new UnrealBloomPass(new T.Vector2(1,1),.3,.15,1.15); this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.road=new T.Mesh(this.ribbon(2),new T.MeshStandardMaterial({color:'#132630',roughness:.4,metalness:.65,side:T.DoubleSide}));
    this.rails=new T.Mesh(this.ribbon(4),glow('#88ffbf',2));
    this.scene.add(this.road,this.rails);
    this.lane=new T.InstancedMesh(new T.BoxGeometry(.09,.025,3),glow('#67b3b5',.45),160); this.scene.add(this.lane);
    this.towers=new T.InstancedMesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({color:'#102a35',metalness:.7,roughness:.6}),130);
    this.towerLights=new T.InstancedMesh(new T.BoxGeometry(1,1,1),glow('#3dd9c8',1.3),130); this.scene.add(this.towers,this.towerLights);
    for(let i=0;i<8;i++) {
      const portal=new T.Group();
      const ring=new T.Mesh(new T.TorusGeometry(7,.075,6,80),glow(i%2?'#ff946b':'#b4ff48',3)); portal.add(ring);
      const outer=new T.Mesh(new T.TorusGeometry(7.7,.15,4,6),new T.MeshStandardMaterial({color:'#354a50',metalness:.9,roughness:.2})); portal.add(outer);
      for(let j=0;j<6;j++) { const tick=new T.Mesh(new T.BoxGeometry(.12,.8,.15),glow('#a9ffd1',2));tick.position.set(Math.sin(j*Math.PI/3)*7.7,Math.cos(j*Math.PI/3)*7.7,0);tick.rotation.z=-j*Math.PI/3;portal.add(tick); }
      this.portals.push(portal); this.scene.add(portal);
    }
    const planetMat=new T.ShaderMaterial({uniforms:{time:{value:0}},vertexShader:`varying vec3 pos; varying vec3 normalV; void main(){pos=position;normalV=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 pos; varying vec3 normalV; uniform float time; void main(){float band=sin(pos.y*.27+sin(pos.x*.19)*2.+time*.02); float detail=sin(pos.x*.7+pos.z*.5)*.5+.5; vec3 c=mix(vec3(.24,.055,.045),vec3(.95,.38,.18),band*.5+.5); c*=.65+detail*.2; float light=.2+.8*max(0.,dot(normalize(normalV),normalize(vec3(-1.,.7,1.)))); gl_FragColor=vec4(c*light,1.);}`});
    this.planet=new T.Mesh(new T.SphereGeometry(30,64,40),planetMat);this.planetGroup.add(this.planet);
    const ring=new T.Mesh(new T.RingGeometry(36,51,128),new T.MeshBasicMaterial({color:'#c28461',side:T.DoubleSide,transparent:true,opacity:.3}));ring.rotation.set(1.16,.15,.4);this.planetGroup.add(ring);
    const ringEdge=new T.Mesh(new T.TorusGeometry(49,.1,4,128),new T.MeshBasicMaterial({color:'#ffcc8a'}));ringEdge.rotation.copy(ring.rotation);this.planetGroup.add(ringEdge);
    this.scene.add(this.planetGroup);
    const starGeo=new T.BufferGeometry();const positions=new Float32Array(2400*3),colors=new Float32Array(positions.length);
    for(let i=0;i<2400;i++){positions.set([(random(i*3)-.5)*750,random(i*3+1)*220+8,(random(i*3+2)-.5)*650],i*3);const c=new T.Color(i%5?'#84bac5':'#ffc6a2');colors.set(c.toArray(),i*3);}
    starGeo.setAttribute('position',new T.BufferAttribute(positions,3));starGeo.setAttribute('color',new T.BufferAttribute(colors,3));
    this.stars=new T.Points(starGeo,new T.PointsMaterial({size:.55,vertexColors:true,transparent:true,opacity:.85,fog:false,sizeAttenuation:true}));this.scene.add(this.stars);
    this.streaks=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({color:'#9bfff2',transparent:true,opacity:.18}));this.streaks.geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(70*6),3));this.scene.add(this.streaks);
    this.sparks=new T.Points(new T.BufferGeometry(),new T.PointsMaterial({color:'#e7ff9e',size:.22,transparent:true,opacity:.9,blending:T.AdditiveBlending}));this.sparks.geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(400*3),3));this.scene.add(this.sparks);
    this.trail=new T.Points(new T.BufferGeometry(),new T.PointsMaterial({color:'#b4ff48',size:.09,transparent:true,opacity:.8,blending:T.AdditiveBlending}));this.trail.geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(100*3),3));this.scene.add(this.trail);
    this.buildBike();this.scene.add(this.bike);
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();
    canvas.addEventListener('webglcontextlost',this.contextLost);
  }
  private contextLost=(e:Event)=>{e.preventDefault();this.onLost();};
  private ribbon(verticesPerRow:number) {
    const count=121,geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(new Float32Array(count*verticesPerRow*3),3));
    const indices=[];
    for(let i=0;i<count-1;i++)for(let j=0;j<verticesPerRow;j+=2){const a=i*verticesPerRow+j,b=a+verticesPerRow;indices.push(a,b,a+1,b,b+1,a+1);}
    geo.setIndex(indices);geo.computeVertexNormals();(geo.attributes.position as T.BufferAttribute).setUsage(T.DynamicDrawUsage);return geo;
  }
  private buildBike() {
    const frame=glow('#b4ff48',1.2),dark=new T.MeshStandardMaterial({color:'#0a191c',metalness:.6,roughness:.3}),silver=new T.MeshStandardMaterial({color:'#77969a',metalness:.9,roughness:.25});
    // Build in the XY plane, then rotate the whole bike to travel along -Z.
    const cycle=new T.Group();cycle.rotation.y=Math.PI/2;
    for(const x of [-1.02,1.02]) {
      const wheel=new T.Group();wheel.position.set(x,.72,0);
      wheel.add(new T.Mesh(new T.TorusGeometry(.66,.065,8,48),dark));wheel.add(new T.Mesh(new T.TorusGeometry(.61,.015,5,48),glow('#b8fff1',3)));
      for(let j=0;j<8;j++){const a=j*Math.PI/4;wheel.add(rod(new T.Vector3(),new T.Vector3(Math.cos(a)*.60,Math.sin(a)*.60,0),.007,silver));}
      cycle.add(wheel);this.wheels.push(wheel);
    }
    const rear=new T.Vector3(-1.02,.72,0),front=new T.Vector3(1.02,.72,0),pedal=new T.Vector3(-.1,.72,0),seat=new T.Vector3(-.43,1.53,0),head=new T.Vector3(.63,1.6,0);
    for(const [a,b] of [[rear,pedal],[rear,seat],[seat,pedal],[seat,head],[head,pedal],[head,front]])cycle.add(rod(a,b,.045,frame));
    cycle.add(rod(seat,new T.Vector3(-.48,1.76,0),.04,silver));
    const saddle=new T.Mesh(new T.BoxGeometry(.4,.09,.23),dark);saddle.position.set(-.47,1.76,0);cycle.add(saddle);
    cycle.add(rod(head,new T.Vector3(.66,1.94,0),.04,silver));cycle.add(rod(new T.Vector3(.66,1.94,-.3),new T.Vector3(.66,1.94,.3),.04,dark));
    this.crank.position.copy(pedal);this.crank.add(rod(new T.Vector3(0,-.22,0),new T.Vector3(0,.22,0),.025,silver));cycle.add(this.crank);
    const suit=new T.MeshStandardMaterial({color:'#f0e9d7',roughness:.6}),pants=new T.MeshStandardMaterial({color:'#173637',roughness:.7});
    const hips=new T.Vector3(-.45,1.91,0),shoulder=new T.Vector3(.17,2.49,0);
    cycle.add(rod(hips,shoulder,.22,suit));
    const stripe=rod(hips.clone().add(new T.Vector3(0,.03,.208)),shoulder.clone().add(new T.Vector3(0,0,.208)),.035,frame);cycle.add(stripe);
    const helmet=new T.Mesh(new T.SphereGeometry(.225,20,14),dark);helmet.scale.set(1.25,1,1);helmet.position.set(.33,2.76,0);cycle.add(helmet);
    const visor=new T.Mesh(new T.SphereGeometry(.23,16,10,0,Math.PI),glow('#64eddf',.8));visor.rotation.y=Math.PI/2;visor.scale.set(1.1,.38,1);visor.position.set(.4,2.78,0);cycle.add(visor);
    for(const side of [-1,1]) {
      const a=shoulder.clone().add(new T.Vector3(0,0,side*.19)), elbow=new T.Vector3(.48,2.14,side*.25),hand=new T.Vector3(.66,1.94,side*.29);
      cycle.add(rod(a,elbow,.075,suit),rod(elbow,hand,.065,suit));
      for(let j=0;j<2;j++){const leg=new T.Mesh(new T.CylinderGeometry(.09,.085,1,8),pants);cycle.add(leg);this.legs.push(leg);}
      const shoe=new T.Mesh(new T.BoxGeometry(.28,.09,.14),glow('#bddacb',.25));shoe.name='shoe'+side;cycle.add(shoe);
    }
    this.bike.add(cycle);this.bike.scale.setScalar(1.18);
  }
  setOptions(quality:Quality,reduced:boolean){this.quality=quality;this.reduced=reduced;this.low=quality==='low';this.frames=0;this.frameTime=0;this.resize();}
  private resize(){const w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.low?1:1.5));this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.composer.setSize(w,h);this.bloom.resolution.set(w*(this.low?.35:.6),h*(this.low?.35:.6));}
  private updateRoad(distance:number) {
    for(const [mesh,offsets] of [[this.road,[-4.5,4.5]],[this.rails,[-4.62,-4.5,4.5,4.62]]] as [T.Mesh,number[]][]) {
      const pos=mesh.geometry.getAttribute('position') as T.BufferAttribute;
      for(let i=0;i<121;i++){const d=distance-30+i*3,p=point(d),dir=tangent(d),side=new T.Vector3(-dir.z,0,dir.x);for(let j=0;j<offsets.length;j++){const q=p.clone().addScaledVector(side,offsets[j]);pos.setXYZ(i*offsets.length+j,q.x,q.y+.015,q.z);}}
      pos.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();
    }
    const start=Math.floor((distance-25)/8)*8;
    for(let i=0;i<160;i++){const d=start+Math.floor(i/4)*8,p=point(d),dir=tangent(d);p.x+=(i%4-1.5)*2.2;this.dummy.position.copy(p);this.dummy.position.y+=.04;this.dummy.quaternion.setFromUnitVectors(new T.Vector3(0,0,-1),dir);this.dummy.scale.set(1,1,1);this.dummy.updateMatrix();this.lane.setMatrixAt(i,this.dummy.matrix);}this.lane.instanceMatrix.needsUpdate=true;this.lane.computeBoundingSphere();
    const base=Math.floor((distance-40)/12)*12;
    const descent=10*T.MathUtils.smoothstep(distance,1350,1650)+50*T.MathUtils.smoothstep(distance,3300,3700);
    for(let i=0;i<130;i++){
      const d=base+Math.floor(i/2)*12,r=random(Math.floor(d/12)*2+i%2),p=point(d);const side=i%2?1:-1;
      const h=5+r*34; p.x+=side*(14+random(i+34)*26);p.y+=h*.5-2;
      this.dummy.position.copy(p);this.dummy.quaternion.identity();this.dummy.scale.set(3+r*7,h,3+r*4);
      this.dummy.position.y-=descent;
      this.dummy.updateMatrix();this.towers.setMatrixAt(i,this.dummy.matrix);
      this.dummy.position.x-=side*(this.dummy.scale.x/2+.015);this.dummy.scale.set(.035,h*.85,.1);this.dummy.updateMatrix();this.towerLights.setMatrixAt(i,this.dummy.matrix);
    }
    this.towers.instanceMatrix.needsUpdate=true;this.towerLights.instanceMatrix.needsUpdate=true;this.towers.computeBoundingSphere();this.towerLights.computeBoundingSphere();
    for(let i=0;i<this.portals.length;i++){const d=Math.floor(distance/65)*65+45+i*65,p=point(d);this.portals[i].position.copy(p).add(new T.Vector3(0,3.8,0));this.portals[i].quaternion.setFromUnitVectors(new T.Vector3(0,0,-1),tangent(d));}
    this.lastRoad=distance;
  }
  render(dt:number,distance:number,rpm:number,speed:number,energy:number,home:boolean,complete:boolean) {
    this.elapsed+=dt;
    if(this.quality==='auto'&&!this.low&&dt<.3){this.frames++;this.frameTime+=dt;if(this.frames>=180){if(this.frameTime/this.frames>1/38){this.low=true;this.resize();this.onQualityChange(true);}this.frames=0;this.frameTime=0;}}
    const d=home?100:distance;
    if(Math.abs(d-this.lastRoad)>.25)this.updateRoad(d);
    const p=point(d),dir=tangent(d);
    this.bike.position.copy(p);this.bike.quaternion.setFromUnitVectors(new T.Vector3(0,0,-1),dir);
    this.crankAngle+=rpm/60*Math.PI*2*dt;
    for(const w of this.wheels)w.rotation.z=-this.crankAngle*2;
    this.crank.rotation.z=-this.crankAngle;
    for(let i=0;i<2;i++){
      const side=i?1:-1,a=this.crankAngle+i*Math.PI;
      const hip=new T.Vector3(-.45,1.91,side*.15),foot=new T.Vector3(-.1+Math.sin(a)*.22,.72+Math.cos(a)*.22,side*.17);
      const mid=hip.clone().add(foot).multiplyScalar(.5);const delta=foot.clone().sub(hip);const length=delta.length();const bend=Math.sqrt(Math.max(0,.65*.65-length*length/4));
      const knee=mid.add(new T.Vector3(-delta.y,delta.x,0).normalize().multiplyScalar(bend));
      for(const [j,start,end] of [[i*2,hip,knee],[i*2+1,knee,foot]] as [number,T.Vector3,T.Vector3][]){const leg=this.legs[j];leg.position.copy(start).add(end).multiplyScalar(.5);leg.scale.y=start.distanceTo(end);leg.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),end.clone().sub(start).normalize());}
      this.bike.children[0].getObjectByName('shoe'+side)!.position.copy(foot);
    }
    const narrow=this.camera.aspect<1;
    const offset=home?new T.Vector3(narrow?7:9,5.3,narrow?13:12):new T.Vector3(0,3.7,8.5);
    const cam=p.clone().add(offset),look=home?p.clone().add(new T.Vector3(narrow?0:-5,1.1,-9)):point(d+20).add(new T.Vector3(0,2,0));
    this.camera.position.lerp(cam,home?1:1-Math.exp(-dt*7));this.camera.lookAt(look);
    const fov=this.reduced?55:55+speed*.08+energy*.015;this.camera.fov=T.MathUtils.lerp(this.camera.fov,fov,.05);this.camera.updateProjectionMatrix();
    const c=chapterAt(d),target=new T.Color(c===0?'#a8ffc7':c===1?'#6edfff':'#ffaa72');this.theme.lerp(target,dt*.6);
    (this.rails.material as T.MeshStandardMaterial).emissive.copy(this.theme);(this.rails.material as T.MeshStandardMaterial).color.copy(this.theme);
    this.planetGroup.position.copy(p).add(new T.Vector3(home?-55:45,47,-210));this.planet.rotation.y+=dt*.012;
    (this.planet.material as T.ShaderMaterial).uniforms.time.value=this.elapsed;
    this.stars.position.set(p.x,p.y,p.z);this.stars.rotation.z=this.reduced?0:Math.sin(this.elapsed*.01)*.02;
    this.nebula.position.copy(p);this.nebula.material.uniforms.time.value=this.reduced?0:this.elapsed;this.nebula.material.uniforms.strength.value=c===0?.55:1;
    const linePos=this.streaks.geometry.getAttribute('position') as T.BufferAttribute;
    for(let i=0;i<70;i++){const z=((random(i+8)*70+this.elapsed*(speed*.5+1))%70)-60,x=(random(i+9)-.5)*44,y=random(i+10)*12+1;linePos.setXYZ(i*2,p.x+x,p.y+y,p.z+z);linePos.setXYZ(i*2+1,p.x+x,p.y+y,p.z+z+Math.max(.05,speed*.06));}linePos.needsUpdate=true;this.streaks.visible=!this.reduced&&speed>20;this.streaks.frustumCulled=false;
    const trail=this.trail.geometry.getAttribute('position') as T.BufferAttribute;
    for(let i=0;i<100;i++){const t=((random(i)*1.2+this.elapsed*2)%1.2);trail.setXYZ(i,p.x+(random(i+3)-.5)*t*.9,p.y+.12+random(i+4)*t*.3,p.z+t*3+.8);}trail.needsUpdate=true;this.trail.visible=speed>1;this.trail.frustumCulled=false;
    const sparks=this.sparks.geometry.getAttribute('position') as T.BufferAttribute;
    for(let i=0;i<400;i++){const age=(this.elapsed*.45+random(i+23))%1,angle=random(i+1)*Math.PI*2,rad=age*(complete?20:6);sparks.setXYZ(i,p.x+Math.cos(angle)*rad,p.y+3+Math.sin(angle)*rad-age*age*5,p.z-7+Math.sin(i)*rad);}sparks.needsUpdate=true;this.sparks.visible=!this.reduced&&(complete||energy>=100);this.sparks.frustumCulled=false;
    this.stars.geometry.setDrawRange(0,this.low?800:2400);this.bloom.enabled=!this.low;this.bloom.strength=this.reduced?.13:.28+(energy/100)*.12;
    if(this.low)this.renderer.render(this.scene,this.camera);else this.composer.render();
  }
  dispose(){this.observer.disconnect();this.canvas.removeEventListener('webglcontextlost',this.contextLost);this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Points||o instanceof T.LineSegments){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});this.composer.dispose();this.renderer.dispose();}
}
