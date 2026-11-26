import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { syntaxHighlighting } from "@codemirror/language";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";

const theme = EditorView.theme(
  {
    "&": { backgroundColor: "transparent", fontSize: "14px", height: "100%" },
    ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.65" },
    ".cm-gutters": { backgroundColor: "transparent", borderRight: "1px solid var(--color-line)", color: "var(--color-mute)" },
    ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "rgba(255,255,255,0.03)" },
    ".cm-content": { caretColor: "var(--color-accent)", padding: "10px 0" },
    "&.cm-focused": { outline: "none" },
    ".cm-cursor": { borderLeftColor: "var(--color-accent)" },
  },
  { dark: true },
);

const proseTheme = EditorView.theme({
  ".cm-scroller": { fontFamily: "var(--font-sans)", fontSize: "15px", lineHeight: "1.7" },
  ".cm-content": { padding: "12px 0" },
  ".cm-line": { padding: "0 2px" },
});

/** Единственный редактор кода/markdown в приложении. */
export function CodeEditor({
  value,
  onChange,
  lang,
  className,
  placeholder,
  minHeight,
}: {
  value: string;
  onChange: (v: string) => void;
  lang: "python" | "javascript" | "markdown";
  className?: string;
  placeholder?: string;
  minHeight?: string;
}) {
  const extensions = useMemo(() => {
    const l = lang === "python" ? python() : lang === "javascript" ? javascript() : markdown();
    const base = [l, theme, syntaxHighlighting(oneDarkHighlightStyle)];
    return lang === "markdown" ? [...base, proseTheme, EditorView.lineWrapping] : base;
  }, [lang]);
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme="none"
      extensions={extensions}
      placeholder={placeholder}
      minHeight={minHeight}
      height="100%"
      className={className ?? "h-full"}
      basicSetup={{
        lineNumbers: lang !== "markdown",
        foldGutter: false,
        highlightActiveLineGutter: lang !== "markdown",
        highlightActiveLine: lang !== "markdown",
        autocompletion: lang !== "markdown",
        tabSize: 4,
      }}
    />
  );
}
