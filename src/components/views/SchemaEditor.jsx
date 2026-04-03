import { useState, useEffect, useRef } from "react";
import yaml from "js-yaml";
import { T } from "../../lib/theme";
import { Btn, Spinner } from "../ui";
import { SchemaForm } from "../ui/SchemaForm";
import { YamlEditor } from "./YamlEditorView";

function getDefaultForFields(fields) {
  const v = {};
  for (const f of fields) {
    if (f.default !== undefined) {
      v[f.key] = f.default;
    } else if (f.type === "boolean") {
      v[f.key] = false;
    } else if (f.type === "tags") {
      v[f.key] = [];
    } else {
      v[f.key] = "";
    }
  }
  return v;
}

/**
 * SchemaEditor — Generic schema-driven editor with always-in-sync Visual and YAML panes.
 *
 * Layout: Visual form (left) | YAML editor (right), always both visible and in sync.
 * formValues is the single source of truth. Every change in either pane updates
 * formValues, which then propagates to the other pane via useEffect.
 *
 * @param {object}   props
 * @param {object}   props.item     - Item being edited (or default values for new)
 * @param {Array}    props.fields   - Schema field definitions
 * @param {object}   props.context  - Context passed to SchemaForm
 * @param {Function} props.onSave   - (parsedValues) => void
 * @param {Function} props.onCancel - () => void
 * @param {boolean}  props.saving  - True while saving
 * @param {boolean}  props.isNew   - Whether this is a new item
 * @param {string|null} props.error - External error message
 */
export function SchemaEditor({ item, fields, context, onSave, onCancel, saving, isNew, error: externalError }) {
  const [formValues, setFormValues] = useState(() => ({ ...getDefaultForFields(fields), ...(item || {}) }));
  const [yamlText, setYamlText] = useState(() => yaml.dump(formValues, { lineWidth: 120, quotingType: '"' }));
  const [yamlError, setYamlError] = useState(null);
  const isYamlEditing = useRef(false);

  // formValues → yamlText (serialise on every formValues change, unless user is typing in YAML)
  useEffect(() => {
    if (isYamlEditing.current) return;
    try {
      const next = yaml.dump(formValues, { lineWidth: 120, quotingType: '"' });
      setYamlText(next);
      setYamlError(null);
    } catch (e) {
      // Serialisation errors are deferred to save time
    }
  }, [formValues]);

  // YAML text changed externally (user typing in CodeMirror)
  const handleYamlChange = (text) => {
    setYamlText(text);
    isYamlEditing.current = true;
    try {
      const parsed = yaml.load(text);
      setFormValues(parsed);
      setYamlError(null);
    } catch (e) {
      setYamlError("YAML parse error: " + e.message);
    }
    // Allow formValues→yamlText sync again after a short debounce
    setTimeout(() => { isYamlEditing.current = false; }, 300);
  };

  const handleSave = () => {
    if (yamlError) return;
    onSave(formValues);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Error bar */}
      {(externalError || yamlError) && (
        <div style={{ padding: "8px 20px", background: `${T.red}08`, borderBottom: `1px solid ${T.red}22`, fontSize: 12, color: T.red, flexShrink: 0 }}>
          {externalError || yamlError}
        </div>
      )}

      {/* Side-by-side body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* Visual pane */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", borderRight: `1px solid ${T.border}` }}>
          <SchemaForm
            fields={fields}
            context={context}
            values={formValues}
            onChange={setFormValues}
            submitLabel={isNew ? "Next →" : "Save"}
            noButtons
          />
        </div>

        {/* YAML pane */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <YamlEditor
            value={yamlText}
            onChange={handleYamlChange}
          />
        </div>
      </div>

      {/* Sticky footer */}
      <div style={{ padding: "12px 20px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Btn>
        <Btn variant="primary" onClick={handleSave} disabled={saving || !!yamlError}>
          {saving ? <Spinner size={12} /> : null}
          {saving ? "Saving…" : isNew ? "Next →" : "Save"}
        </Btn>
      </div>
    </div>
  );
}
