import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { typefaces } from '../shared/typefaces.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFile(path.join(root, name), 'utf8');
async function bundleFonts() {
  return Promise.all(Object.entries(typefaces).filter(([, face]) => face.subset).map(async ([id, { name, subset }]) => {
    const dir = path.join(root, 'node_modules', '@fontsource', id);
    const [data, license] = await Promise.all([
      readFile(path.join(dir, 'files', `${id}-${subset}-400-normal.woff2`)), readFile(path.join(dir, 'LICENSE'), 'utf8')
    ]);
    const notice = `${name}\n${license}`;
    const css = `/*! ${notice.replaceAll('*/', '* /')} */\n@font-face{font-family:"${name}";font-weight:400;font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${data.toString('base64')}) format("woff2")}`;
    return { css, notice };
  }));
}
const [template, css, atlas, matrix, fonts, js] = await Promise.all([
  read('renderer/index.html'), read('renderer/style.css'), read('assets/atlas.svg'), read('assets/ps1-matrix.svg'),
  bundleFonts(),
  build({ entryPoints: [path.join(root, 'renderer/app.js')], bundle: true, minify: true, write: false, metafile: true, target: 'es2022', format: 'iife' })
]);
const modules = new Set(Object.keys(js.metafile.inputs).flatMap(name => {
  const pkg = name.match(/(?:^|\/)node_modules\/([^/]+)\//)?.[1];
  return pkg ? [pkg] : [];
}));
const notices = (await Promise.all([...modules].sort().map(async pkg => {
  const file = pkg === 'uc.micro' ? 'LICENSE.txt' : 'LICENSE';
  return `${pkg}\n${await read(`node_modules/${pkg}/${file}`)}`;
}))).join('\n\n');
const html = template.replace('../assets/ps1-matrix.svg', `data:image/svg+xml;base64,${Buffer.from(matrix).toString('base64')}`)
  .replace('/* __STYLES__ */', () => `/*! ${notices.replaceAll('*/', '* /')} */\n${fonts.map(f => f.css).join('\n')}\n${css}`).replace('__ATLAS__', () => atlas)
  .replace('/* __APPLICATION__ */', () => js.outputFiles[0].text).replace(/\r\n/g, '\n');
const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(([, script]) => `'sha256-${createHash('sha256').update(script).digest('base64')}'`);
const policy = `default-src 'none'; script-src ${hashes.join(' ')}; style-src 'unsafe-inline'; img-src 'self' data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'`;
await mkdir(path.join(root, 'app'), { recursive: true });
await Promise.all([
  writeFile(path.join(root, 'app/index.html'), html.replace('__POLICY__', policy)),
  writeFile(path.join(root, 'app/EDITOR-LICENSES.txt'), notices),
  writeFile(path.join(root, 'app/FONT-LICENSES.txt'), fonts.map(f => f.notice).join('\n\n'))
]);
console.log('Built standalone journal: app/index.html');
