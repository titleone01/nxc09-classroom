import * as THREE from 'three';
import layout from './explosion-data.js';

const matches = (name, prefixes = []) => prefixes.some(prefix => name.startsWith(prefix));
const ancestorMatches = (object, prefixes) => {
  for (let node = object.parent; node; node = node.parent) if (matches(node.name, prefixes)) return true;
  return false;
};
const fraction = (progress, shell) => shell ? Math.min(1, progress / .35) : Math.max(0, (progress - .2) / .8);

// Translate the original component nodes only. Geometry and factory parents are
// retained; each pose is calculated from saved rest positions, without drift.
export function bindExplosion(model) {
  model.updateMatrixWorld(true);
  const parts = [];
  const byName = new Map();
  model.traverse(object => {
    const name = object.userData.factory_component;
    if (!name) return;
    if (byName.has(name)) throw new Error(`原厂零件标识重复：${name}`);
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const rule = layout.rules.find(r => matches(name, r.parts) || ancestorMatches(object, r.ancestors)) || layout.fallback;
    const offset = new THREE.Vector3(...rule.offset);
    offset.add(center.clone().multiply(new THREE.Vector3(...(rule.spread || [0, 0, 0]))));
    const inverse = object.parent.matrixWorld.clone().invert();
    const localOffset = offset.clone().applyMatrix4(inverse).sub(new THREE.Vector3().applyMatrix4(inverse));
    const part = { name, object, parent: object.parent, rest: object.position.clone(), box, center, offset, localOffset, shell: Boolean(rule.shell), amount: 0 };
    parts.push(part); byName.set(name, part);
  });
  if (parts.length !== 147) throw new Error(`原厂零件配置不匹配：应为 147 件，实际 ${parts.length} 件`);
  const groups = new Map(Object.entries(layout.groups).map(([id, definition]) => {
    const members = parts.filter(p => matches(p.name, definition.parts));
    const anchor = byName.get(definition.anchor);
    if (!members.length || !anchor) throw new Error(`内部部位配置缺失：${id}`);
    return [id, { ...definition, members, anchor }];
  }));
  function apply(progress) {
    for (const part of parts) {
      part.amount = fraction(progress, part.shell);
      part.object.position.copy(part.rest).addScaledVector(part.localOffset, part.amount);
    }
    model.updateMatrixWorld(true);
  }
  function partBox(part, progress) {
    const amount = progress === undefined ? part.amount : fraction(progress, part.shell);
    return part.box.clone().translate(part.offset.clone().multiplyScalar(amount));
  }
  function bounds(id, progress) {
    const box = new THREE.Box3();
    for (const part of (groups.get(id)?.members || parts)) box.union(partBox(part, progress));
    return box;
  }
  function anchorPoint(id) {
    const part = groups.get(id).anchor;
    return part.center.clone().addScaledVector(part.offset, part.amount);
  }
  function offset(name) {
    const part = byName.get(name);
    return part ? part.offset.clone().multiplyScalar(part.amount) : new THREE.Vector3();
  }
  function focus(id, isolate) {
    const group = groups.get(id);
    const selected = new Set(group?.members.map(p => p.name));
    for (const part of parts) part.object.visible = !isolate || !group || selected.has(part.name);
    return selected;
  }
  function snapshot() {
    return {
      parts: parts.length,
      movedParts: parts.filter(p => p.amount > 0).length,
      visibleParts: parts.filter(p => p.object.visible).length,
      maximumLateralDisplacementMm: Math.max(...parts.map(p => Math.hypot(p.offset.x * p.amount, p.offset.y * p.amount))),
      assemblyLayers: new Set(parts.map(p => p.offset.z)).size,
      screwsRemainWithAssemblies: parts.filter(p => p.name.startsWith('8ZTJ-950-003')).every(p => p.offset.equals(new THREE.Vector3(0,0,35))) && parts.filter(p => p.name.startsWith('8950003_ZHZW_NEW')).every(p => p.offset.equals(new THREE.Vector3(0,0,-12))),
      groups: Object.fromEntries([...groups].map(([id, g]) => [id, g.members.length])),
      maximumRestError: Math.max(...parts.map(p => p.object.position.distanceTo(p.rest))),
      parentsPreserved: parts.every(p => p.object.parent === p.parent),
      maximumPoseErrorMm: Math.max(...parts.map(p => {
        const expected = partBox(p), actual = new THREE.Box3().setFromObject(p.object);
        return Math.max(actual.min.distanceTo(expected.min), actual.max.distanceTo(expected.max));
      })),
    };
  }
  return { apply, bounds, groups, anchorPoint, offset, partBox, focus, snapshot };
}
