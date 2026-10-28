import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';
import { PostgreSQL, sql } from '@codemirror/lang-sql';
import { schema } from '../data';
export interface SqlEditorHandle { insert: (keyword: string) => void }
interface Props { value: string; onChange: (value: string) => void; onRun: () => void }
const SqlEditor = forwardRef<SqlEditorHandle, Props>(function SqlEditor({ value, onChange, onRun }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const changeCallback = useRef(onChange);
  const runCallback = useRef(onRun);
  const initialValue = useRef(value);
  useEffect(() => { changeCallback.current = onChange; runCallback.current = onRun; }, [onChange, onRun]);
  useImperativeHandle(ref, () => ({ insert(keyword) {
    const view = editor.current;
    if (!view) return;
    view.dispatch(view.state.replaceSelection(`${keyword} `));
    view.focus();
  } }), []);
  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue.current,
        extensions: [basicSetup, syntaxHighlighting(HighlightStyle.define([
          { tag: tags.keyword, color: '#833369' },
          { tag: tags.typeName, color: '#30634c' },
          { tag: tags.string, color: '#94362d' },
          { tag: tags.number, color: '#1e665d' },
          { tag: tags.comment, color: '#53634c', fontStyle: 'italic' },
        ])), sql({ dialect: PostgreSQL, schema: Object.fromEntries(schema.map((table) => [table.name, table.columns.map((column) => column.name)])), upperCaseKeywords: true }), EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'SQL query', 'aria-describedby': 'query-help', 'aria-multiline': 'true', spellcheck: 'false', autocapitalize: 'off' }),
          // basicSetup binds Mod-Enter to insertBlankLine; the run shortcut must take precedence.
          Prec.highest(keymap.of([{ key: 'Mod-Enter', run() { runCallback.current(); return true; } }])),
          EditorView.updateListener.of((update) => { if (update.docChanged) changeCallback.current(update.state.doc.toString()); }),
          EditorView.theme({ '&': { fontSize: '13px', backgroundColor: '#fffefa' }, '.cm-content': { fontFamily: '"JetBrains Mono Variable", monospace', minHeight: '220px', padding: '18px 0', caretColor: '#173b3b' }, '.cm-line': { padding: '0 12px' }, '.cm-gutters': { background: '#f5f5ef', color: '#5a6a63', border: 'none', fontFamily: '"JetBrains Mono Variable", monospace' }, '&.cm-focused': { outline: '2px solid #487568', outlineOffset: '-2px' }, '.cm-scroller': { lineHeight: '1.8' }, '.cm-activeLine': { backgroundColor: '#173b3b05' } }),
        ],
      }),
    });
    editor.current = view;
    return () => { view.destroy(); editor.current = null; };
  }, []);
  useEffect(() => {
    const view = editor.current;
    if (view && view.state.doc.toString() !== value) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);
  return <div ref={host} className="sql-editor" />;
});
export default SqlEditor;
