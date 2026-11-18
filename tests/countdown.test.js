import assert from 'node:assert/strict';
import test from 'node:test';
import { countdown, entryLabel, parseDuration, parseTimerEntry, remainingMs } from '../shared/countdown.js';
import { localStamp } from '../shared/local-time.js';

test('header clock uses the requested local format across noon and midnight', () => {
  assert.equal(localStamp(new Date(2026, 10, 18, 12, 45)), '12:45P - WED 11.18');
  assert.equal(localStamp(new Date(2026, 11, 31, 23, 59)), '11:59P - THU 12.31');
  assert.equal(localStamp(new Date(2027, 0, 1, 0, 5)), '12:05A - FRI 01.01');
});

test('clock inputs schedule the next local occurrence exactly and repeat as a clock target', t => {
  let time = new Date(2026, 10, 18, 12, 14, 17, 750).getTime(), saved;
  const create = () => {
    const timer = countdown({ initial: saved, now: () => time, persist: next => { saved = next; }, changed() {}, ring() {}, onError: e => { throw e; } });
    t.after(timer.dispose); return timer;
  };
  let timer = create();
  for (const [input, day, hour, minute] of [['1234p', 18, 12, 34], ['11a', 19, 11, 0], ['12:00 AM', 19, 0, 0], ['12p', 19, 12, 0], ['1.04P', 18, 13, 4], ['905a', 19, 9, 5]]) {
    timer.start(input);
    const end = new Date(2026, 10, day, hour, minute).getTime();
    assert.equal(timer.state.endAt, end, input);
    assert.equal(remainingMs(timer.state, time), end - time, input);
  }
  timer.start('1234p'); timer.dispose(); timer = create();
  assert.equal(timer.state.endAt, new Date(2026, 10, 18, 12, 34).getTime());
  time = timer.state.endAt; timer.check();
  assert.equal(entryLabel(timer.state), '12.34P');
  timer.start(entryLabel(timer.state));
  assert.equal(timer.state.endAt, new Date(2026, 10, 19, 12, 34).getTime());
  timer.stop(); assert.equal(entryLabel(timer.state), '12.34P');
  for (const bad of ['0a', '13p', '1260p', '12:75 am', '1:2p', '9999p', 'noonish']) assert.equal(parseTimerEntry(bad), null);
});

test('accept minutes or mm:ss and reject ambiguous or zero durations', () => {
  for (const [input, seconds] of [['5', 300], ['0:01', 1], ['25:00', 1500], ['1440:00', 86400]]) assert.equal(parseDuration(input), seconds);
  for (const input of ['', '0', '-1', '1:75', '1440:01', 'ten']) assert.equal(parseDuration(input), null);
});

test('Start replaces the deadline; the current deadline survives reload and sleep and rings once', t => {
  let time = 10_000, persisted, rings = 0;
  const start = () => {
    const timer = countdown({ initial: persisted, persist: s => { persisted = s; }, changed() {}, ring: () => { rings++; },
      now: () => time, onError: e => { throw e; } });
    t.after(timer.dispose);
    return timer;
  };
  let timer = start();
  timer.start(4); time += 3500;
  assert.throws(() => timer.start(0));
  assert.equal(remainingMs(timer.state, time), 500);
  timer.start(10); time += 1000; timer.check(); assert.equal(rings, 0);
  timer.dispose(); timer = start();
  assert.equal(remainingMs(timer.state, time), 9000);
  time += 3600_000; timer.check(); timer.check();
  assert.equal(timer.state.status, 'done'); assert.equal(rings, 1);
  timer.dispose(); timer = start(); timer.check();
  assert.equal(rings, 1);
  timer.start(15); assert.equal(remainingMs(timer.state, time), 15_000);
});

test('Stop cancels silently, persists the chosen duration and permits a fresh run', t => {
  let time = 10_000, persisted, rings = 0;
  const create = () => {
    const timer = countdown({ initial: persisted, persist: s => { persisted = s; }, changed() {}, ring: () => { rings++; },
      now: () => time, onError: e => { throw e; } });
    t.after(timer.dispose); return timer;
  };
  let timer = create();
  timer.start(10); time += 3500; timer.stop(); timer.dispose();
  timer = create(); time += 7000; timer.check();
  assert.deepEqual(timer.state, { version: 2, status: 'ready', duration: 10 });
  assert.equal(remainingMs(timer.state, time), 10_000); assert.equal(rings, 0);
  timer.start(10); time += 10_000; timer.check(); assert.equal(rings, 1);
});

test('an old hidden running timer keeps its deadline; an old paused timer is ready at its remaining time', t => {
  const restore = initial => {
    const timer = countdown({ initial, persist() {}, changed() {}, ring: () => assert.fail('Unexpected alert'), onError: e => { throw e; }, now: () => 10_000 });
    t.after(timer.dispose);
    return timer.state;
  };
  const old = { version: 1, duration: 60, open: false };
  assert.deepEqual(restore({ ...old, status: 'running', endAt: 31_000 }), { version: 2, duration: 60, status: 'running', endAt: 31_000 });
  assert.deepEqual(restore({ ...old, status: 'paused', leftMs: 21_600 }), { version: 2, duration: 22, status: 'ready' });
  assert.throws(() => restore({ ...old, status: 'paused', leftMs: -500 }), /Unrecognized/);
});
