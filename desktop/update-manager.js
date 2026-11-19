import path from 'node:path';
import { checkForUpdate, downloadSigned, publisherKey, verifyDigest } from './updates.js';
import { cleanStaleStages, newStage, removeStage } from './update-staging.js';
import { launchInstaller, withLockedInstaller } from './windows-handoff.js';

export function windowsUpdater({ data, installed, changed, activity = () => {}, confirmRestart, prepareRestart, quit, request = fetch,
  key = publisherKey(), withLock = withLockedInstaller, launch = launchInstaller }) {
  const root = path.join(data, 'update-cache');
  const stopping = new AbortController();
  const startupCleanup = cleanStaleStages(root).catch(() => {}); // Covered again by newStage before any write.
  let state = { status: 'idle' }, offer, stage, downloaded, busy = false, committed = false;
  let retry = 'check', cadence;

  function set(status, extra) {
    state = { status, ...(offer && { version: offer.version }), ...extra };
    if (!stopping.signal.aborted) changed(state);
  }
  async function discard() {
    const old = stage;
    stage = downloaded = undefined;
    if (old) await removeStage(root, old).catch(() => {}); // startup sweeps leftovers after Windows releases locks
  }
  function signal(ms) { return AbortSignal.any([stopping.signal, AbortSignal.timeout(ms)]); }

  async function check(manual = false) {
    if (busy || committed || stopping.signal.aborted || (!manual && !['idle', 'available'].includes(state.status))) return state;
    busy = true;
    activity();
    try {
      const next = await checkForUpdate(installed, request, signal(12_000));
      if (next?.version !== offer?.version || next?.installer.size !== offer?.installer.size) await discard();
      offer = next;
      if (downloaded && offer) set('ready');
      else if (offer) set('available');
      else set('idle', { message: 'Questlog is up to date.' });
    } catch (e) {
      if (manual) {
        retry = 'check';
        set('error', { message: `${e.message} Retry the check.` });
      }
    } finally { busy = false; activity(); }
    return state;
  }
  async function download() {
    retry = 'download';
    await discard();
    await startupCleanup;
    set('downloading', { progress: 0 });
    stage = await newStage(root);
    try {
      downloaded = await downloadSigned(offer, stage, request, signal(15 * 60_000),
        progress => set('downloading', { progress }), key);
      set('ready');
    } catch (e) { await discard(); throw e; }
  }
  async function install() {
    retry = 'install';
    if (!await confirmRestart(offer.version) || stopping.signal.aborted) { set('ready'); return; }
    set('installing');
    let verified = false;
    try {
      await withLock(downloaded.file, offer.installer.size, async hash => {
        verifyDigest(offer, hash, downloaded.signature, key);
        verified = true;
        prepareRestart(); // synchronous: persistence failures must precede process creation
        await launch(downloaded.file);
        committed = true;
        quit(); // quit as soon as CreateProcess succeeds, with the read lock still held
      });
    } catch (e) {
      if (!verified) { retry = 'download'; await discard(); }
      throw e;
    }
  }
  async function action() {
    if (busy || committed || stopping.signal.aborted) return state;
    const next = { idle: 'check', available: 'download', ready: 'install', error: retry }[state.status];
    if (!next) return state;
    if (next === 'check') return check(true);
    busy = true;
    activity();
    try {
      if (next === 'download') await download();
      else await install();
    } catch (e) {
      set('error', { message: `${e.message} ${retry === 'download' ? 'Retry the download.' : 'Retry restart & update.'}` });
    } finally { busy = false; activity(); }
    return state;
  }
  return {
    get state() { return state; }, get busy() { return busy; }, get committed() { return committed; },
    action, check,
    start() {
      if (cadence) return;
      void check();
      cadence = setInterval(() => void check(), 6 * 60 * 60_000);
      cadence.unref();
    },
    stop() {
      clearInterval(cadence);
      stopping.abort();
      // Do not unlink the successfully handed-off NSIS image while it is running.
      if (!busy && !committed) void discard();
    }
  };
}
