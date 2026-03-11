import { useState, useCallback, useEffect } from "react";

export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initial;
    } catch { return initial; }
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      setValue(stored ? JSON.parse(stored) : initial);
    } catch { setValue(initial); }
  }, [key]);

  const set = useCallback((v) => {
    setValue(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);

  return [value, set];
}
