import { spawn } from 'node:child_process';
import path from 'node:path';

// Node's Windows file handles share write/delete access. This local, constant helper
// holds a deny-write/deny-delete read handle from hashing through CreateProcess.
// The path is data on stdin; no part of a URL, filename or signature becomes code.
const locker = `
$ErrorActionPreference = 'Stop'
try {
  $p = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::ReadLine()))
  $size = [int64]::Parse([Console]::ReadLine())
  $dir = [IO.Path]::GetDirectoryName($p)
  foreach ($entry in @($p, $dir, [IO.Path]::GetDirectoryName($dir))) {
    if ([IO.File]::GetAttributes($entry) -band [IO.FileAttributes]::ReparsePoint) { exit 1 }
  }
  $f = [IO.File]::Open($p, 'Open', 'Read', 'Read')
  try {
    if ($f.Length -ne $size) { exit 1 }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $h = $sha.ComputeHash($f) } finally { $sha.Dispose() }
    [Console]::WriteLine([BitConverter]::ToString($h).Replace('-','').ToLowerInvariant())
    [void][Console]::ReadLine()
  } finally { $f.Dispose() }
} catch { exit 1 }
`;

export async function withLockedInstaller(file, size, use) {
  const systemPS = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const child = spawn(systemPS, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(locker, 'utf16le').toString('base64')], {
    cwd: path.dirname(systemPS), windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'ignore']
  });
  const failed = () => new Error('Could not lock and verify the downloaded installer. Check Windows PowerShell availability and retry.');
  const closed = new Promise(resolve => child.once('close', resolve));
  let timeout;
  try {
    const hash = await new Promise((resolve, reject) => {
      child.once('error', () => reject(failed()));
      child.stdin.on('error', () => reject(failed()));
      child.once('close', () => reject(failed()));
      timeout = setTimeout(() => { child.kill(); reject(failed()); }, 90_000);
      let output = '';
      child.stdout.setEncoding('ascii').on('data', chunk => {
        output += chunk;
        if (/^[0-9a-f]{64}\r?\n$/.test(output)) resolve(output.trim());
        else if (output.length > 66 || output.includes('\n')) reject(failed());
      });
      child.stdin.write(`${Buffer.from(file, 'utf8').toString('base64')}\n${size}\n`);
    });
    clearTimeout(timeout);
    if (child.exitCode !== null || child.signalCode !== null) throw failed();
    return await use(hash);
  } finally {
    clearTimeout(timeout);
    child.stdin.end(); // EOF releases the handle even if the app dies.
    await closed;
  }
}

export function launchInstaller(file, spawnProcess = spawn) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(file, ['/S', '--updated', '--force-run'], {
      cwd: path.dirname(file), detached: true, shell: false, stdio: 'ignore', windowsHide: true
    });
    child.once('error', () => reject(new Error('Windows could not start the verified installer.')));
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}
