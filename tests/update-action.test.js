import assert from 'node:assert/strict';
import test from 'node:test';
import { bindUpdateAction } from '../renderer/update-action.js';

test('the header offers download and restart as separate actions, never automatic ones', async () => {
  const button = { hidden: true, querySelector: () => ({ setAttribute() {} }), setAttribute() {} };
  let notify, actions = 0;
  bindUpdateAction(button, { watchUpdate: cb => { notify = cb; }, updateAction: async () => { actions++; } }, assert.fail);
  notify({ status: 'idle' });
  assert.ok(button.hidden);
  notify({ status: 'available', version: '1.2.3' });
  assert.equal(button.hidden, false);
  assert.match(button.title, /Download Questlog 1\.2\.3/);
  await button.onclick();
  notify({ status: 'downloading', version: '1.2.3', progress: 50 });
  assert.ok(button.disabled);
  notify({ status: 'ready', version: '1.2.3' });
  assert.equal(button.disabled, false);
  assert.match(button.title, /Restart & update/);
  assert.equal(actions, 1);
  await button.onclick();
  assert.equal(actions, 2);
  notify({ status: 'idle' });
  assert.ok(button.hidden);
});
