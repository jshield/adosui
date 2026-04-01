import { useState, useCallback } from "react";
import { T } from "../../lib/theme";
import { Btn, formLabelStyle } from "./index";

/**
 * SchemaForm — Renders a form from an array of normalised field definitions.
 * Supports flat, nested (object), and dynamic list (array) field types.
 *
 * Field types:
 *   string, number, boolean, select, textarea, tags — flat leaf fields
 *   object — nested group with `fields` children, stored as nested object
 *   array  — dynamic list of items with `itemFields` template, stored as array
 *
 * Field options:
 *   visibleWhen — optional function (values) => boolean controlling visibility
 *
 * @param {object} props
 * @param {Array} props.fields - Normalised field definitions
 * @param {(values: object) => void} props.onSubmit
 * @param {() => void} props.onCancel
 * @param {string} [props.submitLabel="Submit"]
 * @param {boolean} [props.disabled=false]
 */
export function SchemaForm({ fields, onSubmit, onCancel, submitLabel = "Submit", disabled = false }) {
  const initialise = useCallback(() => buildDefault(fields), [fields]);

  const [values, setValues] = useState(initialise);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  // Filter fields by visibleWhen callback
  const visibleFields = fields.filter(f => !f.visibleWhen || f.visibleWhen(values));

  const setValue = useCallback((key, val) => {
    setValues(prev => ({ ...prev, [key]: val }));
    setErrors(prev => ({ ...prev, [key]: undefined }));
  }, []);

  const handleBlur = useCallback((key) => {
    setTouched(prev => ({ ...prev, [key]: true }));
  }, []);

  const validate = useCallback(() => {
    return validateFields(visibleFields, values, "");
  }, [visibleFields, values]);

  const handleSubmit = useCallback(() => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setTouched(flattenTouched(visibleFields));
      return;
    }
    const coerced = coerceValues(visibleFields, values);
    onSubmit(coerced);
  }, [visibleFields, values, validate, onSubmit]);

  return (
    <div>
      {visibleFields.map(f => (
        <FormField
          key={f.key}
          field={f}
          value={values[f.key]}
          onChange={v => setValue(f.key, v)}
          onBlur={() => handleBlur(f.key)}
          error={touched[f.key] ? errors[f.key] : undefined}
          errors={touched[f.key] ? errors : undefined}
          touched={touched[f.key] ? touched : undefined}
          disabled={disabled}
          depth={0}
        />
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <Btn variant="primary" onClick={handleSubmit} disabled={disabled}>
          {submitLabel}
        </Btn>
        {onCancel && (
          <Btn onClick={onCancel} disabled={disabled}>Cancel</Btn>
        )}
      </div>
    </div>
  );
}

// ── Default value builder ─────────────────────────────────────────────────────

function buildDefault(fields) {
  const v = {};
  for (const f of fields) {
    if (f.default !== undefined) {
      v[f.key] = f.default;
    } else if (f.type === "boolean") {
      v[f.key] = false;
    } else if (f.type === "tags") {
      v[f.key] = [];
    } else if (f.type === "number") {
      v[f.key] = "";
    } else if (f.type === "object" && Array.isArray(f.fields)) {
      v[f.key] = buildDefault(f.fields);
    } else if (f.type === "array") {
      v[f.key] = [];
    } else {
      v[f.key] = "";
    }
  }
  return v;
}

// ── Validation ─────────────────────────────────────────────────────────────────

function validateFields(fields, values, prefix) {
  const errs = {};
  for (const f of fields) {
    const path = prefix ? `${prefix}.${f.key}` : f.key;
    const v = values[f.key];

    if (f.required) {
      if (f.type === "tags") {
        if (!Array.isArray(v) || v.length === 0) errs[path] = "Required";
      } else if (f.type === "number") {
        if (v === "" || v === null || v === undefined) errs[path] = "Required";
      } else if (f.type === "boolean") {
        // always valid
      } else if (f.type === "array") {
        if (!Array.isArray(v) || v.length === 0) errs[path] = "Required";
      } else if (f.type === "object") {
        if (!v || typeof v !== "object") errs[path] = "Required";
      } else {
        if (!String(v || "").trim()) errs[path] = "Required";
      }
    }

    if (f.type === "number" && v !== "" && v !== null && v !== undefined && isNaN(Number(v))) {
      errs[path] = "Must be a number";
    }
    if (f.type === "select" && f.options && v && !f.options.includes(v)) {
      errs[path] = "Invalid option";
    }

    // Recurse into object fields
    if (f.type === "object" && Array.isArray(f.fields) && v && typeof v === "object") {
      Object.assign(errs, validateFields(f.fields, v, path));
    }

    // Validate array items
    if (f.type === "array" && Array.isArray(f.itemFields) && Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item && typeof item === "object") {
          Object.assign(errs, validateFields(f.itemFields, item, `${path}[${i}]`));
        }
      });
    }
  }
  return errs;
}

// ── Coercion ───────────────────────────────────────────────────────────────────

function coerceValues(fields, values) {
  const result = { ...values };
  for (const f of fields) {
    if (f.type === "number" && result[f.key] !== "") {
      result[f.key] = Number(result[f.key]);
    }
    if (f.type === "tags" && typeof result[f.key] === "string") {
      result[f.key] = result[f.key].split(",").map(s => s.trim()).filter(Boolean);
    }
    if (f.type === "object" && Array.isArray(f.fields) && result[f.key]) {
      result[f.key] = coerceValues(f.fields, result[f.key]);
    }
    if (f.type === "array" && Array.isArray(f.itemFields) && Array.isArray(result[f.key])) {
      result[f.key] = result[f.key].map(item =>
        item && typeof item === "object" ? coerceValues(f.itemFields, item) : item
      );
    }
  }
  return result;
}

// ── Touched helper ─────────────────────────────────────────────────────────────

function flattenTouched(fields, prefix = "") {
  const t = {};
  for (const f of fields) {
    const path = prefix ? `${prefix}.${f.key}` : f.key;
    t[path] = true;
    if (f.type === "object" && Array.isArray(f.fields)) {
      Object.assign(t, flattenTouched(f.fields, path));
    }
  }
  return t;
}

// ── Shared input styles ────────────────────────────────────────────────────────

const fieldInputStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 5,
  outline: "none",
  color: T.text,
  fontFamily: "'Barlow'",
  padding: "8px 12px",
  fontSize: 12,
  width: "100%",
  boxSizing: "border-box",
};

const fieldInputErrorStyle = {
  ...fieldInputStyle,
  border: `1px solid ${T.red}55`,
};

// ── FormField (recursive) ──────────────────────────────────────────────────────

function FormField({ field, value, onChange, onBlur, error, errors, touched, disabled, depth }) {
  const indent = depth > 0 ? 16 : 0;

  return (
    <div style={{ marginBottom: depth > 0 ? 10 : 14, marginLeft: indent }}>
      {field.type !== "boolean" && (
        <label style={{
          ...formLabelStyle,
          fontSize: depth > 0 ? 10 : formLabelStyle.fontSize,
        }}>
          {field.label}
          {field.required && <span style={{ color: T.red, marginLeft: 4 }}>*</span>}
        </label>
      )}
      {field.description && (
        <div style={{ fontSize: 10, color: T.dimmer, marginBottom: 5, marginTop: -3, fontFamily: "'JetBrains Mono'" }}>
          {field.description}
        </div>
      )}
      <FieldInput
        field={field}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        error={error}
        errors={errors}
        touched={touched}
        disabled={disabled}
        depth={depth}
      />
      {typeof error === "string" && (
        <div style={{ fontSize: 10, color: T.red, marginTop: 4, fontFamily: "'JetBrains Mono'" }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ── Field-type renderers ──────────────────────────────────────────────────────

function FieldInput({ field, value, onChange, onBlur, error, errors, touched, disabled, depth }) {
  const style = error ? fieldInputErrorStyle : fieldInputStyle;

  switch (field.type) {
    case "string":
      return (
        <input type="text" value={value || ""} onChange={e => onChange(e.target.value)}
          onBlur={onBlur} disabled={disabled} style={style} placeholder={field.label} />
      );

    case "number":
      return (
        <input type="number" value={value} onChange={e => onChange(e.target.value)}
          onBlur={onBlur} disabled={disabled} style={style} step="1" />
      );

    case "boolean":
      return (
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: disabled ? "not-allowed" : "pointer" }}>
          <span onClick={() => !disabled && onChange(!value)}
            style={{
              width: 36, height: 20, borderRadius: 10, padding: 2,
              background: value ? `${T.green}33` : "rgba(255,255,255,0.08)",
              border: `1px solid ${value ? T.green + "66" : "rgba(255,255,255,0.12)"}`,
              cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.15s",
              display: "flex", alignItems: "center",
            }}>
            <span style={{
              width: 14, height: 14, borderRadius: "50%",
              background: value ? T.green : T.dim,
              transform: value ? "translateX(16px)" : "translateX(0)",
              transition: "all 0.15s",
            }} />
          </span>
          <span style={{ fontSize: 12, color: T.muted }}>{value ? "Enabled" : "Disabled"}</span>
        </label>
      );

    case "select":
      return (
        <select value={value || ""} onChange={e => onChange(e.target.value)}
          onBlur={onBlur} disabled={disabled}
          style={{ ...style, cursor: disabled ? "not-allowed" : "pointer" }}>
          <option value="" style={{ background: T.panel }}>Select…</option>
          {(field.options || []).map(opt => (
            <option key={opt} value={opt} style={{ background: T.panel }}>{opt}</option>
          ))}
        </select>
      );

    case "textarea":
      return (
        <textarea value={value || ""} onChange={e => onChange(e.target.value)}
          onBlur={onBlur} disabled={disabled} rows={4}
          style={{ ...style, resize: "vertical", fontFamily: "'JetBrains Mono'" }} />
      );

    case "tags":
      return (
        <input type="text" value={Array.isArray(value) ? value.join(", ") : (value || "")}
          onChange={e => onChange(e.target.value)} onBlur={onBlur} disabled={disabled}
          style={style} placeholder="tag1, tag2, tag3" />
      );

    case "object":
      return renderObjectField(field, value, onChange, disabled, depth, errors, touched);

    case "array":
      return renderArrayField(field, value, onChange, disabled, depth);

    default:
      return (
        <input type="text" value={value || ""} onChange={e => onChange(e.target.value)}
          onBlur={onBlur} disabled={disabled} style={style} />
      );
  }
}

// ── Object field renderer ──────────────────────────────────────────────────────

function renderObjectField(field, value, onChange, disabled, depth, errors, touched) {
  if (!Array.isArray(field.fields)) return null;
  const obj = (value && typeof value === "object") ? value : {};

  const setSubValue = (subKey, subVal) => {
    onChange({ ...obj, [subKey]: subVal });
  };

  return (
    <div style={{
      border: `1px solid rgba(255,255,255,0.06)`,
      borderRadius: 6,
      padding: "10px 12px",
      background: "rgba(255,255,255,0.015)",
    }}>
      {field.fields.map(subField => {
        const subPath = `${field.key}.${subField.key}`;
        return (
          <FormField
            key={subField.key}
            field={subField}
            value={obj[subField.key]}
            onChange={v => setSubValue(subField.key, v)}
            onBlur={() => {}}
            error={errors?.[subPath]}
            errors={errors}
            touched={touched}
            disabled={disabled}
            depth={depth + 1}
          />
        );
      })}
    </div>
  );
}

// ── Array field renderer ───────────────────────────────────────────────────────

function renderArrayField(field, value, onChange, disabled, depth) {
  const items = Array.isArray(value) ? value : [];

  const addItem = () => {
    const defaultItem = {};
    if (Array.isArray(field.itemFields)) {
      for (const f of field.itemFields) {
        if (f.default !== undefined) defaultItem[f.key] = f.default;
        else if (f.type === "boolean") defaultItem[f.key] = false;
        else if (f.type === "number") defaultItem[f.key] = "";
        else if (f.type === "tags") defaultItem[f.key] = [];
        else defaultItem[f.key] = "";
      }
    }
    onChange([...items, defaultItem]);
  };

  const removeItem = (index) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const updateItem = (index, key, val) => {
    onChange(items.map((item, i) => i === index ? { ...item, [key]: val } : item));
  };

  return (
    <div>
      {items.map((item, idx) => (
        <div key={idx} style={{
          border: `1px solid rgba(255,255,255,0.06)`,
          borderRadius: 6,
          padding: "10px 12px",
          marginBottom: 8,
          background: "rgba(255,255,255,0.015)",
          position: "relative",
        }}>
          {/* Item header with index + remove */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 8, paddingBottom: 6, borderBottom: `1px solid rgba(255,255,255,0.04)`,
          }}>
            <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'" }}>
              #{idx + 1}
            </span>
            {!disabled && (
              <button onClick={() => removeItem(idx)}
                style={{
                  background: "none", border: "none", color: T.red, cursor: "pointer",
                  fontSize: 11, padding: "2px 6px", opacity: 0.6,
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0.6}
              >
                ✕ remove
              </button>
            )}
          </div>
          {/* Item fields */}
          {(field.itemFields || []).map(subField => (
            <FormField
              key={subField.key}
              field={subField}
              value={item[subField.key]}
              onChange={v => updateItem(idx, subField.key, v)}
              onBlur={() => {}}
              error={undefined}
              disabled={disabled}
              depth={depth + 1}
            />
          ))}
        </div>
      ))}
      {!disabled && (
        <button onClick={addItem}
          style={{
            background: "rgba(255,255,255,0.03)", border: `1px dashed rgba(255,255,255,0.1)`,
            borderRadius: 5, color: T.dim, cursor: "pointer", fontSize: 11,
            padding: "8px 14px", width: "100%", fontFamily: "'JetBrains Mono'",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = `${T.amber}44`; e.currentTarget.style.color = T.amber; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = T.dim; }}
        >
          + Add item
        </button>
      )}
    </div>
  );
}
