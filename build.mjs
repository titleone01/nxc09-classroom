import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
for (const name of ['calibration', 'model', 'explosion']) {
  const data = JSON.parse(await readFile(path.join(root, `assets/${name}.json`), 'utf8'));
  await writeFile(path.join(root, `${name}-data.js`), `export default ${JSON.stringify(data)};\n`);
}
const result = await build({
  absWorkingDir: root, entryPoints: ['app.js'], bundle: true, minify: true,
  format: 'esm', target: ['es2020'], write: false, legalComments: 'eof',
  plugins: [{ name: 'vendored-three', setup(builder) {
    builder.onResolve({ filter: /^three$/ }, () => ({ path: path.join(root, 'vendor/three.module.js') }));
    builder.onResolve({ filter: /^three\/addons\// }, args => ({ path: path.join(root, 'vendor/addons', args.path.slice('three/addons/'.length)) }));
  } }],
});
const bytes = result.outputFiles[0].contents;
const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
const filename = `app-${hash}.js`;
await writeFile(path.join(root, filename), bytes);
const html = await readFile(path.join(root, 'index.html'), 'utf8');
if (!/src="\.\/app(?:-[a-f0-9]+)?\.js"/.test(html)) throw new Error('HTML application entry missing');
await writeFile(path.join(root, 'index.html'), html.replace(/src="\.\/app(?:-[a-f0-9]+)?\.js"/, `src="./${filename}"`));
console.log(JSON.stringify({ bundle: filename, bytes: bytes.length }));
