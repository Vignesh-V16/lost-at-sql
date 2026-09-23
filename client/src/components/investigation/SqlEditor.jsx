import { useEffect, useRef, useState } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

/**
 * Monaco is bundled locally (no CDN) so the terminal works on venue Wi-Fi
 * with no outside access. Only the SQL language contribution is loaded.
 */
if (typeof self !== 'undefined' && !self.MonacoEnvironment) {
  self.MonacoEnvironment = {
    getWorker() {
      return new editorWorker();
    },
  };
}
loader.config({ monaco });

const THEME = 'lostatsql-comic';
let themeDefined = false;
let completionRegistered = false;
const schemaRef = { current: [] };

/* The analyst's monitor: the book's own #06101b glass, the TONE palette off
   the cover, and the sign-in page's two lifted tones for the text you read
   while typing. Every token below is >= 7.8:1 on the glass. The theme it
   replaces had three tokens BELOW AA at 14px on white — strings 4.35:1,
   predefined.sql 3.75:1, comments and line numbers 3.00:1 — so this is a
   legibility gain, not a legibility cost.

   base is 'vs-dark': with 'vs' every colour this table does not name is
   inherited from the light theme and paints white slabs on the glass. */
function defineTheme(m) {
  if (themeDefined) return;
  themeDefined = true;
  m.editor.defineTheme(THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'e8eefc' },
      { token: 'keyword.sql', foreground: '7fe3ff', fontStyle: 'bold' },
      { token: 'keyword', foreground: '7fe3ff', fontStyle: 'bold' },
      { token: 'operator.sql', foreground: 'c9b6ff' },
      { token: 'string.sql', foreground: 'ffb3ad' },
      { token: 'string', foreground: 'ffb3ad' },
      { token: 'number', foreground: '4ade80' },
      { token: 'comment', foreground: '8ea9bd', fontStyle: 'italic' },
      { token: 'identifier', foreground: 'e8eefc' },
      { token: 'predefined.sql', foreground: 'ffd12e', fontStyle: 'bold' },
    ],
    colors: {
      'editor.background': '#06101b',
      'editor.foreground': '#e8eefc',
      'editorLineNumber.foreground': '#8ea9bd',
      'editorLineNumber.activeForeground': '#ffd12e',
      'editorCursor.foreground': '#7fe3ff',
      'editor.selectionBackground': '#2bbfe655',
      'editor.selectionHighlightBackground': '#2bbfe633',
      'editor.lineHighlightBackground': '#12263a',
      'editor.lineHighlightBorder': '#00000000',
      'editorIndentGuide.background': '#17293a',
      'editorIndentGuide.activeBackground': '#2bbfe6',
      'editorWhitespace.foreground': '#22384a',
      'editorBracketMatch.background': '#16324a',
      'editorBracketMatch.border': '#7fe3ff',
      'editor.findMatchBackground': '#e0ae0066',
      'editor.findMatchHighlightBackground': '#ffd12e33',
      'editorSuggestWidget.background': '#0b1724',
      'editorSuggestWidget.border': '#2bbfe6',
      'editorSuggestWidget.foreground': '#e8eefc',
      'editorSuggestWidget.selectedBackground': '#16324a',
      'editorSuggestWidget.highlightForeground': '#ffd12e',
      'editorWidget.background': '#0b1724',
      'editorWidget.border': '#2bbfe6',
      'editorWidget.foreground': '#e8eefc',
      'editorHoverWidget.background': '#0b1724',
      'editorHoverWidget.border': '#2bbfe6',
      'editorHoverWidget.foreground': '#e8eefc',
      'editorError.foreground': '#ff7b74',
      'editorWarning.foreground': '#ffd12e',
      'input.background': '#0b1724',
      'input.foreground': '#e8eefc',
      'input.border': '#2bbfe6',
      'scrollbarSlider.background': '#7fe3ff33',
      'scrollbarSlider.hoverBackground': '#7fe3ff55',
      'scrollbarSlider.activeBackground': '#7fe3ff77',
    },
  });
}

const SQL_KEYWORDS = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'DISTINCT', 'COUNT', 'SUM', 'MIN', 'MAX', 'AVG', 'LIKE', 'IN', 'BETWEEN', 'JOIN', 'LEFT JOIN', 'ON', 'AS', 'ASC', 'DESC', 'IS NULL', 'IS NOT NULL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'];

function registerCompletions(m) {
  if (completionRegistered) return;
  completionRegistered = true;
  m.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ' '],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
      const suggestions = [];
      for (const t of schemaRef.current) {
        suggestions.push({ label: t.name, kind: m.languages.CompletionItemKind.Class, insertText: t.name, detail: `table · ${t.rowCount} rows`, documentation: t.description, range, sortText: `0${t.name}` });
        for (const c of t.columns) {
          suggestions.push({ label: c.name, kind: m.languages.CompletionItemKind.Field, insertText: c.name, detail: `${t.name}.${c.name} · ${c.type}`, documentation: c.description || undefined, range, sortText: `1${c.name}` });
        }
      }
      for (const k of SQL_KEYWORDS) {
        suggestions.push({ label: k, kind: m.languages.CompletionItemKind.Keyword, insertText: k, range, sortText: `2${k}` });
      }
      return { suggestions };
    },
  });
}

/**
 * SqlEditor — controlled editor. `onRun` is bound to Ctrl/Cmd+Enter.
 * `schema` feeds autocompletion. Exposes the editor through `editorRef`
 * so the parent can insert snippets at the cursor.
 */
export function SqlEditor({ value, onChange, onRun, schema = [], editorRef, height = '100%', autoHeight = null, readOnly = false, fontSize = 14 }) {
  const runRef = useRef(onRun);
  runRef.current = onRun;
  /* `autoHeight` ({ min, max } in px) sizes the editor to its content, so
     the page scrolls instead of the glass: on a phone a swipe inside Monaco
     scrolls the page, not the editor, so a fixed-height box hid every line
     past the first seven. With no `max` every line is always on the page;
     with one, the editor scrolls itself past it (desktop wheel only). */
  const [grown, setGrown] = useState(null);
  useEffect(() => {
    schemaRef.current = schema;
  }, [schema]);

  return (
    <Editor
      height={autoHeight ? (grown ?? autoHeight.min ?? 192) : height}
      language="sql"
      theme={THEME}
      value={value}
      onChange={(v) => onChange(v ?? '')}
      beforeMount={(m) => {
        defineTheme(m);
        registerCompletions(m);
      }}
      onMount={(editor, m) => {
        if (editorRef) editorRef.current = editor;
        editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.Enter, () => runRef.current?.());
        if (autoHeight) {
          const fit = () => setGrown(Math.min(Math.max(editor.getContentHeight(), autoHeight.min ?? 192), autoHeight.max ?? Infinity));
          fit();
          editor.onDidContentSizeChange(fit);
        }
        /* focus without scrolling the page: on a short phone the terminal
           sits below the fold at mount, and a plain focus() would jump past
           the Chief's brief */
        const { scrollX, scrollY } = window;
        editor.focus();
        window.scrollTo(scrollX, scrollY);
        /* Monaco measures glyphs at mount; if the web font lands later the
           caret and selections drift, so re-measure once it has loaded */
        if (typeof document !== 'undefined' && document.fonts?.load) {
          document.fonts.load('14px "JetBrains Mono"').then(() => m.editor.remeasureFonts()).catch(() => {});
        }
      }}
      loading={<div className="flex h-full items-center justify-center font-display text-lg uppercase tracking-comic text-[#8ea9bd]">Loading editor…</div>}
      options={{
        readOnly,
        fontFamily: '"JetBrains Mono", Consolas, monospace',
        fontSize,
        lineHeight: 22,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        automaticLayout: true,
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: 'line',
        lineNumbersMinChars: 3,
        glyphMargin: false,
        folding: false,
        tabSize: 2,
        suggestOnTriggerCharacters: true,
        quickSuggestions: { other: true, comments: false, strings: false },
        cursorBlinking: 'phase',
        smoothScrolling: true,
        contextmenu: false,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, alwaysConsumeMouseWheel: false },
        fixedOverflowWidgets: true,
        ariaLabel: 'SQL editor',
      }}
    />
  );
}
