export const panelWidth = 350;

export function fitPanel(area, point, desiredHeight, desiredWidth = panelWidth, minWidth = 240) {
  const width = Math.min(Math.max(minWidth, Math.round(desiredWidth)), area.width);
  const height = Math.min(Math.max(24, Math.ceil(desiredHeight)), area.height);
  return {
    x: Math.round(Math.max(area.x, Math.min(point?.x ?? area.x + area.width - width - 28, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(point?.y ?? area.y + 64, area.y + area.height - height))),
    width, height
  };
}

export function findDisplay(displays, point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
  return displays.find(({ bounds: b }) => point.x >= b.x && point.x < b.x + b.width &&
    point.y >= b.y && point.y < b.y + b.height);
}
