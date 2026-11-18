const repo = 'pebaum/questlog-overlay';
export const releasesPage = `https://github.com/${repo}/releases/latest`;
const endpoint = `https://api.github.com/repos/${repo}/releases/latest`;
const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export async function checkForUpdate(installed, request = fetch) {
  const response = await request(endpoint, {
    headers: { Accept: 'application/vnd.github+json' },
    credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error(response.status === 404 ? 'No public release was found.' :
    `GitHub returned HTTP ${response.status}. Please try again later.`);

  const release = await response.json();
  const version = release?.tag_name?.replace(/^v/, '');
  if (release?.draft !== false || release.prerelease !== false || !stable.test(installed) ||
      !stable.test(version) || release.tag_name !== `v${version}`) throw new Error('Unrecognized release information.');
  const current = installed.split('.').map(BigInt), latest = version.split('.').map(BigInt);
  const firstDifference = latest.findIndex((part, i) => part !== current[i]);
  if (firstDifference < 0 || latest[firstDifference] < current[firstDifference]) return null;

  const name = `Questlog-Setup-${version}.exe`;
  const url = `https://github.com/${repo}/releases/download/v${version}/${name}`;
  if (!release.assets?.some(a => a.name === name && a.state === 'uploaded' && a.size > 0 && a.browser_download_url === url)) {
    throw new Error(`The Windows installer for ${version} isn't available yet.`);
  }
  return { version, url };
}
