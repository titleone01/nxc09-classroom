import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.mjs';
import modelAsset from './model-data.js';

const cacheName = 'chint-nxc09-model-v1';
const isGLB = bytes => bytes.length >= 4 && bytes[0] === 103 && bytes[1] === 108 && bytes[2] === 84 && bytes[3] === 70;
export const loadMetrics = { source: '', bytes: 0, attempts: 0, started: 0, decodedAt: 0 };

async function download(url, expectedBytes, onProgress) {
  const controller = new AbortController();
  let timer;
  const keepAlive = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(), 45000); };
  keepAlive();
  try {
    loadMetrics.attempts++;
    const response = await fetch(url, { signal: controller.signal, credentials: 'same-origin' });
    if (!response.ok) throw new Error(`模型下载失败（${response.status}）`);
    let loaded = 0, total = expectedBytes;
    const chunks = [];
    const report = () => onProgress(`下载 ${(loaded / 1000000).toFixed(2)} / ${(total / 1000000).toFixed(2)} MB · ${Math.min(100, Math.floor(loaded / total * 100))}%`);
    report();
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        keepAlive();
        if (!loaded && isGLB(value)) total = modelAsset.decodedBytes;
        loaded += value.byteLength;
        if (loaded > modelAsset.decodedBytes) throw new Error('模型下载数据异常');
        chunks.push(value); report();
      }
    } else {
      const data = new Uint8Array(await response.arrayBuffer());
      loaded = data.byteLength; chunks.push(data); report();
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    if (loaded !== (isGLB(bytes) ? modelAsset.decodedBytes : expectedBytes)) throw new Error('模型文件不完整，请重新载入');
    loadMetrics.bytes = loaded;
    return bytes;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('下载连续 45 秒没有收到数据，请检查网络后重试');
    if (error instanceof TypeError && error.message === 'Failed to fetch') throw new Error('模型下载连接中断，请检查网络后重试');
    throw error;
  } finally { clearTimeout(timer); }
}

async function decode(bytes) {
  if (isGLB(bytes)) return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (typeof DecompressionStream === 'undefined') throw new Error('浏览器不支持 gzip 解压');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  if (buffer.byteLength !== modelAsset.decodedBytes || !isGLB(new Uint8Array(buffer))) throw new Error('模型解压校验失败');
  return buffer;
}

export async function loadFactoryModel(onProgress) {
  loadMetrics.started = performance.now(); loadMetrics.attempts = 0; loadMetrics.bytes = 0;
  const compressed = typeof DecompressionStream !== 'undefined';
  const url = new URL(`./assets/${compressed ? modelAsset.compressed : modelAsset.fallback}`, import.meta.url).href;
  const expectedBytes = compressed ? modelAsset.compressedBytes : modelAsset.decodedBytes;
  let cache;
  try { if ('caches' in window) cache = await caches.open(cacheName); } catch { /* Cache is optional, including in a textbook iframe. */ }
  const parse = async bytes => {
    onProgress('解析原厂模型…');
    const buffer = await decode(bytes);
    await MeshoptDecoder.ready;
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, new URL('./assets/', import.meta.url).href);
    loadMetrics.decodedAt = performance.now();
    return gltf;
  };
  try {
    const cached = await cache?.match(url);
    if (cached) {
      onProgress('读取已下载的模型…'); loadMetrics.source = 'model-cache';
      return await parse(new Uint8Array(await cached.arrayBuffer()));
    }
  } catch { try { await cache?.delete(url); } catch { /* Fall back to network. */ } }
  loadMetrics.source = 'network';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt) onProgress('连接中断，正在重试…');
      const bytes = await download(url, expectedBytes, onProgress);
      const gltf = await parse(bytes);
      try { await cache?.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } })); } catch { /* A storage quota never prevents viewing. */ }
      return gltf;
    } catch (error) { if (attempt) throw error; }
  }
}
