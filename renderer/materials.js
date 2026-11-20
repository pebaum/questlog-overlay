// Small, periodic relief maps. Transparent ink lets each tile take the user's panel color.
const cache = new Map();
const wave = turns => Math.sin(2 * Math.PI * turns);
const mod = (n, d) => ((n % d) + d) % d;
function grain(x, y) {
  const h = Math.imul(x + 97, 1597334677) ^ Math.imul(y + 83, 3812015801);
  return ((Math.imul(h ^ h >>> 16, 2246822519) >>> 0) / 4294967296) - .5;
}
function relief(kind, x, y) {
  const speck = grain(x, y);
  switch (kind) {
    case 'parchment': {
      const terrain = 2 * wave(x / 64) + 1.6 * wave(y / 64) + .65 * wave((x + y) / 32);
      return .23 + speck * .12 - (mod(terrain, .65) < .09 ? .17 : 0);
    }
    case 'leather': {
      const crease = mod(x + y + Math.round(2 * wave(y / 16)), 16);
      return .1 + .14 * speck - (crease <= 1 ? .23 : 0) + (crease === 2 ? .07 : 0);
    }
    case 'masonry': {
      const row = y >> 4, dx = mod(x + row * 16 + (row % 2 ? 3 : 0), 32), dy = y % 16;
      if (!dx || !dy) return -.5;
      if (dx === 1 || dy === 1) return .30;
      if (dx === 31 || dy === 15) return -.24;
      return .12 + .12 * speck + .06 * grain((x + row * 16) >> 3, y >> 2);
    }
    case 'mail': {
      let light = .01;
      for (const shift of [0, 4]) {
        const dx = mod(x + shift, 8) - 3.5, dy = mod(y + shift, 8) - 3.5;
        const r = dx * dx + dy * dy * 1.4;
        if (r >= 7 && r < 15) light = dy < 0 ? .32 : dx < 0 ? .14 : -.24;
      }
      return light;
    }
    case 'weave': {
      const diamond = Math.abs(x % 16 - 8) + Math.abs(y % 16 - 8);
      return (diamond === 6 || diamond === 8 ? .26 : .04) + ((x + y) % 2 ? .055 : -.035);
    }
    case 'wood': {
      const rings = y / 8 + .52 * wave(x / 64) + .24 * wave((x + y) / 32);
      return .12 + .08 * wave(rings) - (mod(rings, 1) < .14 ? .19 : 0) + speck * .06;
    }
    case 'stars': {
      const r = Math.hypot(x - 31, y - 31);
      const etching = Math.abs(r - 21) < .45 || Math.abs(r - 23) < .35;
      const compass = Math.min(Math.abs(x - 31), Math.abs(y - 31)) < 1 && r < 8;
      return etching ? .14 : compass || speck > .496 ? .42 : .025 + speck * .035;
    }
    default: throw new Error('Unknown material.');
  }
}
export function materialTile(kind) {
  if (!cache.has(kind)) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const tone = relief(kind, x, y), i = (64 * y + x) * 4;
      pixels.data.fill(tone > 0 ? 255 : 0, i, i + 3);
      pixels.data[i + 3] = Math.round(Math.abs(tone) * 255);
    }
    ctx.putImageData(pixels, 0, 0);
    cache.set(kind, canvas.toDataURL('image/png'));
  }
  return cache.get(kind);
}
