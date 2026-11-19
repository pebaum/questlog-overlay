import { lstat, mkdir, mkdtemp, readdir, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';

async function plainDirectory(dir) {
  // Inherit the per-user app-data ACL on Windows. Do not follow junctions out of it.
  const stat = await lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe update staging directory.');
}
const ownDirectory = /^attempt-[a-zA-Z0-9]{6}$/;
const ownFile = /^Questlog-Setup-\d{1,9}\.\d{1,9}\.\d{1,9}\.exe$/;

export async function newStage(root) {
  await mkdir(root, { mode: 0o700, recursive: true });
  await plainDirectory(root);
  return mkdtemp(path.join(root, 'attempt-'));
}

export async function removeStage(root, dir) {
  if (path.dirname(dir) !== root || !ownDirectory.test(path.basename(dir))) throw new Error('Not an update staging directory.');
  await plainDirectory(root);
  await plainDirectory(dir);
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isFile() && ownFile.test(entry.name)) await unlink(path.join(dir, entry.name));
  }
  await rmdir(dir);
}

export async function cleanStaleStages(root) {
  try { await plainDirectory(root); }
  catch (e) { if (e.code === 'ENOENT') return; throw e; }
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory() && ownDirectory.test(entry.name)) {
      // The just-finished installer or AV can still hold the previous file open.
      try { await removeStage(root, path.join(root, entry.name)); } catch { /* Retry on next startup. */ }
    }
  }
}
