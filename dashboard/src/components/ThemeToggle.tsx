"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

/**
 * The stamp on <html> must beat the OS preference in both directions, which is
 * why the stylesheet scopes dark under both a media query and [data-theme].
 * "system" clears the stamp and hands control back to the media query.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = localStorage.getItem("factory-theme");
    if (stored === "dark" || stored === "light") setTheme(stored);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    if (next === "system") {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem("factory-theme");
    } else {
      document.documentElement.dataset.theme = next;
      localStorage.setItem("factory-theme", next);
    }
  }

  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="sr-only">Colour theme</span>
      <select
        value={theme}
        onChange={(event) => apply(event.target.value as Theme)}
        className="field w-auto py-1.5 text-xs"
      >
        <option value="system">Theme: system</option>
        <option value="light">Theme: light</option>
        <option value="dark">Theme: dark</option>
      </select>
    </label>
  );
}
