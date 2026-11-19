const download = 'M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4';
const restart = 'M20 5v6h-6m6 0a8 8 0 1 0-2 7';
const working = 'M5 12h.1m6.9 0h.1m6.9 0h.1';

export function bindUpdateAction(button, native, report) {
  if (!native?.watchUpdate) return;
  const icon = button.querySelector('path');
  native.watchUpdate(({ status, version, progress, message }) => {
    const labels = {
      available: `Download Questlog ${version}`,
      downloading: `Downloading Questlog ${version}${Number.isFinite(progress) ? ` (${progress}%)` : ''}`,
      ready: `Restart & update to Questlog ${version}`,
      installing: 'Restarting Questlog',
      error: `Retry update${message ? `: ${message}` : ''}`
    };
    button.hidden = !version || !labels[status];
    if (button.hidden) return;
    button.disabled = status === 'downloading' || status === 'installing';
    button.title = labels[status];
    button.setAttribute('aria-label', button.title);
    icon.setAttribute('d', button.disabled ? working : status === 'ready' ? restart : download);
  });
  button.onclick = () => native.updateAction().catch(error => report(`Update: ${error.message}`));
}
