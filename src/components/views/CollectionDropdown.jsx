import { useState, useEffect } from "react";
import { T } from "../../lib/theme";
import { popoverStyle, SectionLabel } from "../ui";

export function CollectionDropdown({ collections, currentIds, onToggle, onClose, buttonRef, onCreateNew }) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [position, setPosition] = useState({ top: "100%", left: 0 });

  useEffect(() => {
    if (!open) return;
    const dropdown = document.getElementById("collection-dropdown");
    if (!dropdown || !buttonRef?.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownRect = dropdown.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownHeight = dropdownRect.height || 200;
    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      dropdown.style.transform = "translateY(-100%)";
    } else {
      dropdown.style.transform = "none";
    }
    setPosition({ top: "100%", left: 0 });
  }, [open, buttonRef, collections.length]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (buttonRef?.current && !buttonRef.current.contains(e.target)) {
        const dropdown = document.getElementById("collection-dropdown");
        if (dropdown && !dropdown.contains(e.target)) {
          setOpen(false);
        }
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, buttonRef]);

  useEffect(() => {
    if (!open) {
      setFocusedIndex(-1);
      return;
    }
    const handleKeyDown = (e) => {
      const total = collections.length + (onCreateNew ? 1 : 0);
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef?.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex(i => (i + 1) % total);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex(i => (i - 1 + total) % total);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < collections.length) {
          handleToggle(collections[focusedIndex].id);
        } else if (onCreateNew && focusedIndex === collections.length) {
          setOpen(false);
          onCreateNew();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, focusedIndex, collections, onCreateNew, buttonRef]);

  const handleToggle = (colId) => {
    onToggle(colId);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        ref={buttonRef}
        onClick={() => setOpen(true)}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 4,
          padding: "3px 8px",
          cursor: "pointer",
          color: T.muted,
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
        title="Add to collection"
      >
        +
      </button>
    );
  }

  const allItems = onCreateNew
    ? [...collections, { id: "__create__", name: "Create new collection", icon: "+", isCreateNew: true }]
    : collections;

  return (
    <div
      id="collection-dropdown"
      role="listbox"
      style={{
        ...popoverStyle,
        top: position.top,
        left: position.left,
        zIndex: 200,
        padding: 8,
        minWidth: 180,
        marginTop: 2,
      }}
    >
      <SectionLabel>Add to collection</SectionLabel>
      {allItems.length === 0 ? (
        <div style={{ fontSize: 11, color: T.dim, padding: "8px 4px", fontFamily: "'JetBrains Mono'" }}>
          No collections yet
        </div>
      ) : (
        allItems.map((col, idx) => {
          const isIn = !col.isCreateNew && currentIds?.includes(col.id);
          const isFocused = idx === focusedIndex;
          return (
            <div
              key={col.id}
              role="option"
              aria-selected={isIn}
              tabIndex={-1}
              onClick={() => col.isCreateNew ? (setOpen(false), onCreateNew()) : handleToggle(col.id)}
              onMouseEnter={() => setFocusedIndex(idx)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 4,
                cursor: "pointer",
                background: isFocused
                  ? "rgba(255,255,255,0.1)"
                  : isIn ? `${col.color}12` : "transparent",
              }}
            >
              <span style={{ color: isIn ? T.green : T.dim, fontSize: 12, width: 12 }}>{isIn ? "✓" : ""}</span>
              <span style={{ fontSize: 13 }}>{col.icon}</span>
              <span style={{ flex: 1, fontSize: 12, color: col.isCreateNew ? T.amber : T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {col.name}
              </span>
              {!col.isCreateNew && <span style={{ width: 6, height: 6, borderRadius: "50%", background: col.color }} />}
            </div>
          );
        })
      )}
    </div>
  );
}
