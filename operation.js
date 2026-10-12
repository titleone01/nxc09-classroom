import * as THREE from 'three';

// The factory components and parents remain intact. The 2 mm displacement is
// explicitly a teaching setting, not a measured working stroke.
export function bindOperation(model, explosion) {
  const nodes=[], moving=new Set(), springs=new Set(), coilMaterials=[];
  for(const id of ['armature','contacts','pressure'])for(const p of explosion.groups.get(id).members)moving.add(p.object);
  for(const p of explosion.groups.get('return').members)springs.add(p.object);
  model.traverse(o=>{
    if(!o.userData.factory_component)return;
    const inverse=o.parent.matrixWorld.clone().invert();
    const delta=new THREE.Vector3(0,0,-2).applyMatrix4(inverse).sub(new THREE.Vector3().applyMatrix4(inverse));
    const hidden=['8ZTD-024-819','8ZTD-315-1156','8ZTD-315-1157','8ZTD-261-102'].some(s=>o.userData.factory_component.startsWith(s));
    nodes.push({o,position:o.position.clone(),scale:o.scale.clone(),parent:o.parent,delta,hidden});
  });
  for(const p of explosion.groups.get('winding').members)p.object.traverse(o=>{
    if(!o.isMesh)return;
    const array=Array.isArray(o.material);const copies=(array?o.material:[o.material]).map(m=>m.clone());
    o.material=array?copies:copies[0];for(const m of copies)coilMaterials.push({m,emissive:m.emissive?.clone()});
  });
  let active=false,progress=0,target=0,phase='released',motion=null;
  function apply(){
    for(const r of nodes){
      r.o.position.copy(r.position);r.o.scale.copy(r.scale);r.o.visible=!active||!r.hidden;
      if(active&&moving.has(r.o))r.o.position.addScaledVector(r.delta,progress);
      if(active&&springs.has(r.o))r.o.scale.z=r.scale.z*(1-.12*progress);
    }
    for(const r of coilMaterials)if(r.emissive){r.m.emissive.copy(r.emissive);if(active)r.m.emissive.add(new THREE.Color(.25*progress,.05*progress,0));}
    model.updateMatrixWorld(true);
  }
  function start(){active=true;progress=0;target=0;phase='released';motion=null;apply();}
  function command(energize,reducedMotion){
    target=energize?1:0;phase=energize?'energizing':'releasing';
    if(reducedMotion){progress=target;phase=target?'energized':'released';motion=null;}else motion={from:progress,to:target,started:performance.now(),duration:850};
    apply();
  }
  function tick(now){
    if(!motion)return false;
    const t=Math.min(1,(now-motion.started)/motion.duration),s=t*t*(3-2*t);
    progress=THREE.MathUtils.lerp(motion.from,motion.to,s);
    if(t===1){phase=target?'energized':'released';motion=null;}
    apply();return true;
  }
  function stop(){active=false;progress=0;target=0;phase='released';motion=null;apply();}
  function snapshot(){return {active,phase,progress,coilEnergized:active&&target===1,mainClosed:active&&phase==='energized',noClosed:active&&phase==='energized',ncClosed:!(active&&phase==='energized'),teachingStrokeMM:2,movingParts:moving.size,parentsPreserved:nodes.every(r=>r.o.parent===r.parent),maximumRestError:Math.max(0,...nodes.map(r=>r.o.position.distanceTo(r.position)))};}
  return {start,command,tick,stop,apply,snapshot};
}
