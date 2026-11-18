import assert from 'node:assert/strict';
import test from 'node:test';
import { checkForUpdate } from '../desktop/updates.js';

const name = 'Questlog-Setup-0.12.0.exe';
const url = `https://github.com/pebaum/questlog-overlay/releases/download/v0.12.0/${name}`;
const release = { tag_name: 'v0.12.0', draft: false, prerelease: false,
  assets: [{ name, state: 'uploaded', size: 100, browser_download_url: url }] };
const reply = body => async () => Response.json(body);

test('offer the matching published Windows installer only for an upgrade', async () => {
  assert.deepEqual(await checkForUpdate('0.9.4', reply(release)), { version: '0.12.0', url });
  for (const installed of ['0.12.0', '0.12.1', '1.0.0']) assert.equal(await checkForUpdate(installed, reply(release)), null);
});

test('reject incomplete, prerelease, or off-repository installer links', async () => {
  for (const changes of [{ draft: true }, { prerelease: true }, { tag_name: 'v1.0.1-beta.1' }, { assets: [] },
    { assets: [{ ...release.assets[0], browser_download_url: 'https://example.com/setup.exe' }] }]) {
    await assert.rejects(checkForUpdate('0.11.0', reply({ ...release, ...changes })));
  }
});

test('a failed or rate-limited check is not reported as up to date', async () => {
  for (const status of [403, 404, 429]) {
    await assert.rejects(checkForUpdate('0.12.0', async () => new Response(null, { status })));
  }
});
