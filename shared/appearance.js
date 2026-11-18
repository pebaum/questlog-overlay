export const appearanceRanges = Object.freeze({
  rowGap: [0, 12], lineHeight: [110, 180], textSize: [12, 24], titleSize: [14, 28],
  opacity: [0, 100], dither: [0, 100], pixelSize: [1, 3]
});

export const defaultAppearance = Object.freeze({
  typeface: 'dotgothic16', rowGap: 0, lineHeight: 110, textSize: 16, titleSize: 20,
  opacity: 6, dither: 100, pixelSize: 1
});

// Earlier journals omitted settings that were not yet configurable.
export const legacyAppearance = Object.freeze({ ...defaultAppearance, typeface: 'simsun', lineHeight: 125, opacity: 12 });
