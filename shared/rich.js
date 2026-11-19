export const blockTypes = Object.freeze(['todo', 'bullet', 'numbered', 'paragraph']);

export function webLink(value) {
  if (typeof value !== 'string' || value.length > 4096 || !/^https?:\/\//i.test(value) || /[\u0000-\u0020\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.hostname && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

// Offsets are UTF-16 offsets into the accompanying plain text; unmarked gaps need no entry.
export function checkSpans(text, spans) {
  if (spans === undefined) return;
  if (!Array.isArray(spans) || spans.length > text.length) throw new Error('Invalid text formatting.');
  let end = 0;
  for (const span of spans) {
    if (!span || !Number.isInteger(span.from) || !Number.isInteger(span.to) || span.from < end ||
        span.to <= span.from || span.to > text.length || (span.bold !== undefined && span.bold !== true) ||
        (span.italic !== undefined && span.italic !== true) || (span.underline !== undefined && span.underline !== true) ||
        (span.href !== undefined && !webLink(span.href)) || !(span.bold || span.italic || span.underline || span.href)) throw new Error('Invalid text formatting.');
    end = span.to;
  }
}
