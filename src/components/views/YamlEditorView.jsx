import { useState, useEffect, useRef, useCallback } from "react";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { lineNumbers, highlightActiveLine } from "@codemirror/view";
import { yaml as codemirrorYaml } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";
import { T } from "../../lib/theme";

export function YamlEditor({ value, onChange }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const [initError, setInitError] = useState(null);
  const initializedRef = useRef(false);

  const setContainerRef = useCallback(el => {
    if (initializedRef.current || !el) return;
    initializedRef.current = true;
    containerRef.current = el;

    requestAnimationFrame(() => {
      try {
        const view = new EditorView({
          state: EditorState.create({
            doc: value,
            extensions: [
              lineNumbers(),
              highlightActiveLine(),
              codemirrorYaml(),
              oneDark,
              EditorView.updateListener.of(update => {
                if (update.docChanged) onChange(update.state.doc.toString());
              }),
              EditorView.theme({
                "&": { height: "100%", minHeight: "300px", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" },
                ".cm-scroller": { overflow: "auto", fontFamily: "'JetBrains Mono', monospace" },
                ".cm-content": { caretColor: "#F59E0B" },
              }),
            ],
          }),
          parent: el,
        });
        viewRef.current = view;
      } catch (e) {
        console.error("[YamlEditor] CodeMirror init failed:", e);
        setInitError(e.message);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, []);

  if (initError) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#1e1e1e", color: T.red, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>
        Editor error: {initError}
      </div>
    );
  }

  return <div ref={setContainerRef} style={{ flex: 1, overflow: "hidden", background: "#1e1e1e", minHeight: 0 }} />;
}
