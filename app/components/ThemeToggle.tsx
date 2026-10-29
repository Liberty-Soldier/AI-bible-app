"use client";

import { useTheme } from "@/app/components/ThemeProvider";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--foreground)]"
    >
      {theme === "dark" ? "Switch to Light" : "Switch to Dark"}
    </button>
  );
}
