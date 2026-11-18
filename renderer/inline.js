import { Fragment, Schema, Slice } from 'prosemirror-model';
import { EditorState, Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { toggleMark } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { webLink } from '../shared/rich.js';
import { autoLink, linksIn } from './autolink.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'inline*' }, text: { group: 'inline' },
    br: { group: 'inline', inline: true, selectable: false, leafText: () => '\n', parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] }
  },
  marks: {
    link: { attrs: { href: {}, auto: { default: false } }, inclusive: false,
      parseDOM: [{ tag: 'a[href]', getAttrs: a => {
        const href = webLink(a.getAttribute('href')), text = a.textContent, [literal] = linksIn(text);
        return href ? { href, auto: literal?.from === 0 && literal.to === text.length && literal.href === href } : false;
      } }],
      toDOM: mark => ['a', { href: mark.attrs.href, tabindex: '0', target: '_blank', rel: 'noopener noreferrer' }, 0] },
    bold: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }, { style: 'font-weight', getAttrs: v => /^(bold|[6-9]00)$/.test(v) && null }], toDOM: () => ['strong', 0] },
    italic: { parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }], toDOM: () => ['em', 0] },
    underline: { parseDOM: [{ tag: 'u' }, { style: 'text-decoration-line', getAttrs: v => v.split(/\s+/).includes('underline') ? null : false }], toDOM: () => ['u', 0] }
  }
});

function fragment(text, marks = []) {
  const nodes = [];
  text.split('\n').forEach((line, i) => {
    if (i) nodes.push(schema.nodes.br.create(null, null, marks));
    if (line) nodes.push(schema.text(line, marks));
  });
  return Fragment.from(nodes);
}
function fromStored(text, spans = []) {
  let content = Fragment.empty, pos = 0;
  for (const { from, to, bold, italic, underline, href } of spans) {
    const marks = [];
    if (href) marks.push(schema.marks.link.create({ href }));
    if (bold) marks.push(schema.marks.bold.create());
    if (italic) marks.push(schema.marks.italic.create());
    if (underline) marks.push(schema.marks.underline.create());
    content = content.append(fragment(text.slice(pos, from))).append(fragment(text.slice(from, to), marks));
    pos = to;
  }
  return schema.nodes.doc.create(null, content.append(fragment(text.slice(pos))));
}
export function richValue(doc) {
  let text = '';
  const spans = [];
  doc.forEach(node => {
    const from = text.length;
    text += node.isText ? node.text : '\n';
    if (!node.marks.length) return;
    const span = { from, to: text.length };
    for (const mark of node.marks) {
      if (mark.type === schema.marks.link) { if (!mark.attrs.auto) span.href = mark.attrs.href; }
      else span[mark.type.name] = true;
    }
    if (!span.bold && !span.italic && !span.underline && !span.href) return;
    const last = spans.at(-1);
    if (last && last.to === from && last.href === span.href && last.bold === span.bold && last.italic === span.italic && last.underline === span.underline) last.to = span.to;
    else spans.push(span);
  });
  return spans.length ? { text, spans } : { text };
}
export function caretAt(view, pos) {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  view.focus();
}
function syncCaret(view) {
  const selection = view.dom.ownerDocument.getSelection();
  if (!selection?.rangeCount || !view.dom.contains(selection.anchorNode) || !view.dom.contains(selection.focusNode)) return;
  const anchor = view.posAtDOM(selection.anchorNode, selection.anchorOffset);
  const head = view.posAtDOM(selection.focusNode, selection.focusOffset);
  if (anchor !== view.state.selection.anchor || head !== view.state.selection.head)
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor, head)));
}
export function inlineEditor(host, options) {
  const { id, className } = host;
  let state = EditorState.create({ schema, doc: fromStored(options.text, options.spans), plugins: [
    history(), keymap({ 'Mod-a': (state, dispatch) => {
      dispatch(state.tr.setSelection(TextSelection.create(state.doc, 0, state.doc.content.size)));
      return true;
    }, 'Mod-b': toggleMark(schema.marks.bold), 'Mod-i': toggleMark(schema.marks.italic),
      'Mod-u': toggleMark(schema.marks.underline), 'Mod-z': undo, 'Mod-Shift-z': redo, 'Mod-y': redo }),
    new Plugin({ appendTransaction: (transactions, _old, next) => {
      if (!transactions.some(tr => tr.docChanged)) return null;
      const tr = autoLink(next.tr);
      return tr.docChanged ? tr : null;
    }, filterTransaction: tr => {
      if (!tr.docChanged || tr.doc.content.size <= options.limit) return true;
      options.error(`Text limit: ${options.limit.toLocaleString()} characters. The change was not applied.`);
      return false;
    } })
  ] });
  const initialLinks = autoLink(state.tr, true);
  if (initialLinks.docChanged) state = state.apply(initialLinks.setMeta('addToHistory', false));
  return new EditorView({ mount: host }, {
    state, editable: () => !options.locked(),
    attributes: s => ({ id, class: className, role: 'textbox', 'aria-multiline': 'true',
      'aria-label': options.label(s.doc.textContent), 'aria-readonly': String(options.locked()),
      'aria-keyshortcuts': 'Control+B Control+I Control+U Meta+B Meta+I Meta+U Alt+ArrowUp Alt+ArrowDown',
      'data-empty': String(!s.doc.content.size), ...(options.placeholder && { 'data-placeholder': options.placeholder }), spellcheck: 'true' }),
    dispatchTransaction(tr) {
      const next = this.state.apply(tr);
      if (next === this.state) return;
      this.updateState(next);
      if (tr.docChanged) options.changed(this);
    },
    clipboardTextParser: (text, context, _plain, view) => new Slice(fragment(text.replace(/\r\n?/g, '\n'), view.state.storedMarks || context.marks()), 0, 0),
    handlePaste(view, e) {
      const text = (e.clipboardData?.getData('text/plain') ?? '').trim(), [url] = linksIn(text);
      const { from, to, empty } = view.state.selection;
      if (empty || !url || url.from !== 0 || url.to !== text.length) return false;
      const tr = view.state.tr.addMark(from, to, schema.marks.link.create({ href: url.href }));
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, to)).removeStoredMark(schema.marks.link));
      return true;
    },
    handleTextInput(view, from, to, text) {
      if (from !== to || options.locked() || view.composing) return false;
      if (from <= 10 && [' ', ']', '[]'].includes(text) &&
          options.prefix?.(view, view.state.doc.textBetween(0, from, '', '\n'), text, from)) return true;
      return false;
    },
    handleKeyDown(view, e) {
      if (options.locked() || view.composing || e.isComposing || e.keyCode === 229) return false;
      const mod = e.ctrlKey || e.metaKey;
      // Home/End may move the browser caret before ProseMirror receives selectionchange.
      if (e.key === 'Enter' || e.key === 'Backspace' || (mod && /^[biu]$/i.test(e.key))) syncCaret(view);
      if (e.key === 'Enter' && (mod || e.target.closest('a'))) {
        const { $from } = view.state.selection;
        const href = e.target.closest('a')?.href || schema.marks.link.isInSet($from.marks())?.attrs.href ||
          schema.marks.link.isInSet($from.nodeBefore?.marks ?? [])?.attrs.href;
        if (href) { options.openLink(href); return true; }
      }
      if (options.key?.(view, e)) return true;
      if (e.key === 'Enter') { view.dispatch(view.state.tr.replaceSelectionWith(schema.nodes.br.create()).scrollIntoView()); return true; }
      return false;
    },
    handleDOMEvents: {
      beforeinput(view, e) {
        if (options.locked() || e.isComposing || e.inputType !== 'insertText' || !/[\r\n]/.test(e.data ?? '')) return false;
        // IME/automation can submit a whole multiline string rather than individual Enter events.
        e.preventDefault();
        const marks = view.state.storedMarks || view.state.selection.$from.marks();
        view.dispatch(view.state.tr.replaceSelection(new Slice(fragment(e.data.replace(/\r\n?/g, '\n'), marks), 0, 0)));
        return true;
      },
      click(_view, e) {
        const anchor = e.target.closest('a');
        if (!anchor) return false;
        e.preventDefault();
        if (!options.locked() && document.getSelection()?.isCollapsed) options.openLink(anchor.getAttribute('href'));
        return true;
      },
      drop(_view, e) { e.preventDefault(); return true; }
    }
  });
}
