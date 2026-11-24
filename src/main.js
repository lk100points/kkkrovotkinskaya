import * as THREE from 'three';

/* КРОВОТКИНСКАЯ — a procedural browser-based 3D horror game. */
const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, .1, 260);
camera.rotation.order = 'YXZ';
scene.add(camera);
const world = new THREE.Group();
scene.add(world);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const v3 = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const rand = (a,b) => a+Math.random()*(b-a);
const mat = (color, roughness=.85, metalness=0, extra={}) => new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});
const M = {
  concrete:mat('#62656a'), dark:mat('#17191d'), black:mat('#090b0e'), stone:mat('#c4c3bd'), stone2:mat('#8c8d8e'), gold:mat('#bca36a',.4,.55), glass:mat('#283b42',.22,.35,{transparent:true,opacity:.72}), warm:mat('#d9a15d',.45,0,{emissive:'#6a3515',emissiveIntensity:.7}), red:mat('#8c2732',.6,.1), green:mat('#a5d28d',.4,.1,{emissive:'#4b9c50',emissiveIntensity:1.3}), alien:mat('#7d8b85',.68,.05), alienDark:mat('#303d3e',.35,.1), glowGreen:mat('#b5ff9e',.25,.1,{emissive:'#46d66b',emissiveIntensity:2.4}), glowRed:mat('#ff5c4f',.25,.1,{emissive:'#d62326',emissiveIntensity:2.2}), blue:mat('#80c9d6',.25,.1,{emissive:'#246979',emissiveIntensity:1.4}), white:mat('#d9d8d0')
};
let phase='intro', paused=false, pauseFrom='church', quality='high';
let yaw=0, pitch=0, player=v3(0,1.65,8), velocity=v3(), health=100, selectedSlot=1;
let inventory={lighter:false,blood:false,water:false,portal:false,carbine:false,keys:false};
let objective='', currentInteract=null, toastTimer=0, dialogueLines=[], dialogueIndex=0, dialogueDone=null;
let interactables=[], colliders=[], enemies=[], projectiles=[], particles=[], flightEnemies=[], flightShots=[];
let introTime=0, sceneTime=0, portalMesh=null, ufo=null, ufoGlow=null, deadAlien=null, friendAlien=null, candleLight=null, candleFlame=null;
let flightScore=0, flightGoal=5, flightTime=0, boostUntil=0, playerDamageCooldown=0, waveSpawned=false;
let bloodPoured=false, waterPoured=false, fireHeld=false, fireHeldRMB=false, fireCooldown=0, cockpitDialogueStarted=false, lighterGlow=null, flightPulseMeshes=[], transitioning=false;
let weaponRig=null, muzzleFlash=null, audioCtx=null, masterGain=null, ambience=null, ambienceOsc=[];
const keys=Object.create(null);
const tmpDir=v3(), tmpRight=v3(), tmpMove=v3();

function makeNoiseTexture(base, accent, size=256, count=1500){
  const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d');ctx.fillStyle=base;ctx.fillRect(0,0,size,size);
  for(let i=0;i<count;i++){ctx.globalAlpha=rand(.025,.16);ctx.fillStyle=Math.random()>.5?accent:'#050607';let w=rand(1,16),h=rand(1,8);ctx.fillRect(rand(0,size),rand(0,size),w,h)}
  ctx.globalAlpha=1;const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;return t;
}
const brickTex=makeNoiseTexture('#70483d','#a06a55',256,850);
const concreteTex=makeNoiseTexture('#55585b','#8a8b87',256,1100);
const pavingTex=makeNoiseTexture('#424449','#66686b',256,700);
function addMesh(parent, geo, material, pos, rot=null, scale=null, cast=true, receive=true){const o=new THREE.Mesh(geo,material);o.position.copy(pos);if(rot)o.rotation.set(rot.x,rot.y,rot.z);if(scale)o.scale.copy(scale);o.castShadow=cast;o.receiveShadow=receive;parent.add(o);return o;}
function box(parent,w,h,d,material,x,y,z,opts={}){return addMesh(parent,new THREE.BoxGeometry(w,h,d),material,v3(x,y,z),opts.rot||null,opts.scale||null,opts.cast!==false,opts.receive!==false)}
function sphere(parent,r,material,x,y,z,sx=1,sy=1,sz=1){return addMesh(parent,new THREE.SphereGeometry(r,24,16),material,v3(x,y,z),null,v3(sx,sy,sz))}
function cylinder(parent,rt,rb,h,material,x,y,z,segments=24){return addMesh(parent,new THREE.CylinderGeometry(rt,rb,h,segments),material,v3(x,y,z))}
function torus(parent,r,t,material,x,y,z,rx=0,ry=0,rz=0){return addMesh(parent,new THREE.TorusGeometry(r,t,10,56),material,v3(x,y,z),v3(rx,ry,rz))}
function addLight(parent,color,intensity,distance,x,y,z,decay=2){const l=new THREE.PointLight(color,intensity,distance,decay);l.position.set(x,y,z);parent.add(l);return l;}
function setObjective(text){objective=text;$('objective-text').textContent=text;}
function transitionTo(action){if(transitioning)return;transitioning=true;const cover=$('scene-fade');cover.classList.add('show');setTimeout(()=>{action();setTimeout(()=>{cover.classList.remove('show');transitioning=false;},180);},430);}
function setChapter(chapter,location){$('chapter-name').textContent=chapter;$('location-name').textContent=location;}
function showToast(text,duration=2600){$('toast').textContent=text;$('toast').classList.add('visible');toastTimer=duration;}
function updateHealth(){ $('health-fill').style.width=`${health}%`; $('health-value').textContent=`${Math.ceil(health)} / 100`; }
function updateSlots(){document.querySelectorAll('.slot').forEach(s=>s.classList.toggle('active',Number(s.dataset.slot)===selectedSlot));}
function setPhase(next){phase=next;sceneTime=0;interactables=[];colliders=[];enemies=[];projectiles=[];particles=[];flightEnemies=[];flightShots=[];currentInteract=null;}
function clearWorld(){while(world.children.length){const child=world.children[0];world.remove(child);child.traverse?.(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});}candleLight=null;candleFlame=null;portalMesh=null;}
function baseScene(color,fogColor,fogDensity){for(const child of [...scene.children])if(child.isLight)scene.remove(child);scene.background=new THREE.Color(color);scene.fog=new THREE.FogExp2(fogColor,fogDensity);scene.add(new THREE.HemisphereLight(0x8f9aa7,0x16171a,.72));}
function plane(parent,w,d,material,x=0,y=0,z=0){const p=addMesh(parent,new THREE.PlaneGeometry(w,d),material,v3(x,y,z),v3(-Math.PI/2,0,0),null,false,true);return p;}
function addInteract(mesh,name,action,range=2.25,kind='object'){interactables.push({mesh,name,action,range,kind,position:mesh.getWorldPosition(v3())});return mesh;}
function addCollider(x,z,w,d){colliders.push({x,z,w,d});}
function blocked(x,z){for(const c of colliders){if(Math.abs(x-c.x)<c.w/2+.35&&Math.abs(z-c.z)<c.d/2+.35)return true;}return false;}
function movePlayer(dt){const speed=(keys.ShiftLeft||keys.ShiftRight)?6.8:4.25;tmpDir.set(-Math.sin(yaw),0,-Math.cos(yaw));tmpRight.set(Math.cos(yaw),0,-Math.sin(yaw));tmpMove.set(0,0,0);if(keys.KeyW||keys.ArrowUp)tmpMove.add(tmpDir);if(keys.KeyS||keys.ArrowDown)tmpMove.sub(tmpDir);if(keys.KeyD||keys.ArrowRight)tmpMove.add(tmpRight);if(keys.KeyA||keys.ArrowLeft)tmpMove.sub(tmpRight);if(tmpMove.lengthSq()>0){tmpMove.normalize().multiplyScalar(speed*dt);let nx=player.x+tmpMove.x,nz=player.z+tmpMove.z;if(phase==='garden'){nx=clamp(nx,-26,26);nz=clamp(nz,-29,29);}else if(phase==='basement'){nx=clamp(nx,-7.2,7.2);nz=clamp(nz,-11.8,11.8);}else{nx=clamp(nx,-8.2,8.2);nz=clamp(nz,-14.2,14.2);}if(!blocked(nx,player.z))player.x=nx;if(!blocked(player.x,nz))player.z=nz;}player.y=1.65;}
function setCameraFPS(dt=0){camera.position.set(player.x,player.y,player.z);camera.rotation.set(pitch,yaw,0,'YXZ');}
function addFloor(w,d,colorOrMat=mat('#303136'),x=0,z=0){const m=typeof colorOrMat==='string'?mat(colorOrMat):colorOrMat;return plane(world,w,d,m,x,0,z);}
function addWall(w,h,d,material,x,y,z){const o=box(world,w,h,d,material,x,y,z);addCollider(x,z,w,d);return o;}
function addArch(parent,x,y,z,r,material){const geo=new THREE.TorusGeometry(r,.16,10,32,Math.PI);const o=addMesh(parent,geo,material,v3(x,y,z),v3(0,0,Math.PI));return o;}

// -------------------- INTRO / EXTERIOR --------------------
function buildCathedral(parent,x,z,scale=1){
  const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);parent.add(g);
  const stone=mat('#c3c2bd'), trim=mat('#e0ddd5'), shadow=mat('#757a81'), gold=mat('#9b8358',.42,.55), door=mat('#272a30');
  box(g,13,8.2,8,stone,0,4.1,0);box(g,14,.35,8.8,trim,0,8.15,0);box(g,9,1.5,8.5,trim,0,8.9,0);
  // Facade pilasters, deep portals and circular windows.
  for(let x1 of [-5.2,-2.8,0,2.8,5.2]){box(g,.42,7.2,.56,trim,x1,4.1,4.15);box(g,.7,.35,.75,trim,x1,7.75,4.15);box(g,.7,.35,.75,trim,x1,.55,4.15);}
  for(let x1 of [-4.3,-1.8,1.8,4.3]){const w=sphere(g,.55,shadow,x1,5.7,4.18,1,1,.12);sphere(g,.35,mat('#393e47'),x1,5.7,4.28,1,1,.08);}
  // Main arched entrance.
  box(g,2.6,4.4,.25,door,0,2.2,4.24);addArch(g,0,4.35,4.25,1.3,trim);box(g,2.9,.18,.5,gold,0,4.2,4.36);
  for(let s of [-1,1]){box(g,.35,3.8,.45,trim,s*1.55,2,4.2);cylinder(g,.22,.22,.35,trim,s*1.55,4,4.2);}
  // Central drum and dome.
  cylinder(g,2.65,2.9,2.2,trim,0,10,0,40);for(let i=0;i<16;i++){let a=i*Math.PI/8;const c=box(g,.18,1.55,.35,trim,Math.sin(a)*2.52,10.05,Math.cos(a)*2.52);c.rotation.y=a;}
  const dome=addMesh(g,new THREE.SphereGeometry(2.8,32,20,0,Math.PI*2,0,Math.PI/2),mat('#aaa79d'),v3(0,11.2,0),null,v3(1,1.1,1));
  torus(g,2.65,.1,gold,0,10.65,0);
  cylinder(g,.09,.09,2.2,gold,0,14.1,0,12);sphere(g,.12,gold,0,15.2,0,.65,1,.65);
  // Smaller corner domes and bell towers.
  for(const [sx,sz] of [[-5.1,2.7],[5.1,2.7],[-5.1,-2.7],[5.1,-2.7]]){
    cylinder(g,.92,1.12,1.45,trim,sx,9.2,sz,24);const d=addMesh(g,new THREE.SphereGeometry(1.05,24,16,0,Math.PI*2,0,Math.PI/2),mat('#a8a398'),v3(sx,10.05,sz),null,v3(1,1,1));cylinder(g,.045,.045,1.2,gold,sx,11.1,sz,8);
  }
  // Side windows / stone bands.
  for(let side of [-1,1])for(let z1 of [-2.5,0,2.5]){box(g,.2,4.4,.85,trim,side*6.57,4.2,z1);box(g,.22,2.1,.62,shadow,side*6.69,4.7,z1);}
  return g;
}
function buildIntro(){clearWorld();setPhase('intro');baseScene('#7d8794','#8d97a5',.012);scene.fog.color.set('#8e98a8');scene.fog.density=.012;
  const ground=mat('#555b64');plane(world,180,180,ground,0,-.25,-5);
  // River and embankment.
  const river=mat('#202a35',.18,.5);plane(world,180,34,river,0,-.15,24);
  for(let i=0;i<70;i++){const l=box(world,rand(.15,.8),.018,rand(.4,1.5),mat('#73818a',.3,.2,{transparent:true,opacity:.25}),rand(-42,42),-.04,rand(10,39));l.rotation.y=rand(0,Math.PI);}
  box(world,100,1.4,1.4,mat('#666b70'),0,.35,6);box(world,100,.2,1.8,mat('#85878a'),0,1.1,6);
  // Cathedral is the main distant silhouette.
  const cathedral=buildCathedral(world,-9,-7,.96);cathedral.rotation.y=-.18;
  // Winter trees on the river bank.
  for(let i=0;i<26;i++){let x=rand(-33,33),z=rand(-3,4);if(x>-18&&x<3)continue;const trunk=cylinder(world,.08,.16,2.8,mat('#292b30'),x,1.4,z,7);for(let j=0;j<5;j++){const branch=cylinder(world,.025,.08,rand(1.5,2.5),mat('#303238'),x+rand(-.7,.7),rand(2.2,3.6),z+rand(-.7,.7),6);branch.rotation.z=rand(-.8,.8);}}
  // Steel pedestrian bridge across the frame.
  const bridge=new THREE.Group();bridge.position.set(10,0,-1);bridge.rotation.y=-.12;world.add(bridge);
  box(bridge,28,.38,2.8,mat('#25292e',.45,.65),0,5.4,0);box(bridge,28,.14,2.9,mat('#b6a06a',.4,.5,{emissive:'#735d32',emissiveIntensity:.65}),0,5.65,0);
  for(let x=-13;x<=13;x+=1.15){box(bridge,.07,1.45,.07,mat('#25292d',.55,.6),x,6.25,-1.27);box(bridge,.07,1.45,.07,mat('#25292d',.55,.6),x,6.25,1.27);}
  for(let x=-14;x<=14;x+=2.3){box(bridge,.09,.16,3,mat('#b9a16a',.35,.45,{emissive:'#8c6e37',emissiveIntensity:.9}),x,6.95,0);}
  const archCurve=new THREE.QuadraticBezierCurve3(v3(-14,0,0),v3(0,10,0),v3(14,0,0));const pts=archCurve.getPoints(50);const archGeo=new THREE.BufferGeometry().setFromPoints(pts);const arch= new THREE.Line(archGeo,new THREE.LineBasicMaterial({color:0x4a4e52}));arch.position.y=5.4;bridge.add(arch);
  for(let x=-13;x<=13;x+=1.1){const w=box(bridge,.05,Math.max(.4,5-Math.abs(x)*.22),.06,mat('#3a3e43',.4,.65),x,3.8,-.8);w.rotation.z=(x/14)*.45;}
  // Fine bridge lamps.
  for(let x=-12;x<=12;x+=4){cylinder(bridge,.045,.065,2.2,mat('#25292e'),x,7.1,0,8);sphere(bridge,.14,mat('#e2bd76',.25,0,{emissive:'#ffce75',emissiveIntensity:2}),x,8.25,0,.8,1,.8);addLight(bridge,0xffc56e,.7,8,x,8.1,0);}
  // Distant city silhouettes.
  for(let i=0;i<22;i++){let x=rand(-48,48),z=rand(-30,-20),h=rand(5,15);box(world,rand(3,7),h,rand(3,5),mat(i%3?'#69717c':'#545d67'),x,h/2,z);}
  // The incoming saucer, suspended in the haze.
  const saucer=createUFO();saucer.position.set(12,18,-20);saucer.scale.setScalar(.85);world.add(saucer);saucer.userData.intro=true;
  // Weather particles.
  for(let i=0;i<210;i++){const p=sphere(world,.025,mat('#cfd4dd',.4,0,{transparent:true,opacity:rand(.15,.55)}),rand(-42,42),rand(0,25),rand(-20,34));p.userData.fall=rand(2,7);particles.push(p);}
  camera.position.set(2,5.1,33);camera.lookAt(-5,8,-6);camera.rotation.order='YXZ';
  introTime=0;
  $('intro-copy').classList.add('hidden');$('intro-copy').classList.add('active');$('hud').classList.add('hidden');$('ending-screen').classList.add('hidden');
}
function createLightning(){const pts=[];let x=-7,y=20,z=-6;pts.push(v3(x,y,z));for(let i=0;i<10;i++){x+=rand(-1.1,1.1);y-=rand(1,2.6);z+=rand(-.5,.5);pts.push(v3(x,y,z));}const geo=new THREE.BufferGeometry().setFromPoints(pts);const bolt=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xbaff8b,transparent:true,opacity:1}));world.add(bolt);const flash=addLight(world,0x8bff80,24,40,-8,8,-5);const pulse=addLight(world,0xff4440,5,18,-8,8,-5);setTimeout(()=>{world.remove(bolt);world.remove(flash);world.remove(pulse);},520);for(let i=0;i<18;i++){const p=sphere(world,rand(.05,.16),i%2?M.glowGreen:M.glowRed,-8+rand(-2,2),rand(7,14),-5+rand(-2,2));p.userData.life=rand(.25,.6);particles.push(p);}}

// -------------------- CHURCH INTERIOR --------------------
function buildChurch(){clearWorld();setPhase('church');baseScene('#17191d','#121419',.027);scene.background.set('#0e1015');scene.add(new THREE.AmbientLight(0x59616a,.25));
  const floorMat=mat('#393a3c',.95,0,{map:pavingTex}), wallMat=mat('#a7a49b',.9,0,{map:concreteTex}), trim=mat('#c1beb4'), wood=mat('#392c29'), dark=mat('#111316');
  plane(world,18,30,floorMat,0,0,0);box(world,18,.45,30,dark,0,-.25,0);
  // Nave walls and upper clerestory.
  addWall(18,8,.5,wallMat,0,4,-15);addWall(18,8,.5,wallMat,0,4,15);addWall(.5,8,30,wallMat,-9,4,0);addWall(.5,8,30,wallMat,9,4,0);
  for(let z=-12;z<=12;z+=4){for(let x of [-7.8,7.8]){box(world,.72,7,.72,trim,x,3.5,z);box(world,1.05,.35,1.05,trim,x,7,z);}}
  // Barrel-like ceiling ribs and dark vault panels.
  for(let z=-12;z<=12;z+=4){const arch=new THREE.TorusGeometry(7.8,.16,10,48,Math.PI);addMesh(world,arch,mat('#817e77'),v3(0,7.9,z),v3(0,0,Math.PI));}
  box(world,13,.3,28,mat('#6b6862'),0,7.3,0);
  // Icons, wall lamps, candle stands.
  for(let z=-10;z<=10;z+=6){for(let side of [-1,1]){box(world,.12,1.1,.12,mat('#41372e'),side*8.45,4.4,z);const lamp=sphere(world,.18,M.warm,side*8.4,5,z,.8,1.2,.8);addLight(world,0xffa45b,.35,5,side*8.2,5,z);}}
  // Iconostasis / altar at far end.
  box(world,8,4,.55,mat('#43342c'),0,2,-13.7);box(world,8,.2,.65,M.gold,0,4,-13.7);
  for(let x=-3.4;x<=3.4;x+=1.7){box(world,.12,3.4,.3,M.gold,x,2,-13.34);sphere(world,.34,M.gold,x,3.55,-13.31,.8,1.25,.18);}
  // Central aisle runner and pews.
  box(world,3,.025,22,mat('#4b3430'),0,.025,0);
  for(let z=-7;z<=7;z+=3.5){for(let x of [-5,5]){box(world,2.8,1.05,.55,wood,x,.65,z);box(world,2.8,.15,.62,mat('#61473a'),x,1.25,z+.12);for(let dx of [-1.1,1.1])box(world,.12,.9,.14,wood,x+dx,.5,z);addCollider(x,z,2.8,.7);}}addCollider(0,-7.4,1.45,1.05);addCollider(0,-13.7,8,.7);
  // Candle and lighter, positioned on a stone lectern.
  box(world,1.45,1.3,1.05,mat('#756e64'),0,.65,-7.4);box(world,1.6,.13,1.15,trim,0,1.36,-7.4);
  cylinder(world,.075,.09,.42,mat('#d5c7a6'),-.22,1.62,-7.4,12);
  candleFlame=sphere(world,.075,mat('#ffe39b',.2,0,{emissive:'#ffb340',emissiveIntensity:3}),-.22,1.9,-7.4,.7,1.6,.7);
  candleLight=addLight(world,0xffc477,.85,7,-.22,2,-7.4);candleLight.userData.flicker=true;
  const lighter=box(world,.25,.12,.18,mat('#a6a7a3',.35,.6),.35,1.47,-7.4);lighter.rotation.y=.35;
  addInteract(lighter,'ЗАБРАТЬ ЗАЖИГАЛКУ',()=>{if(!inventory.lighter){inventory.lighter=true;lighter.visible=false;showToast('ЗАЖИГАЛКА ДОБАВЛЕНА В ИНВЕНТАРЬ');selectedSlot=1;updateSlots();}else showToast('ЗАЖИГАЛКА УЖЕ У ВАС');},2.4,'pickup');
  // Book and language symbols.
  const book=box(world,.8,.12,.62,mat('#302c2e'),-.65,1.49,-7.4);book.rotation.y=-.3;box(world,.025,.13,.57,mat('#b49e75'),-.65,1.5,-7.4);
  addInteract(book,'ПРОЧИТАТЬ КНИГУ',()=>{rune.visible=true;showToast('ЗНАКИ НЕ ПОХОЖИ НИ НА ОДИН ЧЕЛОВЕЧЕСКИЙ АЛФАВИТ');setObjective('Свет свечи указывает на вход в подвал.');},2.5,'book');
  // Floor hatch, revealed by candle after first look.
  const hatch=box(world,2.5,.16,2.2,wood,0,.09,-12);hatch.rotation.y=.05;
  const rune=torus(world,.7,.035,M.glowGreen,0,.2,-12,Math.PI/2,0,0);rune.visible=false;
  const hatchLabel=addInteract(hatch,'СПУСТИТЬСЯ В ПОДВАЛ',()=>transitionTo(()=>{buildBasement();showToast('НИЖНИЙ УРОВЕНЬ / СЕКТОР −01');}),2.6,'door');hatchLabel.visible=true;
  const stairMat=mat('#292b2e');for(let i=0;i<7;i++)box(world,2,.22,.55,stairMat,0,.12+i*.08,-10.2-i*.45);
  // Dust motes in the single candle beam.
  for(let i=0;i<35;i++){const p=sphere(world,rand(.012,.026),mat('#d2c7a6',.3,0,{transparent:true,opacity:.35}),rand(-3,3),rand(.4,5),rand(-10,-4));p.userData.dust=true;particles.push(p);}
  player.set(0,1.65,9.8);yaw=0;pitch=0;setCameraFPS();
  setChapter('ГЛАВА 01 / ХРАМ','ХРАМ ХРИСТА СПАСИТЕЛЯ');setObjective('Осмотреть церковь. Найти источник света.');
  $('hud').classList.remove('hidden');$('intro-copy').classList.add('hidden');$('flight-hud').classList.add('hidden');$('shift-prompt').classList.add('hidden');updateSlots();
  if(!inventory.lighter)selectedSlot=1;
  // A low, warm shaft of light marks the altar.
  const shaft=addLight(world,0xffd9a0,.18,14,0,4,-7);shaft.userData.flicker=true;
}

function buildBasement(){clearWorld();setPhase('basement');baseScene('#090b0e','#08090c',.034);scene.add(new THREE.AmbientLight(0x4c5358,.22));
  const concrete=mat('#4b4b49',.98,0,{map:concreteTex}), floor=mat('#292a2c',.95,0,{map:pavingTex}), metal=mat('#3d4245',.55,.48), brick=mat('#51413d',.95,0,{map:brickTex});
  plane(world,16,26,floor,0,0,0);box(world,16,.5,26,concrete,0,-.28,0);box(world,16,.5,26,concrete,0,5.1,0);
  addWall(16,5,.5,brick,0,2.5,-13);addWall(16,5,.5,concrete,0,2.5,13);addWall(.5,5,26,brick,-8,2.5,0);addWall(.5,5,26,concrete,8,2.5,0);
  // Pipes and old service lamps.
  for(let side of [-1,1]){const pipe=cylinder(world,.12,.12,22,metal,side*6.9,4.4,0,12);pipe.rotation.x=Math.PI/2;for(let z=-8;z<=8;z+=4){box(world,.4,.2,.5,metal,side*6.9,3.9,z);}}
  for(let z=-9;z<=9;z+=6){box(world,.35,.12,.35,metal,0,4.65,z);const lamp=sphere(world,.1,mat('#c49b67',.3,0,{emissive:'#bd7136',emissiveIntensity:.9}),0,4.5,z);addLight(world,0xff9c54,.28,5,0,4.3,z);}
  // Stairwell at the back.
  for(let i=0;i<9;i++){const step=box(world,3,.2,.55,mat('#343536'),0,.15+i*.22,-10+i*.7);}
  box(world,3,.35,1.4,mat('#252629'),0,2.15,-4.1);
  // Dead alien on the examination slab: strange, but not graphic.
  box(world,3.2,.65,2.3,metal,0,.65,-3.6);box(world,3.4,.12,2.5,mat('#686a66'),0,1.03,-3.6);addCollider(0,-3.6,3.2,2.3);
  deadAlien=createAlien(v3(0,1.12,-3.6),false,true);world.add(deadAlien);addInteract(deadAlien,'ИСПОЛЬЗОВАТЬ СОБРАННЫЕ СОСТАВЫ',performRitual,3.0,'ritual');
  // Blood chalice and vial of holy water.
  const chalice=new THREE.Group();chalice.position.set(-4,0,1);world.add(chalice);cylinder(chalice,.14,.23,.34,M.gold,0,.28,0,16);cylinder(chalice,.055,.1,.22,M.gold,0,.06,0,16);cylinder(chalice,.23,.23,.055,M.gold,0,.48,0,20);cylinder(chalice,.18,.18,.02,mat('#4d131c',.25,0,{emissive:'#31050a',emissiveIntensity:.3}),0,.47,0,20);
  addInteract(chalice,'ВЗЯТЬ ЧАШУ С КРОВЬЮ',()=>{if(!inventory.blood){inventory.blood=true;chalice.visible=false;world.remove(chalice);showToast('ЧАША С КРОВЬЮ ДОБАВЛЕНА');setObjective('Найти святую воду.');}else showToast('ЧАША УЖЕ У ВАС');},2.5,'pickup');
  const bottle=new THREE.Group();bottle.position.set(4,0,1);world.add(bottle);cylinder(bottle,.18,.22,.62,mat('#8a9a9a',.2,.1,{transparent:true,opacity:.72}),0,.34,0,20);cylinder(bottle,.08,.08,.17,M.gold,0,.73,0,16);cylinder(bottle,.12,.12,.04,mat('#d7d0b6'),0,.83,0,16);sphere(bottle,.14,M.blue,0,.25,0,1,.5,1);
  addInteract(bottle,'ЗАБРАТЬ СВЯТУЮ ВОДУ',()=>{if(!inventory.water){inventory.water=true;bottle.visible=false;world.remove(bottle);showToast('СВЯТАЯ ВОДА ДОБАВЛЕНА');setObjective('Вернуться к существу и использовать предметы по порядку.');}else showToast('ВОДА УЖЕ У ВАС');},2.5,'pickup');
  // A hand-painted clue on a wall.
  const sigil=torus(world,.75,.055,M.glowGreen,-5,2.1,-12,0,0,0);sigil.rotation.y=Math.PI/2;
  const runeText=makeWallText('S A  /  09  /  N', '#b1c69a');const sign=addMesh(world,new THREE.PlaneGeometry(2.8,.55),new THREE.MeshBasicMaterial({map:runeText,transparent:true,opacity:.85}),v3(-7.73,2.7,-8),v3(0,Math.PI/2,0));
  player.set(0,1.65,9.5);yaw=0;pitch=0;setCameraFPS();bloodPoured=false;waterPoured=false;setChapter('ГЛАВА 01 / НИЖНИЙ УРОВЕНЬ','ПОДВАЛ');setObjective('Найти чашу с кровью и святую воду.');
}
function makeWallText(text,color='#d8d2c1'){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.clearRect(0,0,512,128);ctx.fillStyle=color;ctx.font='24px monospace';ctx.textAlign='center';ctx.fillText(text,256,70);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}

// -------------------- ALIEN CHARACTER / STORY --------------------
function createAlien(position,hostile=false,lying=false){const root=new THREE.Group();root.position.copy(position);root.userData.isAlien=true;
  const skin=hostile?mat('#404b4b',.5,.05):mat('#84918a',.68,.02), dark=mat('#20292a',.5,.1), eye=hostile?mat('#ff524a',.25,0,{emissive:'#c21d22',emissiveIntensity:2.3}):mat('#b5e9ad',.22,0,{emissive:'#58b966',emissiveIntensity:2.2});
  const body=sphere(root,.56,skin,0,1.06,0,.83,1.5,.62);const head=sphere(root,.48,skin,0,2.07,-.08,1.2,.83,.95);
  sphere(root,.115,eye,-.22,2.12,.36,1,.8,.5);sphere(root,.115,eye,.22,2.12,.36,1,.8,.5);
  sphere(root,.12,dark,0,1.86,.38,.9,.25,.35);
  for(let side of [-1,1]){const arm=cylinder(root,.12,.2,1.35,skin,side*.63,1.1,.02,12);arm.rotation.z=side*.23;if(side===1)root.userData.rightArm=arm;const hand=sphere(root,.18,dark,side*.76,.42,.02,.9,1.2,.85);const leg=cylinder(root,.14,.2,.9,skin,side*.25,.27,0,12);leg.rotation.z=side*.08;}
  for(let i=0;i<3;i++){const spine=cylinder(root,.035,.09,.48,dark,0,1.0-i*.22,-.48,7);spine.rotation.x=-.6;}
  if(lying){root.rotation.z=Math.PI/2;root.rotation.y=-.25;root.position.y=.25;}
  if(hostile){root.scale.setScalar(1.05);root.userData.hostile=true;}
  return root;
}
function performRitual(){if(!deadAlien)return;if(!inventory.blood&&!bloodPoured){showToast('СНАЧАЛА НУЖНА ЧАША С КРОВЬЮ.');return;}if(inventory.blood&&!bloodPoured){inventory.blood=false;bloodPoured=true;spawnImpact(deadAlien.position.clone().add(v3(0,1.2,0)),0xb62c39);showToast('КРОВЬ ПРОЛИТА НА СУЩЕСТВО. ТЕПЕРЬ — СВЯТАЯ ВОДА.');setObjective('Полить существо святой водой.');return;}if(!inventory.water&&!waterPoured){showToast('ТЕПЕРЬ НУЖНА СВЯТАЯ ВОДА.');return;}if(inventory.water&&!waterPoured){inventory.water=false;waterPoured=true;spawnImpact(deadAlien.position.clone().add(v3(0,1.4,0)),0x8bcbdc);showToast('СВЯТАЯ ВОДА КАСАЕТСЯ КОЖИ.');setTimeout(triggerResurrection,650);}}
function triggerResurrection(){if(!bloodPoured||!waterPoured)return;
  if(deadAlien){deadAlien.visible=false;world.remove(deadAlien);deadAlien=null;interactables=interactables.filter(i=>i.kind!=='ritual');}friendAlien=createAlien(v3(0,0,-3.5),false,false);friendAlien.scale.setScalar(.93);world.add(friendAlien);friendAlien.position.set(0,0,-3.5);
  const aura=sphere(world,.9,M.glowGreen,0,1,-3.5,1,.1,1);aura.material.transparent=true;aura.material.opacity=.24;setTimeout(()=>world.remove(aura),1400);
  showToast('СУЩЕСТВО ВЕРНУЛОСЬ К ЖИЗНИ',3000);beginDialogue('СУЩЕСТВО',[
    'Не двигайся. Ты вернул меня — значит, ещё не всё потеряно.',
    'Вторжение началось здесь. Через эту церковь. Они открыли проход под куполом.',
    'Я был единственным, кто отказался служить им. Поэтому меня и оставили здесь.',
    'Я должен остаться. Но тебе понадобится кое-что получше свечи.',
    'Съешь таблетку. Не задавай вопросов. Она просто позволит увидеть выход.'
  ],()=>{
    showToast('НЕИЗВЕСТНАЯ ТАБЛЕТКА: ПРИНЯТА',2400);
    setTimeout(()=>{inventory.portal=true;inventory.carbine=true;selectedSlot=2;updateSlots();createPortalAt(v3(0,1.9,-12.1));setObjective('Создать проход и войти в портал.');showToast('ПОЛУЧЕНО: ЭНЕРГЕТИЧЕСКИЙ АВТОМАТ · ПОРТАЛЬНОЕ УСТРОЙСТВО',3600);},500);
  });
}
function beginDialogue(speaker,lines,onDone){dialogueLines=lines;dialogueIndex=0;dialogueDone=onDone;$('dialogue-speaker').textContent=speaker;$('dialogue-text').textContent=lines[0];$('dialogue').classList.remove('hidden');}
function advanceDialogue(){if($('dialogue').classList.contains('hidden'))return;dialogueIndex++;if(dialogueIndex>=dialogueLines.length){$('dialogue').classList.add('hidden');const cb=dialogueDone;dialogueDone=null;if(cb)cb();}else $('dialogue-text').textContent=dialogueLines[dialogueIndex];}
function createPortalAt(pos){if(portalMesh)world.remove(portalMesh);const g=new THREE.Group();g.position.copy(pos);g.rotation.y=Math.PI;world.add(g);const outer=torus(g,1.13,.085,mat('#5f8e9b',.25,.25,{emissive:'#2c8398',emissiveIntensity:2}),0,0,0,0,0,0);outer.rotation.y=0;torus(g,.92,.035,mat('#d8a78b',.2,.2,{emissive:'#ac5539',emissiveIntensity:2}),0,0,0);const disc=sphere(g,.86,mat('#1a343d',.3,.1,{emissive:'#142c39',emissiveIntensity:.7,transparent:true,opacity:.84}),0,0,-.06,1,1,.08);for(let i=0;i<8;i++){let a=i*Math.PI/4;const p=sphere(g,.075,i%2?M.glowGreen:M.glowRed,Math.cos(a)*1.18,Math.sin(a)*1.18,0);}
  addLight(g,0x4fc5b4,2.5,9,0,0,1);portalMesh=g;
  const trigger=box(world,.2,.2,.2,mat('#000000',1,0,{transparent:true,opacity:0}),pos.x,pos.y,pos.z);trigger.visible=true;
  addInteract(trigger,'ВОЙТИ В ПОРТАЛ',()=>transitionTo(buildGarden),2.7,'portal');
}

// -------------------- GARDEN QUARTERS --------------------
function makeResidentialBuilding(x,z,w,d,h,style=0){const group=new THREE.Group();group.position.set(x,0,z);world.add(group);addCollider(x,z,w,d);const base=style===0?mat('#8e5947',.9,0,{map:brickTex}):style===1?mat('#c2bdb0',.9):mat('#657b7a',.65,.16);const trim=mat('#b8b6ad');const windowMat=mat(style===2?'#6b9995':'#26363b',.22,.3,{emissive:'#132327',emissiveIntensity:.15});const litWindowMat=mat('#c5a16c',.45,0,{emissive:'#986e39',emissiveIntensity:.5});
  box(group,w,h,d,base,0,h/2,0);for(let y=2.1;y<h;y+=2.6){box(group,w+.08,.13,d+.08,trim,0,y,0);for(let xx=-w/2+1;xx<w/2-1;xx+=2.1){for(let side of [-1,1]){const win=box(group,1.05,1.5,.09,windowMat,xx,y+.7,side*(d/2+.055));if(Math.random()>.6){box(group,.75,.04,.08,litWindowMat,xx,y+.7,side*(d/2+.12));}}}}
  for(let side of [-1,1]){for(let zz=-d/2+1;zz<d/2;zz+=2.5){box(group,.08,1.8,.08,trim,side*(w/2+.02),.9,zz);}}
  if(style===1){for(let yy=2;yy<h;yy+=2.6){box(group,w*.34,.07,d+.2,mat('#3d4243'),w*.31,yy+.2,0);}}
  return group;
}
function createUFO(){const g=new THREE.Group();const hull=mat('#292f34',.28,.72), rim=mat('#818d8c',.26,.6), glass=mat('#5a7b79',.18,.3,{transparent:true,opacity:.83}), lights=mat('#d1ecb5',.18,.1,{emissive:'#a1f285',emissiveIntensity:2.3});
  const disk=addMesh(g,new THREE.CylinderGeometry(2.6,3.4,.48,64),hull,v3(0,0,0));disk.scale.z=.74;
  const band=torus(g,2.8,.12,rim,0,-.18,0);band.scale.z=.76;
  const dome=addMesh(g,new THREE.SphereGeometry(1.45,36,22,0,Math.PI*2,0,Math.PI/2),glass,v3(0,.22,0));dome.scale.set(1,.72,.82);
  cylinder(g,.12,.35,.45,hull,0,.36,0,24);
  for(let i=0;i<20;i++){const a=i*Math.PI/10;const l=sphere(g,.11,lights,Math.cos(a)*2.75,-.04,Math.sin(a)*2.08,.9,.8,.9);}
  const top=sphere(g,.16,lights,0,.9,0,1,.55,1);g.userData.thrusters=[];
  for(let i=0;i<4;i++){let a=i*Math.PI/2;let t=sphere(g,.18,M.blue,Math.cos(a)*1.9,-.5,Math.sin(a)*1.45,.8,2,.8);g.userData.thrusters.push(t);}
  addLight(g,0x74e4d3,2.5,10,0,-.7,0);g.userData.hull=disk;return g;
}
function buildGarden(){clearWorld();setPhase('garden');flightScore=0;baseScene('#282d36','#24272d',.009);scene.background.set('#777a7d');scene.fog=new THREE.FogExp2('#777b80',.008);
  scene.add(new THREE.HemisphereLight(0x9ba5b2,0x222225,.72));
  const ground=mat('#55565a',.95,0,{map:pavingTex});plane(world,100,100,ground,0,0,0);
  // Sunken reflecting pool and landscaped banks, like the reference.
  box(world,28,.55,10,mat('#46484b'),0,-.25,-5);plane(world,24,7,mat('#1c2a30',.12,.45,{transparent:true,opacity:.9}),0,.035,-5);
  for(let x=-12;x<=12;x+=2){box(world,.08,.05,7,mat('#9b9d9a'),x,.08,-5);}
  for(let side of [-1,1]){box(world,5,.5,25,mat('#4b4c4c'),side*16,.25,0);for(let j=0;j<8;j++){const tree=cylinder(world,.16,.28,2.5,mat('#3a332d'),side*16+rand(-1.5,1.5),1.25,rand(-10,12),9);const crown=sphere(world,1.2,mat('#303c36'),tree.position.x,3,tree.position.z,1.2,1.25,1.2);}}
  // Asymmetric residential facades: brick, pale stone, oxidised green glass.
  makeResidentialBuilding(-18,-12,9,8,18,1);makeResidentialBuilding(-7,-21,9,8,15,0);makeResidentialBuilding(7,-21,9,8,17,2);makeResidentialBuilding(19,-11,9,8,20,2);makeResidentialBuilding(-20,11,8,9,15,0);makeResidentialBuilding(19,12,9,8,16,1);makeResidentialBuilding(-4,24,10,7,12,0);makeResidentialBuilding(9,23,8,7,13,2);
  // Warm ground-level restaurants and entrance lights.
  for(const [x,z] of [[-18,-7],[-7,-16],[7,-16],[19,-7],[-20,16],[19,17]]){box(world,5,2.6,.3,mat('#292a2c'),x,1.3,z);for(let i=-1;i<=1;i++){box(world,.85,1.5,.08,M.warm,x+i*1.35,1.3,z-.2);addLight(world,0xffb06a,.3,5,x+i*1.35,1.3,z-.4);}}
  // Benches, bollards and concrete landscape steps.
  for(const [x,z] of [[-12,-8],[12,-8],[-12,8],[12,8]]){box(world,2.4,.18,.65,mat('#313437'),x,.65,z);box(world,.12,.65,.14,mat('#565b5d'),x-1,.33,z);box(world,.12,.65,.14,mat('#565b5d'),x+1,.33,z);addCollider(x,z,2.4,.7);}
  for(let x=-12;x<=12;x+=3){cylinder(world,.055,.08,.8,mat('#292c30'),x,.4,11,8);sphere(world,.09,M.warm,x,.84,11);addLight(world,0xffac66,.18,3,x,.9,11);}
  // Cracked alien structures subtly intrude into the architecture.
  for(let i=0;i<10;i++){const spire=box(world,rand(.3,.65),rand(3,7),rand(.3,.6),mat('#2e3939',.5,.25,{emissive:'#153c39',emissiveIntensity:.45}),rand(-13,13),rand(1.5,3.5),rand(-12,4));spire.rotation.z=rand(-.18,.18);}
  // Chest in the middle of the square, locked until the wave is done.
  const chest=new THREE.Group();chest.position.set(0,0,-16);world.add(chest);box(chest,1.8,.95,1.25,mat('#332a26',.5,.35),0,.55,0);box(chest,1.85,.17,1.3,M.gold,0,1.04,0);box(chest,.22,.35,.16,mat('#c9ae67',.3,.6),0,.64,.7);sphere(chest,.12,M.glowGreen,0,.67,.81,.7,1,.35);chest.visible=false;
  addInteract(chest,'ОТКРЫТЬ ЯЩИК ПАНДОРЫ',()=>{if(flightScore<flightGoal){showToast('ЗАМОК НЕ ОТКРЫВАЕТСЯ. ОПАСНОСТЬ ЕЩЁ РЯДОМ.');return;}if(!inventory.keys){inventory.keys=true;if(ufo)ufo.visible=true;showToast('ВНУТРИ — КЛЮЧИ ОТ ЛЕТАЮЩЕЙ ТАРЕЛКИ');setObjective('Добраться до тарелки и активировать её.');chest.rotation.x=-.28;chest.children[1].rotation.x=-.35;chest.children[1].position.y=1.36;addLight(chest,0xbaff8b,2.4,7,0,1.6,0);}else showToast('ЯЩИК ПУСТ.');},2.6,'chest');
  const ship=createUFO();ship.position.set(0,.25,-25);ship.scale.setScalar(1.25);world.add(ship);ship.visible=true;ufo=ship;
  const shipTrigger=box(world,.3,.3,.3,mat('#000000',1,0,{transparent:true,opacity:0}),0,1,-25);shipTrigger.visible=true;
  addInteract(shipTrigger,'СЕСТЬ В ЛЕТАЮЩУЮ ТАРЕЛКУ',()=>{if(!inventory.keys){showToast('ТАРЕЛКА ЗАПЕРТА. НУЖНЫ КЛЮЧИ.');return;}transitionTo(startFlight);},3.4,'ship');
  // Hostile wave; first emerge from the pools and building gaps.
  waveSpawned=false;spawnGardenWave();
  player.set(0,1.65,16);yaw=0;pitch=0;setCameraFPS();setChapter('ГЛАВА 02 / САДОВЫЕ КВАРТАЛЫ','САДОВЫЕ КВАРТАЛЫ');setObjective('Отбиться от пришельцев.');
  selectedSlot=2;updateSlots();$('flight-hud').classList.add('hidden');$('shift-prompt').classList.add('hidden');
}
function spawnGardenWave(){const spots=[[-10,-1],[9,2],[-15,-12],[14,-13],[-3,-5],[6,9],[18,3],[-19,4]];spots.forEach((p,i)=>{const e=createAlien(v3(p[0],0,p[1]),true,false);e.scale.setScalar(rand(.88,1.15));world.add(e);enemies.push({mesh:e,hp:3,speed:rand(1.05,1.6),attack:0,phase:rand(0,5)});});waveSpawned=true;}

// -------------------- FLIGHT / FINAL INTERIOR --------------------
function createFlightEnemy(){const root=createAlien(v3(rand(-14,14),rand(3,10),rand(-24,-12)),true,false);root.scale.setScalar(.6);world.add(root);return {mesh:root,hp:2,speed:rand(2.2,3.1),attack:0};}
function startFlight(){clearWorld();flightPulseMeshes=[];fireHeld=false;fireHeldRMB=false;fireCooldown=0;setPhase('flight');baseScene('#13191e','#151c22',.003);scene.background.set('#141a22');scene.add(new THREE.HemisphereLight(0x9eb8c5,0x111419,.8));
  // The city falls away beneath the ship: aerial rooftops, windows and haze.
  plane(world,140,140,mat('#20262a'),0,-3,0);
  for(let i=0;i<55;i++){let x=rand(-65,65),z=rand(-65,65),w=rand(4,11),d=rand(4,11),h=rand(5,23);const b=box(world,w,h,d,mat(i%3===0?'#4b4b4b':'#343a40'),x,h/2-3,z);for(let yy=1;yy<h;yy+=2.5){for(let xx=-w/2+1;xx<w/2-1;xx+=2){if(Math.random()>.3){const win=box(world,.6,.7,.04,M.warm,x+xx,yy-2,z-d/2-.03);}}}}
  ufo=createUFO();ufo.position.set(0,8,4);ufo.scale.setScalar(1.25);world.add(ufo);
  for(let i=0;i<7;i++)flightEnemies.push(createFlightEnemy());
  flightScore=0;flightTime=0;boostUntil=0;player.set(0,1.65,0);camera.position.set(0,14,20);camera.lookAt(0,8,0);yaw=0;pitch=0;
  $('flight-hud').classList.remove('hidden');$('shift-prompt').classList.add('hidden');setChapter('ГЛАВА 03 / ВОЗДУШНЫЙ КОРИДОР','НАД МОСКВОЙ');setObjective('Удержаться в воздухе и уничтожить 5 преследователей.');
  $('hud').classList.remove('hidden');
}
function createCockpit(){cockpitDialogueStarted=false;clearWorld();setPhase('cockpit');baseScene('#101216','#090b0e',.012);scene.add(new THREE.AmbientLight(0x78828b,.25));
  const hull=mat('#34393b',.42,.55), inner=mat('#171c20',.8,.2), glass=mat('#66858a',.15,.3,{transparent:true,opacity:.22}), panel=mat('#24292d',.4,.4);
  // Compact circular cabin shell and front viewport.
  cylinder(world,6,6.5,13,hull,0,0,0,48).rotation.x=Math.PI/2;
  const floor=box(world,10,.35,13,inner,0,-1.1,0);box(world,10,.35,13,inner,0,4.7,0);
  for(let side of [-1,1]){box(world,.45,5.6,13,hull,side*5,1.75,0);for(let z=-5;z<=5;z+=2.5){box(world,.35,.3,.5,panel,side*4.7,2,z);}}
  // Forward window shows the church dome through the mist.
  box(world,8.5,4.6,.2,glass,0,1.9,-6.15);box(world,8.9,.25,.3,hull,0,4.25,-6.2);box(world,8.9,.25,.3,hull,0,-.4,-6.2);box(world,.25,4.8,.3,hull,-4.35,1.9,-6.2);box(world,.25,4.8,.3,hull,4.35,1.9,-6.2);
  // Distant glowing cathedral silhouette.
  const distant=buildCathedral(world,0,-25,.35);distant.position.y=-2.5;
  for(let x=-3;x<=3;x+=1.5){box(world,1,.35,1,panel,x,-.65,-3.8);sphere(world,.08,x===0?M.glowRed:M.glowGreen,x,-.42,-3.8);}
  const chair=box(world,2.3,2.3,2.5,mat('#292a2b'),0,0,1.2);box(world,2.6,.3,1.1,hull,0,1,2.2);
  friendAlien=createAlien(v3(0,0,4.1),false,false);friendAlien.scale.setScalar(.95);friendAlien.rotation.y=Math.PI;world.add(friendAlien);const sidearm=new THREE.Group();box(sidearm,.16,.18,.48,mat('#1c2427',.32,.6),0,0,0);box(sidearm,.09,.08,.22,mat('#758783',.28,.5),0,.12,-.08);sphere(sidearm,.055,M.glowRed,0,.02,-.27,.75,.75,1.4);sidearm.position.set(.88,.55,.22);sidearm.visible=false;friendAlien.add(sidearm);friendAlien.userData.sidearm=sidearm;
  camera.position.set(0,1.65,-1.7);yaw=0;pitch=0;camera.rotation.set(0,0,0,'YXZ');
  setChapter('ГЛАВА 04 / ВОЗВРАЩЕНИЕ','НАД ХРАМОМ');setObjective('Обернуться.');$('flight-hud').classList.add('hidden');$('shift-prompt').classList.add('hidden');
  sceneTime=0;
}
function startFinalDialogue(){beginDialogue('ВЫ',['Откуда ты?'],()=>{beginDialogue('СУЩЕСТВО',[
  'Из прошлого.',
  'Ты думал, что я остался в церкви? Я остался в той версии, которую ты помнишь.',
  'А теперь попробуй вспомнить, кто из нас первым открыл дверь.'
],()=>{showToast('ОН ПОДНИМАЕТ ОРУЖИЕ. СЕЙЧАС.');if(friendAlien?.userData.sidearm)friendAlien.userData.sidearm.visible=true;if(friendAlien?.userData.rightArm)friendAlien.userData.rightArm.rotation.z=-1.15;setTimeout(()=>{beginDialogue('СУЩЕСТВО',['Ты всё равно не успеешь.'],()=>{setObjective('Опередить его. Нажать E.');});},600);});});}
function endCycle(){if(phase!=='cockpit')return;$('dialogue').classList.add('hidden');showToast('СИНХРОНИЗАЦИЯ НАРУШЕНА',900);const flash=$('damage-flash');flash.style.opacity='.9';setTimeout(()=>{flash.style.opacity='0';$('hud').classList.add('hidden');$('ending-screen').classList.remove('hidden');if(document.pointerLockElement)document.exitPointerLock();phase='ending';paused=false;let cycles=1;try{cycles=Number(localStorage.getItem('krovotkinskaya_cycles')||0)+1;localStorage.setItem('krovotkinskaya_cycles',String(cycles));}catch{}$('ending-code').textContent=`CYCLE ${String(cycles).padStart(3,'0')} · TERMINATED / RESTARTING`;},350);}

// -------------------- INPUT / INTERACTION --------------------
function interact(){if(!$('dialogue').classList.contains('hidden')){advanceDialogue();return;}if(!currentInteract){return;}const item=currentInteract;if(item.mesh.visible===false&&item.kind!=='portal')return;item.action();}
function findInteraction(){let best=null,bestD=Infinity;for(const it of interactables){if(!it.mesh.visible)continue;const p=it.mesh.getWorldPosition(v3());const d=p.distanceTo(camera.position);if(d<it.range&&d<bestD){best=it;bestD=d;}}currentInteract=best;$('interact-prompt').classList.toggle('hidden',!best||phase==='intro'||phase==='flight'||phase==='cockpit');if(best){$('interact-label').textContent=best.name;} }
function tryResurrectionInteraction(){if(phase==='basement'&&deadAlien){const d=deadAlien.position.distanceTo(player);if(d<3){performRitual();return true;}}return false;}
function shootEnergy(){if(phase==='flight'){fireFlightShot();return;}if(phase!=='garden')return;if(!inventory.carbine)return;const dir=camera.getWorldDirection(v3());const start=camera.position.clone().add(dir.clone().multiplyScalar(.7));const bolt=sphere(world,.12,M.glowGreen,start.x,start.y,start.z,.8,.8,1.8);bolt.userData.velocity=dir.multiplyScalar(31);bolt.userData.life=2.3;bolt.userData.kind='player';projectiles.push(bolt);playSfx('shoot');if(muzzleFlash)muzzleFlash.intensity=8;setTimeout(()=>{if(muzzleFlash)muzzleFlash.intensity=.0;},65);}
function fireFlightShot(){if(phase!=='flight')return;const dir=new THREE.Vector3().subVectors(flightAimPoint(),ufo.position).normalize();const bolt=sphere(world,.16,M.glowRed,ufo.position.x,ufo.position.y,ufo.position.z,.8,.8,1.6);bolt.userData.velocity=dir.multiplyScalar(43);bolt.userData.life=2.1;flightShots.push(bolt);playSfx('shoot');}
function flightAimPoint(){const e=flightEnemies.filter(e=>e.mesh.visible).sort((a,b)=>a.mesh.position.distanceTo(ufo.position)-b.mesh.position.distanceTo(ufo.position))[0];return e?e.mesh.position.clone():ufo.position.clone().add(v3(0,0,-20));}
function createWeaponView(){if(weaponRig)camera.remove(weaponRig);weaponRig=new THREE.Group();const body=box(weaponRig,.16,.17,.65,mat('#22282a',.38,.55),.1,-.06,-.3);const top=box(weaponRig,.12,.07,.42,mat('#59615c',.35,.5),.1,.06,-.32);cylinder(weaponRig,.035,.05,.32,mat('#111619',.4,.7),.1,-.05,-.72,12).rotation.x=Math.PI/2;const core=sphere(weaponRig,.055,M.glowGreen,.1,-.03,-.49,.8,.8,1.6);muzzleFlash=new THREE.PointLight(0x8bff9c,0,4);muzzleFlash.position.set(.1,-.04,-.8);weaponRig.add(muzzleFlash);camera.add(weaponRig);if(!lighterGlow){lighterGlow=new THREE.PointLight(0xffb86c,0,5,2);camera.add(lighterGlow);lighterGlow.position.set(0,-.12,-.18);}}
function updateGarden(dt){movePlayer(dt);setCameraFPS();if(weaponRig)weaponRig.visible=true;if(lighterGlow)lighterGlow.intensity=0;fireCooldown=Math.max(0,fireCooldown-dt);if(fireHeld&&fireCooldown<=0){shootEnergy();fireCooldown=.12;}
  // Enemy pressure is paced rather than instant: a warning tells the player when a creature closes in.
  for(const e of enemies){if(!e.mesh.visible)continue;e.attack=Math.max(0,e.attack-dt);const target=v3(player.x,0,player.z);const delta=target.sub(e.mesh.position);const dist=delta.length();if(dist>1.25){delta.normalize();e.mesh.position.addScaledVector(delta,e.speed*dt);e.mesh.rotation.y=Math.atan2(delta.x,delta.z);}else if(e.attack<=0){e.attack=1.15;playerDamageCooldown=Math.max(playerDamageCooldown,0);if(playerDamageCooldown<=0){health=Math.max(0,health-9);updateHealth();$('damage-flash').style.opacity='.6';setTimeout(()=>$('damage-flash').style.opacity='0',130);playSfx('hit');playerDamageCooldown=.65;}}
    e.mesh.position.y=Math.sin(sceneTime*3+e.phase)*.08;}
  playerDamageCooldown=Math.max(0,playerDamageCooldown-dt);
  for(let i=projectiles.length-1;i>=0;i--){const b=projectiles[i];b.position.addScaledVector(b.userData.velocity,dt);b.userData.life-=dt;let hit=false;for(const e of enemies){if(!e.mesh.visible)continue;if(e.mesh.position.clone().add(v3(0,1.3,0)).distanceTo(b.position)<1.1){e.hp--;hit=true;spawnImpact(b.position.clone(),0x9dff9e);if(e.hp<=0){e.mesh.visible=false;flightScore++;showToast('ЦЕЛЬ УСТРАНЕНА',700);playSfx('enemyDown');}break;}}if(hit||b.userData.life<=0){world.remove(b);projectiles.splice(i,1);}}
  const left=enemies.filter(e=>e.mesh.visible).length;
  if(left===0&&flightScore<flightGoal){flightScore=flightGoal;}
  if(flightScore>=flightGoal){if(ufo)ufo.visible=true;const chest=interactables.find(i=>i.kind==='chest');if(chest)chest.mesh.visible=true;setObjective('Найти ящик Пандоры.');}
  if(health<=0){health=100;updateHealth();buildGarden();showToast('СИСТЕМА ВОССТАНОВЛЕНА. ПОПРОБУЙ ЕЩЁ РАЗ.');}
}
function spawnImpact(pos,color){for(let i=0;i<5;i++){const p=sphere(world,.045,mat(color,.25,0,{emissive:color,emissiveIntensity:1.5}),pos.x,pos.y,pos.z);p.userData.life=rand(.15,.35);p.userData.velocity=v3(rand(-2,2),rand(-.2,2),rand(-2,2));particles.push(p);}}

// -------------------- FLIGHT UPDATE --------------------
function performUltraStrike(){if(phase!=='flight'||performance.now()<boostUntil)return;boostUntil=performance.now()+4200;ufo.userData.boost=1.1;const ring=torus(world,1.1,.14,mat('#9effc2',.2,.15,{emissive:'#5cff9b',emissiveIntensity:2,transparent:true,opacity:.9}),ufo.position.x,ufo.position.y,ufo.position.z,Math.PI/2,0,0);ring.userData.pulseLife=.75;flightPulseMeshes.push(ring);for(const e of flightEnemies){if(e.mesh.visible&&e.mesh.position.distanceTo(ufo.position)<10){e.mesh.visible=false;flightScore++;spawnImpact(e.mesh.position.clone(),0xa4ffbc);}}playSfx('boost');showToast('УЛЬТРАУДАР',900);}
function updateFlight(dt){flightTime+=dt;fireCooldown=Math.max(0,fireCooldown-dt);if(fireHeldRMB&&fireCooldown<=0){fireFlightShot();fireCooldown=.16;}if(weaponRig)weaponRig.visible=false;if(lighterGlow)lighterGlow.intensity=0;
  // Steering uses keys; the ship is a visible third-person vehicle with inertial easing.
  if(ufo.userData.boost>0)ufo.userData.boost=Math.max(0,ufo.userData.boost-dt);
  for(let i=flightPulseMeshes.length-1;i>=0;i--){const ring=flightPulseMeshes[i];ring.userData.pulseLife-=dt;const k=1+(0.75-ring.userData.pulseLife)*7;ring.scale.setScalar(k);ring.material.opacity=Math.max(0,ring.userData.pulseLife);if(ring.userData.pulseLife<=0){world.remove(ring);flightPulseMeshes.splice(i,1);}}
  const move=v3((keys.KeyD?1:0)-(keys.KeyA?1:0),(keys.Space?1:0)-(keys.ControlLeft?1:0),(keys.KeyS?1:0)-(keys.KeyW?1:0));if(move.lengthSq()>0)move.normalize();const speed=ufo.userData.boost>0?22:12;ufo.position.addScaledVector(move,speed*dt);ufo.position.x=clamp(ufo.position.x,-25,25);ufo.position.y=clamp(ufo.position.y,3,23);ufo.position.z=clamp(ufo.position.z,-26,24);
  ufo.rotation.z=THREE.MathUtils.damp(ufo.rotation.z,-move.x*.28,4,dt);ufo.rotation.x=THREE.MathUtils.damp(ufo.rotation.x,move.z*.25,4,dt);
  const desired=camera.position.clone().lerp(v3(ufo.position.x,ufo.position.y+6,ufo.position.z+13),1-Math.pow(.001,dt));camera.position.copy(desired);camera.lookAt(ufo.position);
  for(const e of flightEnemies){if(!e.mesh.visible)continue;const d=new THREE.Vector3().subVectors(ufo.position,e.mesh.position);if(d.length()>1){d.normalize();e.mesh.position.addScaledVector(d,e.speed*dt);}e.mesh.position.y+=Math.sin(flightTime*2+e.mesh.position.x)*dt*.5;e.mesh.lookAt(ufo.position);}
  for(let i=flightShots.length-1;i>=0;i--){const b=flightShots[i];b.position.addScaledVector(b.userData.velocity,dt);b.userData.life-=dt;let hit=false;for(const e of flightEnemies){if(e.mesh.visible&&e.mesh.position.distanceTo(b.position)<1.25){e.hp--;hit=true;spawnImpact(b.position.clone(),0xff9275);if(e.hp<=0){e.mesh.visible=false;flightScore++;playSfx('enemyDown');$('flight-score').textContent=`${Math.min(flightScore,flightGoal)} / ${flightGoal}`;}break;}}if(hit||b.userData.life<=0){world.remove(b);flightShots.splice(i,1);}}
  $('flight-heading').textContent=`N ${String(Math.round((ufo.rotation.y*180/Math.PI+360)%360)).padStart(3,'0')}°`;$('flight-boost').textContent=performance.now()<boostUntil?'УЛЬТРА / КД':'F / УДАР ГОТОВ';$('flight-score').textContent=`${Math.min(flightScore,flightGoal)} / ${flightGoal}`;
  // Replenish targets until five have been cleared.
  const active=flightEnemies.filter(e=>e.mesh.visible).length;if(active<4&&flightScore<flightGoal&&Math.random()<dt*.7)flightEnemies.push(createFlightEnemy());
  if(flightScore>=flightGoal){$('shift-prompt').classList.remove('hidden');setObjective('Нажать SHIFT, чтобы пройти сквозь пространство.');}
}

// -------------------- AUDIO --------------------
function initAudio(){if(audioCtx)return;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audioCtx=new AC();masterGain=audioCtx.createGain();masterGain.gain.value=Number($('volume-slider').value)/100;masterGain.connect(audioCtx.destination);ambience=audioCtx.createGain();ambience.gain.value=.12;ambience.connect(masterGain);for(let i=0;i<3;i++){const osc=audioCtx.createOscillator();const gain=audioCtx.createGain();osc.type=i===1?'triangle':'sine';osc.frequency.value=[48,73,96][i];gain.gain.value=[.32,.12,.055][i];osc.connect(gain);gain.connect(ambience);osc.start();ambienceOsc.push({osc,gain});}}
function playSfx(type){if(!audioCtx||!masterGain)return;if(audioCtx.state==='suspended')audioCtx.resume();const now=audioCtx.currentTime;const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.connect(gain);gain.connect(masterGain);if(type==='shoot'){osc.type='sawtooth';osc.frequency.setValueAtTime(250,now);osc.frequency.exponentialRampToValueAtTime(70,now+.12);gain.gain.setValueAtTime(.12,now);gain.gain.exponentialRampToValueAtTime(.001,now+.16);osc.start(now);osc.stop(now+.17);}else if(type==='hit'){osc.type='triangle';osc.frequency.setValueAtTime(90,now);osc.frequency.exponentialRampToValueAtTime(35,now+.2);gain.gain.setValueAtTime(.18,now);gain.gain.exponentialRampToValueAtTime(.001,now+.22);osc.start(now);osc.stop(now+.23);}else if(type==='boost'){osc.type='sawtooth';osc.frequency.setValueAtTime(100,now);osc.frequency.exponentialRampToValueAtTime(680,now+.32);gain.gain.setValueAtTime(.14,now);gain.gain.exponentialRampToValueAtTime(.001,now+.38);osc.start(now);osc.stop(now+.4);}else{osc.type='sine';osc.frequency.setValueAtTime(180,now);osc.frequency.exponentialRampToValueAtTime(550,now+.16);gain.gain.setValueAtTime(.1,now);gain.gain.exponentialRampToValueAtTime(.001,now+.22);osc.start(now);osc.stop(now+.23);}}

// -------------------- UI / STATE --------------------
function openPause(){if(paused||phase==='intro'||phase==='ending')return;paused=true;fireHeld=false;fireHeldRMB=false;if(ambience)ambience.gain.value=0;pauseFrom=phase;$('pause-screen').classList.remove('hidden');if(document.pointerLockElement)document.exitPointerLock();}
function closePause(){paused=false;if(ambience)ambience.gain.value=.12;$('pause-screen').classList.add('hidden');if(phase!=='intro'&&phase!=='ending')canvas.requestPointerLock?.();}
function resetGame(){inventory={lighter:false,blood:false,water:false,portal:false,carbine:false,keys:false};health=100;updateHealth();flightScore=0;selectedSlot=1;cockpitDialogueStarted=false;bloodPoured=false;waterPoured=false;fireHeld=false;fireHeldRMB=false;introTime=0;paused=false;buildIntro();$('ending-screen').classList.add('hidden');$('pause-screen').classList.add('hidden');$('hud').classList.add('hidden');$('intro-copy').classList.add('hidden');}
function handleKeyDown(e){keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.repeat)return;
  if(e.code==='Escape'){if(paused)closePause();else openPause();return;}
  if(e.code==='KeyE'){if(phase==='cockpit'&&sceneTime>2.2&&$('dialogue').classList.contains('hidden')){endCycle();return;}if(phase==='basement'&&tryResurrectionInteraction())return;interact();return;}
  if(e.code==='Enter'&&!$('dialogue').classList.contains('hidden')){advanceDialogue();return;}
  if(e.code==='Digit1'){selectedSlot=1;updateSlots();}if(e.code==='Digit2'){selectedSlot=2;updateSlots();}if(e.code==='Digit3'){selectedSlot=3;updateSlots();}
  if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&phase==='flight'&&flightScore>=flightGoal){transitionTo(()=>{createCockpit();playSfx('boost');});return;}if(e.code==='KeyF'&&phase==='flight'){performUltraStrike();}
}
function handleKeyUp(e){keys[e.code]=false;}
function handleMouseMove(e){if(document.pointerLockElement!==canvas||paused)return;if(phase==='intro')return;if(phase==='flight'){ufo.rotation.y-=e.movementX*.0015;return;}const sens=.00215;yaw-=e.movementX*sens;pitch-=e.movementY*sens;pitch=clamp(pitch,-1.42,1.42);}
function handleMouseDown(e){if(phase==='intro'||phase==='ending')return;if(paused)return;if(e.button===0&&phase==='garden'){fireHeld=true;shootEnergy();fireCooldown=.12;}if(e.button===2){e.preventDefault();if(phase==='flight'){fireHeldRMB=true;fireFlightShot();fireCooldown=.16;}else if(phase==='church'&&inventory.portal){createPortalAt(v3(0,1.9,-12.1));showToast('ПОРТАЛ СТАБИЛИЗИРОВАН');}else if(phase==='garden')showToast('ПОРТАЛЬНОЕ УСТРОЙСТВО НЕ ОТВЕЧАЕТ');}}
window.addEventListener('mouseup',e=>{if(e.button===0)fireHeld=false;if(e.button===2)fireHeldRMB=false;});
canvas.addEventListener('mousedown',handleMouseDown);canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',handleKeyDown);window.addEventListener('keyup',handleKeyUp);window.addEventListener('mousemove',handleMouseMove);
$('start-button').addEventListener('click',()=>{initAudio();audioCtx?.resume();$('intro-copy').classList.add('hidden');buildChurch();createWeaponView();canvas.requestPointerLock?.();});
$('pause-button').addEventListener('click',openPause);$('resume-button').addEventListener('click',closePause);$('restart-button').addEventListener('click',()=>{resetGame();closePause();});$('loop-button').addEventListener('click',()=>{resetGame();});
$('volume-slider').addEventListener('input',e=>{const n=Number(e.target.value);$('volume-value').textContent=`${n}%`;if(masterGain)masterGain.gain.value=n/100;try{localStorage.setItem('krovotkinskaya_volume',String(n));}catch{}});
$('quality-select').addEventListener('change',e=>{quality=e.target.value;const ratios={high:1.7,medium:1.25,low:.9};renderer.setPixelRatio(Math.min(devicePixelRatio||1,ratios[quality]));renderer.shadowMap.enabled=quality!=='low';renderer.setSize(innerWidth,innerHeight);try{localStorage.setItem('krovotkinskaya_quality',quality);}catch{}});
$('inventory').addEventListener('click',e=>{const slot=e.target.closest('.slot');if(slot){selectedSlot=Number(slot.dataset.slot);updateSlots();}});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas&&!paused&&phase!=='intro'&&phase!=='ending'&&!$('pause-screen').classList.contains('hidden'))return;if(document.pointerLockElement!==canvas&&!paused&&phase!=='intro'&&phase!=='ending'){openPause();}});

// -------------------- FRAME LOOP --------------------
function updateParticles(dt){for(let i=particles.length-1;i>=0;i--){const p=particles[i];if(p.userData.life!==undefined){p.userData.life-=dt;if(p.userData.velocity)p.position.addScaledVector(p.userData.velocity,dt);p.material.opacity=p.userData.life>0?Math.min(1,p.userData.life*3):0;if(p.userData.life<=0){world.remove(p);particles.splice(i,1);}}else if(p.userData.fall){p.position.y-=p.userData.fall*dt;if(p.position.y<0)p.position.y=22;}else if(p.userData.dust){p.position.y+=Math.sin(sceneTime*1.4+p.position.x)*dt*.035;p.position.x+=Math.sin(sceneTime*.7+p.position.z)*dt*.02;}}}
function updateInteractions(){if(['church','basement','garden'].includes(phase)&&!paused){findInteraction();}else{$('interact-prompt').classList.add('hidden');}}
function updateIntro(dt){introTime+=dt;sceneTime+=dt;camera.position.x=THREE.MathUtils.damp(camera.position.x,1.8,0.14,dt);camera.position.y=THREE.MathUtils.damp(camera.position.y,5.1,0.14,dt);camera.lookAt(-5,8,-6);const saucer=world.children.find(o=>o.userData.intro);if(saucer){saucer.position.x=12-introTime*.42;saucer.position.y=18+Math.sin(introTime*1.2)*.3;if(introTime>2.8&&introTime<3.2&&!saucer.userData.struck){saucer.userData.struck=true;createLightning();}if(introTime>5){saucer.position.y=17;}}
  if(introTime>7.2&&$('intro-copy').classList.contains('hidden')){$('intro-copy').classList.remove('hidden');}
}
function update(dt){sceneTime+=dt;if(lighterGlow)lighterGlow.intensity=(inventory.lighter&&selectedSlot===1&&(phase==='church'||phase==='basement'))?.7:0;if(weaponRig)weaponRig.visible=(phase==='garden'&&inventory.carbine);if(phase==='intro'){updateIntro(dt);updateParticles(dt);return;}if(paused)return;
  if(phase==='church'||phase==='basement'){movePlayer(dt);setCameraFPS();if(weaponRig)weaponRig.visible=false;if(candleLight)candleLight.intensity=.75+Math.sin(sceneTime*8)*.12;if(candleFlame)candleFlame.scale.y=1.6+Math.sin(sceneTime*13)*.14;}
  if(phase==='garden')updateGarden(dt);
  if(phase==='flight')updateFlight(dt);
  if(phase==='cockpit'){
    if(sceneTime<3.2){yaw=THREE.MathUtils.damp(yaw,Math.PI,1.25,dt);camera.rotation.set(pitch,yaw,0,'YXZ');}
    if(sceneTime>3.2&&!cockpitDialogueStarted){cockpitDialogueStarted=true;startFinalDialogue();}
  }
  if(toastTimer>0){toastTimer-=dt*1000;if(toastTimer<=0)$('toast').classList.remove('visible');}
  updateParticles(dt);updateInteractions();
}
let cockpitDialogueStarted=false;
const introClock=new THREE.Clock();
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.04);update(dt);renderer.render(scene,camera);}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,quality==='low'?.9:quality==='medium'?1.25:1.7));});

// Initial boot.
try{const savedVolume=Number(localStorage.getItem('krovotkinskaya_volume')??65);$('volume-slider').value=String(clamp(savedVolume,0,100));$('volume-value').textContent=`${clamp(savedVolume,0,100)}%`;quality=localStorage.getItem('krovotkinskaya_quality')||'high';if(!['high','medium','low'].includes(quality))quality='high';$('quality-select').value=quality;const ratios={high:1.7,medium:1.25,low:.9};renderer.setPixelRatio(Math.min(devicePixelRatio||1,ratios[quality]));renderer.shadowMap.enabled=quality!=='low';}catch{}
buildIntro();$('loading-cover').classList.add('done');setTimeout(()=>$('loading-cover').remove(),850);animate();
