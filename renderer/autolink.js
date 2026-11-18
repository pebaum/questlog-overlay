import { LinkifyIt } from 'linkify-it';
import { webLink } from '../shared/rich.js';

const parser = new LinkifyIt({ fuzzyLink: true });

export function linksIn(text) {
  const links = [];
  for (const match of parser.match(text) ?? []) {
    if (match.schema && !['http:', 'https:'].includes(match.schema)) continue;
    if (/^(?::[^\s/?#]*)?@/.test(text.slice(match.lastIndex))) continue;
    const href = webLink(match.schema === '' ? `https://${match.raw}` : match.url);
    if (href) links.push({ from: match.index, to: match.lastIndex, href });
  }
  return links;
}

export function autoLink(tr, adoptLiteralLinks = false) {
  const type = tr.doc.type.schema.marks.link;
  const found = linksIn(tr.doc.textContent), existing = [];
  tr.doc.forEach((node, from) => {
    const mark = type.isInSet(node.marks);
    if (!mark) return;
    const last = existing.at(-1), to = from + node.nodeSize;
    if (last && last.to === from && last.mark.eq(mark)) last.to = to;
    else existing.push({ from, to, mark });
  });
  const byStart = new Map(found.map(l => [l.from, l]));
  const named = [], unchanged = new Set();
  for (const { from, to, mark } of existing) {
    const match = byStart.get(from);
    const same = match?.to === to && match.href === mark.attrs.href;
    if (mark.attrs.auto && same) unchanged.add(from);
    else if (mark.attrs.auto || (adoptLiteralLinks && same)) tr.removeMark(from, to, type);
    else named.push({ from, to });
  }
  let i = 0;
  for (const { from, to, href } of found) {
    while (i < named.length && named[i].to <= from) i++;
    // A manually labelled or pasted rich link takes precedence over URL-looking text.
    if (!unchanged.has(from) && !(named[i]?.from < to)) tr.addMark(from, to, type.create({ href, auto: true }));
  }
  return tr;
}
