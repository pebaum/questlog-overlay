import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkForUpdate, verifyDigest } from '../desktop/updates.js';
import { windowsUpdater } from '../desktop/update-manager.js';
import { cleanStaleStages } from '../desktop/update-staging.js';
import { launchInstaller, withLockedInstaller } from '../desktop/windows-handoff.js';

// Disposable signing identity and inert bytes; never load the release private key or run an installer.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
const bytes = Buffer.from('not an executable'), digest = data => createHash('sha256').update(data).digest('hex');
const version = '0.12.0', name = `Questlog-Setup-${version}.exe`;
const asset = (file, size) => ({ name: file, size, state: 'uploaded',
  browser_download_url: `https://github.com/pebaum/questlog-overlay/releases/download/v${version}/${file}` });
const release = { tag_name: `v${version}`, draft: false, prerelease: false, assets: [asset(name, bytes.length), asset(`${name}.sig`, 384)] };
const signature = sign('sha256', Buffer.from(`Questlog Windows update v1\n${version}\n${name}\n${digest(bytes)}\n`), privateKey);
const reply = body => async () => Response.json(body);

async function scratch(t) {
  const dir = path.join(process.cwd(), `.questlog-update-test-${randomUUID()}`);
  await mkdir(dir);
  t.after(() => rm(dir, { recursive: true, force: true, maxRetries: 3 }));
  return dir;
}

async function fixture(t, overrides = {}) {
  const data = await scratch(t), calls = [], events = [], handoff = [];
  const resources = new Map([
    ['https://api.github.com/repos/pebaum/questlog-overlay/releases/latest', () => Response.json(release)],
    [release.assets[0].browser_download_url, () => new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/fixture' } })],
    [release.assets[1].browser_download_url, () => new Response(signature)],
    ['https://release-assets.githubusercontent.com/fixture', () => new Response(bytes)]
  ]);
  const manager = windowsUpdater({ data, installed: '0.9.4', key: publicKey,
    changed: update => events.push(update),
    request: async (url, opts) => {
      assert.equal(opts.redirect, 'manual'); assert.equal(opts.credentials, 'omit');
      calls.push(url); return resources.get(url)();
    },
    confirmRestart: async () => { handoff.push('confirm'); return true; },
    prepareRestart: () => handoff.push('save'), launch: async () => handoff.push('spawn'), quit: () => handoff.push('quit'),
    withLock: async (file, size, callback) => {
      handoff.push('lock');
      const actual = await readFile(file); assert.equal(actual.length, size);
      return callback(digest(actual));
    }, ...overrides
  });
  return { data, calls, events, handoff, manager, resources, root: path.join(data, 'update-cache') };
}

test('only newer stable versions with exact matching installer and signature assets are offered', async () => {
  const offer = await checkForUpdate('0.9.4', reply(release));
  assert.equal(offer.installer.url, release.assets[0].browser_download_url);
  for (const installed of [version, '0.12.1', '1.0.0']) assert.equal(await checkForUpdate(installed, reply(release)), null);
  for (const changes of [{ draft: true }, { prerelease: true }, { tag_name: 'v1.0.1-beta.1' }, { assets: [] },
    { assets: [release.assets[0]] }, { assets: release.assets.concat(release.assets[1]) },
    { assets: [{ ...release.assets[0], size: 2 ** 30 }, release.assets[1]] },
    { assets: [release.assets[0], { ...release.assets[1], browser_download_url: 'https://example.com/file.sig' }] }]) {
    await assert.rejects(checkForUpdate('0.9.4', reply({ ...release, ...changes })));
  }
  for (const status of [403, 404, 429]) await assert.rejects(checkForUpdate('0.9.4', async () => new Response(null, { status })));
});

test('signature binds the publisher to the exact version, artifact name and SHA-256', () => {
  verifyDigest({ version, name }, digest(bytes), signature, publicKey);
  const wrongKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey;
  for (const args of [
    [{ version: '0.12.1', name: 'Questlog-Setup-0.12.1.exe' }, digest(bytes), signature, publicKey],
    [{ version, name: 'other.exe' }, digest(bytes), signature, publicKey],
    [{ version, name }, digest(bytes), signature, wrongKey],
    [{ version, name }, digest(Buffer.alloc(bytes.length)), signature, publicKey]
  ]) assert.throws(() => verifyDigest(...args), /publisher/);
});

test('startup checks metadata only; download, confirm, flush, launch and quit require distinct actions', async t => {
  const { manager, handoff, events, calls } = await fixture(t);
  manager.start();
  while (manager.busy) await new Promise(resolve => setImmediate(resolve));
  assert.equal(manager.state.status, 'available'); assert.equal(calls.length, 1);
  await Promise.all([manager.action(), manager.action()]);
  assert.equal(manager.state.status, 'ready'); assert.deepEqual(handoff, []);
  assert.deepEqual(events.filter(e => e.status === 'downloading').map(e => e.progress), [0, 100]);
  await Promise.all([manager.action(), manager.action()]);
  await manager.action(); manager.stop();
  assert.deepEqual(handoff, ['confirm', 'lock', 'save', 'spawn', 'quit']);
  assert.equal(manager.committed, true);
});

test('Later cancels; tampering after download forces re-download and never launches', async t => {
  let confirmed = false;
  const { manager, handoff, root } = await fixture(t, { confirmRestart: () => confirmed });
  await manager.check(); await manager.action(); await manager.action();
  assert.equal(manager.state.status, 'ready'); assert.deepEqual(handoff, []);
  const [dir] = await readdir(root);
  await writeFile(path.join(root, dir, name), Buffer.alloc(bytes.length));
  confirmed = true;
  await manager.action();
  assert.equal(manager.state.status, 'error'); assert.match(manager.state.message, /publisher/);
  assert.deepEqual(handoff, ['lock']); assert.deepEqual(await readdir(root), []);
  await manager.action(); assert.equal(manager.state.status, 'ready');
});

test('reject bad signature, truncated/oversize stream and off-origin redirect; no partial file survives', async t => {
  const { manager, handoff, root, calls, resources } = await fixture(t);
  const src = release.assets[0].browser_download_url, sig = release.assets[1].browser_download_url;
  const goodSig = resources.get(sig);
  await manager.check();
  for (const [url, make, message] of [
    [sig, () => new Response(Buffer.alloc(384)), /publisher/],
    [src, () => new Response(bytes.subarray(1)), /incomplete/],
    [src, () => new Response(Buffer.alloc(bytes.length + 1)), /size limit/],
    [src, () => new Response(null, { status: 302, headers: { location: 'https://example.org/other' } }), /redirect/]
  ]) {
    resources.set(url, make);
    await manager.action();
    assert.equal(manager.state.status, 'error'); assert.match(manager.state.message, message);
    assert.deepEqual(await readdir(root), []); assert.deepEqual(handoff, []);
    resources.set(sig, goodSig);
  }
  assert(!calls.includes('https://example.org/other'));
});

test('failed save or spawn is retryable without quitting, and re-verifies on each retry', async t => {
  let saves = 0, spawns = 0;
  const { manager, handoff } = await fixture(t, {
    prepareRestart: () => { if (!saves++) throw new Error('disk full'); },
    launch: async () => { if (!spawns++) throw new Error('launch denied'); }
  });
  await manager.check(); await manager.action(); await manager.action();
  assert.equal(spawns, 0); assert.match(manager.state.message, /disk full/);
  await manager.action(); assert.match(manager.state.message, /launch denied/);
  assert(!manager.committed); assert(!handoff.includes('quit'));
  await manager.action(); assert(manager.committed);
  assert.deepEqual(handoff, ['confirm', 'lock', 'confirm', 'lock', 'confirm', 'lock', 'quit']);
});

test('offline background check is quiet; manual check errors and recovers on retry', async t => {
  let online = false;
  const { manager, events } = await fixture(t, { request: async () => online ? Response.json(release) : Promise.reject(Error('offline')) });
  await manager.check(); assert.deepEqual(events, []); assert.equal(manager.state.status, 'idle');
  await manager.check(true); assert.equal(manager.state.status, 'error'); assert.match(manager.state.message, /offline/);
  online = true; await manager.action(); assert.equal(manager.state.status, 'available');
});

test('later startup sweeps only updater-owned paths, not neighboring files', async t => {
  const { root, manager } = await fixture(t);
  await manager.check(); await manager.action();
  await writeFile(path.join(root, 'keep'), 'unrelated');
  await cleanStaleStages(root);
  assert.deepEqual(await readdir(root), ['keep']);
});

test('Windows final verifier denies replacement and writes through handoff, then releases the handle',
  { skip: process.platform !== 'win32' }, async t => {
    const dir = await scratch(t), file = path.join(dir, "inert $' 測試.bin");
    await writeFile(file, bytes);
    await withLockedInstaller(file, bytes.length, async hash => {
      assert.equal(hash, digest(bytes));
      await assert.rejects(writeFile(file, 'changed'));
      await assert.rejects(rename(file, `${file}.moved`));
    });
    await assert.rejects(withLockedInstaller(file, bytes.length + 1, () => assert.fail('invalid size')));
    await writeFile(file, 'unlocked');
  });

test('NSIS handoff uses a direct non-shell launch and only acknowledges OS spawn success', async () => {
  const file = path.join('private stage', name);
  const child = new EventEmitter();
  let detached = false;
  child.unref = () => { detached = true; };
  const launch = () => launchInstaller(file, (exe, args, options) => {
    assert.equal(exe, file); assert.deepEqual(args, ['/S', '--updated', '--force-run']);
    assert.equal(options.shell, false); assert.equal(options.detached, true);
    return child;
  });
  const failure = launch();
  child.emit('error', Error('AV blocked startup')); await assert.rejects(failure, /could not start/);
  assert.equal(detached, false);
  const success = launch();
  child.emit('spawn'); await success;
  assert(detached);
});
