import { materials } from '../shared/backgrounds.js';
import { materialTile } from './materials.js';

const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

async function pixelArt(file) {
  if (!file.size || file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const is = (offset, ...expected) => expected.every((v, i) => bytes[offset + i] === v);
  const type = is(0, 137, 80, 78, 71, 13, 10, 26, 10) ? 'image/png' : is(0, 255, 216, 255) ? 'image/jpeg' :
    is(0, 82, 73, 70, 70) && is(8, 87, 69, 66, 80) ? 'image/webp' : null;
  if (!type) throw new Error('Choose a PNG, JPEG or WebP image.');
  const reader = new FileReader();
  const src = await new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.readAsDataURL(file.slice(0, file.size, type));
  });
  const img = new Image();
  img.src = src;
  await img.decode();
  if (img.naturalWidth * img.naturalHeight > 24_000_000) throw new Error('Choose an image of 24 megapixels or less.');
  const scale = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const i = 4 * (y * canvas.width + x), threshold = (bayer[(y % 4) * 4 + x % 4] + .5) / 16;
    for (let c = i; c < i + 3; c++) pixels.data[c] = Math.floor(pixels.data[c] * 7 / 255 + threshold) * 255 / 7;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}

export function bindBackground(panel, journal, save, locked) {
  const select = panel.querySelector('#background-texture'), file = panel.querySelector('#background-file');
  const choose = panel.querySelector('#choose-background'), remove = panel.querySelector('#remove-background');
  const status = panel.querySelector('#background-status'), swatch = panel.querySelector('#material-swatch');
  const key = window.questlog ? 'questlog.desktop.background.v1' : 'questlog.preview.background.v1';
  let custom = null;
  const message = text => { status.textContent = text; status.hidden = !text; };
  try {
    const stored = localStorage.getItem(key);
    if (stored && (stored.length > 420_000 || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(stored))) throw new Error('Saved image is unreadable.');
    custom = stored;
  } catch (e) { message(`Background: ${e.message}`); }
  for (const [id, label] of Object.entries(materials)) select.add(new Option(label, id));
  function draw() {
    const kind = journal.backgroundTexture;
    const src = kind === 'custom' ? custom : kind === 'plain' ? null : materialTile(kind);
    select.value = kind;
    select.querySelector('[value="custom"]').disabled = !custom;
    remove.hidden = !custom && kind !== 'custom';
    const image = src ? `url("${src}")` : 'none';
    panel.style.setProperty('--surface-image', image);
    panel.dataset.surface = src ? kind : 'plain';
    swatch.dataset.surface = panel.dataset.surface;
    swatch.style.backgroundImage = image;
  }
  draw();
  if (journal.backgroundTexture === 'custom' && !custom) message('Saved image unavailable. Choose an image or a material.');
  select.onchange = () => { journal.backgroundTexture = select.value; message(''); draw(); save(); };
  choose.onclick = () => { if (!locked()) file.click(); };
  file.onchange = async () => {
    const picked = file.files[0]; file.value = '';
    if (!picked || locked()) return;
    choose.disabled = select.disabled = remove.disabled = true;
    message('Preparing image…');
    try {
      const next = await pixelArt(picked);
      if (locked()) { message('Unlock the overlay before importing an image.'); return; }
      localStorage.setItem(key, next);
      custom = next; journal.backgroundTexture = 'custom'; draw(); save(); message('');
    } catch (e) { message(`Image not changed: ${e.message}`); }
    finally { choose.disabled = select.disabled = remove.disabled = false; }
  };
  remove.onclick = () => {
    if (locked()) return;
    try { localStorage.removeItem(key); }
    catch (e) { message(`Image not removed: ${e.message}`); return; }
    custom = null;
    if (journal.backgroundTexture === 'custom') journal.backgroundTexture = 'plain';
    draw(); save(); message('');
  };
}
