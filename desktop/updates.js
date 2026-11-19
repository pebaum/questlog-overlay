import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';

const repo = 'pebaum/questlog-overlay';
const endpoint = `https://api.github.com/repos/${repo}/releases/latest`;
const stable = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
const maxInstaller = 512 * 1024 * 1024, signatureSize = 384;
const installerName = version => `Questlog-Setup-${version}.exe`;
export function publisherKey() {
  return createPublicKey({ format: 'jwk', key: JSON.parse(readFileSync(new URL('./update-key.json', import.meta.url), 'utf8')) });
}

function options(signal, accept) {
  return { headers: { Accept: accept, 'Accept-Encoding': 'identity' }, credentials: 'omit', cache: 'no-store', redirect: 'manual', signal };
}

async function consume(response, limit, sink, exact = false) {
  let total = 0;
  const header = response.headers.get('content-length');
  if (!response.body || (header !== null && (!/^\d+$/.test(header) || Number(header) > limit || (exact && Number(header) !== limit)))) {
    await response.body?.cancel();
    throw new Error('Unexpected update file size.');
  }
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > limit) throw new Error('Update exceeds its size limit.');
    await sink(chunk, total);
  }
  if (!total || (exact && total !== limit)) throw new Error('Update download is incomplete.');
}

export async function checkForUpdate(installed, request = fetch, signal = AbortSignal.timeout(12_000)) {
  const response = await request(endpoint, options(signal, 'application/vnd.github+json'));
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new Error(`Could not check GitHub releases (HTTP ${response.status}).`);
  }
  const chunks = [];
  await consume(response, 512 * 1024, bytes => chunks.push(bytes));
  const release = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const version = typeof release?.tag_name === 'string' ? release.tag_name.slice(1) : '';
  if (release?.draft !== false || release.prerelease !== false || !stable.test(installed) ||
      !stable.test(version) || release.tag_name !== `v${version}`) throw new Error('Unrecognized release information.');
  const current = installed.split('.').map(Number), latest = version.split('.').map(Number);
  const diff = latest.findIndex((part, i) => part !== current[i]);
  if (diff === -1 || latest[diff] < current[diff]) return null;

  const name = installerName(version);
  function asset(filename, max, exact) {
    const url = `https://github.com/${repo}/releases/download/v${version}/${filename}`;
    const matches = Array.isArray(release.assets) && release.assets.filter(a => a?.name === filename);
    const a = matches?.[0];
    if (matches.length !== 1 || a.state !== 'uploaded' || a.browser_download_url !== url ||
        !Number.isSafeInteger(a.size) || a.size < 1 || a.size > max || (exact && a.size !== max)) {
      throw new Error(`The signed Windows release for ${version} is incomplete.`);
    }
    return { url, size: a.size };
  }
  return { version, name, installer: asset(name, maxInstaller), signature: asset(`${name}.sig`, signatureSize, true) };
}

async function fetchAsset(url, request, signal) {
  // Only a URL reconstructed from the stable tag reaches here. GitHub redirects it to its asset CDN.
  for (let hop = 0; hop <= 3; hop++) {
    const response = await request(url, options(signal, 'application/octet-stream'));
    if (response.status === 200) return response;
    await response.body?.cancel();
    if (![301, 302, 303, 307, 308].includes(response.status)) throw new Error(`Update download failed (HTTP ${response.status}).`);
    const location = response.headers.get('location');
    const next = location && new URL(location, url);
    if (!next || next.protocol !== 'https:' || next.port || next.username || next.password ||
        !['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(next.hostname)) {
      throw new Error('Unexpected update download redirect.');
    }
    url = next.href;
  }
  throw new Error('Too many update download redirects.');
}

export function verifyDigest(release, hash, signature, key) {
  if (release.name !== installerName(release.version) || !stable.test(release.version) || !/^[0-9a-f]{64}$/.test(hash) ||
      !verify('sha256', Buffer.from(`Questlog Windows update v1\n${release.version}\n${release.name}\n${hash}\n`, 'ascii'), key, signature)) {
    throw new Error('The installer did not pass publisher verification.');
  }
}

export async function downloadSigned(release, directory, request, signal, progress, key) {
  const sig = [];
  await consume(await fetchAsset(release.signature.url, request, signal), signatureSize, chunk => sig.push(chunk), true);
  const signature = Buffer.concat(sig);
  const file = path.join(directory, release.name);
  const handle = await open(file, 'wx', 0o600);
  try {
    const hash = createHash('sha256');
    let last = 0;
    await consume(await fetchAsset(release.installer.url, request, signal), release.installer.size, async (chunk, total) => {
      await handle.writeFile(chunk);
      hash.update(chunk);
      const percent = Math.floor(total / release.installer.size * 100);
      if (percent !== last) { last = percent; progress(percent); }
    }, true);
    verifyDigest(release, hash.digest('hex'), signature, key);
    await handle.sync();
  } finally { await handle.close(); }
  return { file, signature };
}
