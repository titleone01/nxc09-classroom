import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { acceleratedRaycast, computeBoundsTree } from './vendor/three-mesh-bvh.js';
import { loadFactoryModel, loadMetrics } from './model-loader.js';
import calibration from './calibration-data.js';
import explosionLayout from './explosion-data.js';
import { bindExplosion } from './explosion.js';
import { overview, topics, internalOverview, internalTopics } from './lesson.js';

const $ = id => document.getElementById(id);
const stage = $('viewer');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = { loaded: false, loading: false, topic: 'overview', mode: 'exterior', explosion: 0, explosionTarget: 0, isolate: true, labels: true, view: 'overview', meshInstances: 0, triangles: 0 };
const viewNames = { overview: '整体观察', front: '正面', back: '背面', left: '左侧', right: '右侧', free: '自由观察', focus: '部件放大' };
const directions = { overview: [.29,.17,1.9], front: [0,0,1], back: [0,0,-1], left: [-1,0,0], right: [1,0,0] };
let renderer, controls, model, bounds, cameraMotion, explosionMotion, explosion, floor, assemblyAxis, dirty = true, raycastMeshes = [], activeRaycastMeshes = [], markerGroup;
const identification = [];
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, .1, 3000);
const raycaster = new THREE.Raycaster(); raycaster.firstHitOnly = true;
THREE.Mesh.prototype.raycast = acceleratedRaycast;
const anchors = new Map();
const svgNS = 'http://www.w3.org/2000/svg';

function text(id, value) { $(id).textContent = value; }
function showTopic(id, moveCamera = true) {
  const internal = internalTopics.find(t => t.id === id);
  if (internal && state.mode !== 'internal') setMode('internal', false);
  const topic = internal || topics.find(t => t.id === id) || (state.mode === 'internal' ? internalOverview : overview);
  state.topic = topic.id || 'overview';
  text('lesson-tag', topic.tag || 'NXC-09 / 交流接触器');
  for (const key of ['title', 'subtitle', 'summary', 'terminals', 'behavior', 'note']) text(`lesson-${key}`, topic[key]);
  $('lesson-source').href = topic.source;
  $('lesson-source').textContent = topic.sourceLabel + ' ↗';
  document.querySelectorAll('[data-topic]').forEach(button => {
    const active = button.dataset.topic === state.topic;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  text('announcer', `当前说明：${topic.title}`);
  document.querySelectorAll('[data-step]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.step === id)));
  if (state.loaded && moveCamera) {
    if (internal) { setExplosion(1, true, false); focusPart(id); }
    else goView(state.topic === 'overview' ? 'overview' : 'front');
  }
  updatePartVisibility(); updateMarkers(); dirty = true;
}

for (const topic of [...topics, ...internalTopics]) {
  const internal = internalTopics.includes(topic);
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'topic-button'; button.dataset.topic = topic.id;
  button.dataset.mode = internal ? 'internal' : 'exterior'; button.hidden = internal;
  button.setAttribute('aria-pressed', 'false');
  button.innerHTML = `<span>${topic.number}</span><span><strong></strong><small></small></span>`;
  button.querySelector('strong').textContent = topic.title;
  button.querySelector('small').textContent = topic.tag;
  button.addEventListener('click', () => showTopic(topic.id));
  $('topic-list').append(button);
  const definition = internal ? explosionLayout.groups[topic.id] : calibration.anchors[topic.id];
  const anchor = { ...definition, internal, points: (definition.points || []).map(p => new THREE.Vector3(...p)), normal: definition.normal ? new THREE.Vector3(...definition.normal) : null };
  const hotspot = document.createElement('button');
  hotspot.type = 'button'; hotspot.className = 'hotspot'; hotspot.dataset.topic = topic.id; hotspot.hidden = true;
  hotspot.setAttribute('aria-label', `查看${topic.title}，${topic.tag}`);
  hotspot.setAttribute('aria-pressed', 'false');
  hotspot.innerHTML = `<span class="number">${topic.number}</span><span><strong></strong><small></small></span>`;
  hotspot.querySelector('strong').textContent = topic.short;
  hotspot.querySelector('small').textContent = topic.tag;
  hotspot.addEventListener('click', event => { event.stopPropagation(); showTopic(topic.id); });
  $('hotspots').append(hotspot);
  const line = document.createElementNS(svgNS, 'polyline');
  line.setAttribute('fill', 'none'); line.setAttribute('stroke-width', '1');
  const dot = document.createElementNS(svgNS, 'circle'); dot.setAttribute('r', '3');
  dot.setAttribute('fill', '#fff'); dot.setAttribute('stroke-width', '1.5');
  $('callout-lines').append(line, dot);
  anchors.set(topic.id, { ...anchor, hotspot, line, dot });
}
$('overview-button').addEventListener('click', () => showTopic('overview'));
$('toggle-labels').addEventListener('change', event => { state.labels = event.target.checked; dirty = true; });
$('isolate-part').addEventListener('change', event => { state.isolate = event.target.checked; updatePartVisibility(); dirty = true; });
$('reset-view').addEventListener('click', () => { state.labels = true; $('toggle-labels').checked = true; setMode('exterior'); });
$('explode-button').addEventListener('click', () => setMode(state.mode === 'internal' ? 'exterior' : 'internal'));
$('explosion-range').addEventListener('input', event => {
  const progress = Number(event.target.value) / 100;
  if (progress > 0 && state.mode !== 'internal') setMode('internal', false);
  setExplosion(progress, false);
  if (progress === 0) setMode('exterior', false);
});
document.querySelectorAll('[data-mode-tab]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.modeTab)));
document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => showTopic(button.dataset.step)));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => goView(button.dataset.view)));

function setMode(mode, animate = true) {
  state.mode = mode;
  document.querySelectorAll('[data-mode]').forEach(b => { b.hidden = b.dataset.mode !== mode; });
  document.querySelectorAll('[data-mode-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.modeTab === mode)));
  text('explode-button', mode === 'internal' ? '合拢模型' : '拆开观察');
  text('overview-button', mode === 'internal' ? '展开全貌 ↗' : '整机概览 ↗');
  $('explosion-note').hidden = mode !== 'internal';
  $('principle-guide').hidden = mode !== 'internal';
  showTopic('overview', false);
  if (state.loaded) setExplosion(mode === 'internal' ? 1 : 0, animate);
}
function applyExplosion(progress) {
  state.explosion = progress;
  explosion.apply(progress);
  for (const label of identification) label.mesh.position.copy(label.rest).add(explosion.offset(label.owner));
  if (floor) floor.visible = progress < .01;
  if (assemblyAxis) assemblyAxis.visible = progress > .1 && state.topic === 'overview';
  $('explosion-range').value = String(Math.round(progress * 100));
  text('explosion-value', `${Math.round(progress * 100)}%`);
  dirty = true;
}
function updatePartVisibility() {
  if (!explosion) return;
  const id = state.mode === 'internal' && explosion.groups.has(state.topic) ? state.topic : null;
  $('focus-options').hidden = !id;
  const selected = explosion.focus(id, state.isolate);
  for (const label of identification) label.mesh.visible = !id || !state.isolate || selected.has(label.owner);
  activeRaycastMeshes = raycastMeshes.filter(mesh => {
    for (let node = mesh; node; node = node.parent) if (!node.visible) return false;
    return true;
  });
}
function setExplosion(progress, animate, fit = true) {
  if (!explosion) return;
  state.explosionTarget = progress;
  if (animate && !reducedMotion) explosionMotion = { from: state.explosion, to: progress, started: performance.now(), duration: 950 };
  else { explosionMotion = null; applyExplosion(progress); }
  if (fit) goView('overview', !animate, explosion.bounds(null, progress));
}

function fittedDistance() {
  const height = bounds?.getSize(new THREE.Vector3()).y || 74;
  return height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.52 * Math.max(1, .9 / camera.aspect);
}
function fitBox(box, direction) {
  const center = box.getCenter(new THREE.Vector3());
  const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  let x = 0, y = 0, z = 0;
  for (const a of [box.min.x, box.max.x]) for (const b of [box.min.y, box.max.y]) for (const c of [box.min.z, box.max.z]) {
    const p = new THREE.Vector3(a,b,c).sub(center);
    x = Math.max(x, Math.abs(p.dot(right))); y = Math.max(y, Math.abs(p.dot(up))); z = Math.max(z, p.dot(direction));
  }
  const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return Math.max(65, (Math.max(y / tangent, x / (tangent * camera.aspect)) + z) * 1.18);
}
function moveCamera(target, direction, distance, instant) {
  const position = target.clone().addScaledVector(direction, distance);
  cameraMotion = { from: camera.position.clone(), fromTarget: controls.target.clone(), position, target, started: performance.now(), duration: instant || reducedMotion ? 0 : 550 };
  controls.enabled = true; dirty = true;
}
function focusPart(id) {
  const box = explosion.bounds(id, 1);
  const direction = new THREE.Vector3(.95,.35,1.4).normalize();
  state.view = 'focus'; text('view-name', viewNames.focus);
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', 'false'));
  moveCamera(box.getCenter(new THREE.Vector3()), direction, fitBox(box, direction), false);
}
function goView(view, instant = false, box = null) {
  if (!controls) return;
  state.view = view;
  const direction = new THREE.Vector3(...(view === 'overview' && state.explosionTarget > 0 ? [1.45,.45,1.55] : directions[view] || directions.overview)).normalize();
  if (!box && state.explosionTarget > 0) box = explosion.bounds(null, state.explosionTarget);
  const target = box && state.explosionTarget > 0 ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3();
  const distance = box && state.explosionTarget > 0 ? fitBox(box, direction) : fittedDistance();
  moveCamera(target, direction, distance, instant);
  text('view-name', viewNames[view]);
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
  dirty = true;
}

function makeSurfaceText(label, x, y, z, width, height, owner, background = null) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (background) { ctx.fillStyle = background; ctx.fillRect(0,0,512,128); }
  ctx.fillStyle = '#ecf3ff'; ctx.font = '600 76px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 66, 480);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  mesh.position.set(x,y,z); mesh.renderOrder = 3;
  mesh.name = `teaching-identification-${label}`;
  scene.add(mesh);
  identification.push({ mesh, rest: mesh.position.clone(), owner });
}
function addIdentification() {
  // Identification overlays are separate from the unmodified factory geometry.
  makeSurfaceText('CHINT', -16, 3.5, 43.10, 8.8, 2.55, '8ZTD-024-819', '#198fc3');
  makeSurfaceText('NXC-09', -16, -.05, 43.10, 8.8, 1.8, '8ZTD-024-819');
  for (const [i,x] of [-15.9,-5.3,5.3].entries()) {
    makeSurfaceText(['1/L1','3/L2','5/L3'][i],x,14.5,37.6,7.6,1.85,'8ZTD-315-1156');
    makeSurfaceText(['2/T1','4/T2','6/T3'][i],x,-25.5,37.6,7.6,1.85,'8ZTD-315-1157');
  }
  makeSurfaceText('13NO',15.9,14.4,37.6,6.6,1.55,'8ZTD-315-1156');
  makeSurfaceText('14NO',15.9,-24.7,37.6,6.6,1.55,'8ZTD-315-1157');
  makeSurfaceText('21NC',15.9,33.2,37.6,6.6,1.5,'8ZTD-315-1156');
  makeSurfaceText('22NC',15.9,-33.3,37.6,6.6,1.5,'8ZTD-315-1157');
}

function setupScene() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
  renderer.domElement.setAttribute('aria-label', '正泰 NXC-09 原厂三维模型，拖动旋转，滚轮或双指缩放');
  renderer.domElement.tabIndex = 0;
  stage.prepend(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .11;
  controls.enablePan = false; controls.minDistance = 45; controls.maxDistance = 1700;
  controls.addEventListener('change', () => { dirty = true; });
  controls.addEventListener('start', () => {
    cameraMotion = null; state.view = 'free'; text('view-name', viewNames.free);
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', 'false'));
  });
  scene.add(new THREE.HemisphereLight('#ffffff', '#899cac', 2.8));
  for (const [color,power,pos] of [['#ffffff',3.1,[100,150,190]],['#e1eeff',2,[-110,15,70]],['#dae6f2',1.6,[80,60,-100]]]) {
    const light = new THREE.DirectionalLight(color,power); light.position.set(...pos); scene.add(light);
  }
  const shadow = document.createElement('canvas'); shadow.width = shadow.height = 128;
  const ctx = shadow.getContext('2d'); const gradient = ctx.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'rgba(32,61,88,.20)'); gradient.addColorStop(1,'rgba(32,61,88,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0,0,128,128);
  floor = new THREE.Mesh(new THREE.PlaneGeometry(135,120), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadow), transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI/2; floor.position.y = -37.8; scene.add(floor);
  markerGroup = new THREE.Group(); scene.add(markerGroup);
  new ResizeObserver(resize).observe(stage);
  resize();
  requestAnimationFrame(frame);
}
function resize() {
  if (!renderer) return;
  const previous = camera.aspect;
  camera.aspect = stage.clientWidth / stage.clientHeight; camera.updateProjectionMatrix();
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  if (state.loaded && Math.abs(previous - camera.aspect) > .001) {
    if (state.view === 'focus' && explosion.groups.has(state.topic)) focusPart(state.topic);
    else goView(state.view === 'free' ? 'overview' : state.view, true);
  }
  dirty = true;
}
function pointVisible(point, normal, tolerance) {
  const direction = camera.position.clone().sub(point);
  if (normal && direction.clone().normalize().dot(normal) < .08) return false;
  const distance = direction.length();
  raycaster.set(camera.position, direction.negate().normalize()); raycaster.far = distance + 1;
  const hit = raycaster.intersectObjects(activeRaycastMeshes, false)[0]; raycaster.far = Infinity;
  return !hit || hit.distance >= distance - tolerance;
}
function updateMarkers() {
  if (!markerGroup) return;
  while (markerGroup.children.length) {
    const child = markerGroup.children[0]; markerGroup.remove(child); child.geometry.dispose(); child.material.dispose();
  }
  const anchor = anchors.get(state.topic);
  if (!anchor) return;
  if (anchor.internal && explosion) {
    for (const part of explosion.groups.get(state.topic).members) {
      const helper = new THREE.Box3Helper(explosion.partBox(part).expandByScalar(.7), '#258ddd');
      helper.userData.part = part; helper.material.depthTest = false;
      helper.renderOrder = 20; markerGroup.add(helper);
    }
    return;
  }
  for (const point of anchor.points) {
    const curve = new THREE.EllipseCurve(0,0,anchor.radius,anchor.radius,0,2*Math.PI,false,0);
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48).map(p => new THREE.Vector3(p.x,p.y,0)));
    const line = new THREE.LineLoop(geometry,new THREE.LineBasicMaterial({ color:'#2b93e8', transparent:true, opacity:.98, depthTest:false }));
    line.position.copy(point); line.position.z += .4; line.renderOrder = 20;
    markerGroup.add(line);
  }
}
function updateHotspots() {
  const width = stage.clientWidth, height = stage.clientHeight;
  const compact = width < 450;
  $('callout-lines').setAttribute('viewBox',`0 0 ${width} ${height}`);
  for (const [id, anchor] of anchors) {
    if (anchor.internal && explosion) {
      anchor.points = [explosion.anchorPoint(id)];
      anchor.occlusionTolerance = explosion.groups.get(id).anchor.box.getSize(new THREE.Vector3()).length() / 2 + 1;
    }
    const focused = state.isolate && state.mode === 'internal' && explosion?.groups.has(state.topic);
    const enabled = anchor.internal ? state.mode === 'internal' && state.explosion > .55 && (!focused || id === state.topic) : state.mode === 'exterior' && state.explosion < .01;
    const visiblePoints = enabled ? anchor.points.filter(p => anchor.internal || pointVisible(p,anchor.normal,anchor.occlusionTolerance)) : [];
    const point = visiblePoints[0];
    const projected = point?.clone().project(camera);
    const visible = state.labels && Boolean(projected && projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .99 && Math.abs(projected.y) < .94);
    anchor.hotspot.hidden = !visible;
    anchor.line.style.display = anchor.dot.style.display = visible ? '' : 'none';
    if (!visible) continue;
    const labelWidth = anchor.hotspot.offsetWidth;
    const x = anchor.side === 'left' ? (compact ? 9 : 18) : width - labelWidth - (compact ? 9 : 18);
    const y = Math.max(28,Math.min(height-40,anchor.row*height));
    anchor.hotspot.style.left = `${x}px`; anchor.hotspot.style.top = `${y}px`;
    const px = (projected.x+1)*width/2, py = (1-projected.y)*height/2;
    const sx = anchor.side === 'left' ? x + labelWidth : x;
    const bend = anchor.side === 'left' ? sx + (compact ? 5 : 14) : sx - (compact ? 5 : 14);
    anchor.line.setAttribute('points',`${sx},${y} ${bend},${y} ${px},${py}`);
    const color = state.topic === id ? '#3c89cd' : '#a2b6c7';
    anchor.line.setAttribute('stroke',color); anchor.dot.setAttribute('stroke',color);
    anchor.line.setAttribute('stroke-dasharray',anchor.internal && !pointVisible(point,anchor.normal,anchor.occlusionTolerance) ? '3 3' : '');
    anchor.dot.setAttribute('cx',px); anchor.dot.setAttribute('cy',py);
  }
  const selected = anchors.get(state.topic);
  markerGroup.children.forEach((line,index) => {
    if (line.userData.part) {
      line.box.copy(explosion.partBox(line.userData.part)).expandByScalar(.7);
      line.visible = state.labels && state.explosion > .55;
    } else line.visible = Boolean(state.labels && state.mode === 'exterior' && state.explosion < .01 && selected && pointVisible(selected.points[index],selected.normal,selected.occlusionTolerance));
  });
}
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  if (explosionMotion) {
    const t = Math.min(1, (now - explosionMotion.started) / explosionMotion.duration);
    applyExplosion(THREE.MathUtils.lerp(explosionMotion.from, explosionMotion.to, t*t*(3-2*t)));
    if (t === 1) explosionMotion = null;
  }
  if (cameraMotion) {
    const t = cameraMotion.duration ? Math.min(1,(now-cameraMotion.started)/cameraMotion.duration) : 1;
    const eased = t*t*(3-2*t);
    camera.position.lerpVectors(cameraMotion.from,cameraMotion.position,eased);
    controls.target.lerpVectors(cameraMotion.fromTarget,cameraMotion.target,eased);
    dirty = true;
    if (t === 1) cameraMotion = null;
  }
  controls.update();
  if (!dirty) return;
  camera.updateMatrixWorld(true);
  if (state.loaded) updateHotspots();
  renderer.render(scene,camera); dirty = false;
}
async function loadModel() {
  if (state.loading) return;
  state.loading = true; $('viewer-error').hidden = true; $('loading').hidden = false;
  text('loading-text','载入正泰原厂模型…');
  try {
    if (!renderer) setupScene();
    const gltf = await loadFactoryModel(message => text('loading-text',message));
    model = gltf.scene; model.scale.setScalar(1000); model.updateMatrixWorld(true);
    const geometries = new Set();
    raycastMeshes = []; state.triangles = 0; state.meshInstances = 0;
    model.traverse(object => {
      if (!object.isMesh) return;
      raycastMeshes.push(object); state.meshInstances++;
      state.triangles += (object.geometry.index?.count || object.geometry.attributes.position.count)/3;
      geometries.add(object.geometry);
    });
    text('loading-text','整理模型与部位标注…');
    let built = 0;
    for (const geometry of geometries) {
      if (!geometry.boundsTree) computeBoundsTree.call(geometry);
      if (++built % 8 === 0) await new Promise(requestAnimationFrame);
    }
    explosion = bindExplosion(model);
    scene.add(model); bounds = new THREE.Box3().setFromObject(model);
    const exploded = explosion.bounds(null, 1);
    assemblyAxis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,exploded.min.z-7),new THREE.Vector3(0,0,exploded.max.z+7)]),new THREE.LineDashedMaterial({color:'#95abba',dashSize:3,gapSize:2,transparent:true,opacity:.5}));
    assemblyAxis.computeLineDistances(); assemblyAxis.visible=false; scene.add(assemblyAxis);
    addIdentification(); state.loaded = true;
    goView('overview',true); updateMarkers();
    document.querySelectorAll('[data-view],#reset-view,#explode-button,#explosion-range,[data-mode-tab],[data-step]').forEach(button => { button.disabled = false; });
    setMode(state.mode, false);
    $('loading').hidden = true; text('model-status','原厂模型 · 已载入'); $('model-status').classList.add('is-ready');
    dirty = true;
  } catch (error) {
    console.error(error);
    $('loading').hidden = true; $('viewer-error').hidden = false;
    text('error-detail',error.message || '当前浏览器无法启用三维显示，请使用支持 WebGL 的浏览器重试。');
    text('model-status','模型加载未完成');
  } finally { state.loading = false; }
}
$('retry-model').addEventListener('click',loadModel);
document.addEventListener('visibilitychange', () => { dirty = true; });
window.__CONTACTOR__ = Object.freeze({ snapshot: () => ({ ...state, camera: camera.position.toArray(), target: controls?.target.toArray(), visibleHotspots: [...anchors].filter(([,a]) => !a.hotspot.hidden).map(([id]) => id), modelBounds: bounds?.getSize(new THREE.Vector3()).toArray(), explosionParts: explosion?.snapshot(), identificationError: explosion ? Math.max(...identification.map(l => l.mesh.position.distanceTo(l.rest.clone().add(explosion.offset(l.owner))))) : null, highlightCount: markerGroup?.children.length, visibleHighlights: markerGroup?.children.filter(l => l.visible).length, load: {...loadMetrics}, renderedFrames: renderer?.info.render.frame }) });
showTopic('overview',false);
loadModel();
