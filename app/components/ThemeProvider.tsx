"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: Theme;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const PRIMARY_STORAGE_KEY = "emetsees-theme";
const LEGACY_STORAGE_KEYS = ["bibleiq-theme", "theme"] as const;

function normalizeTheme(value: string | null): Theme {
  return value === "dark" ? "dark" : "light";
}

function writeStoredTheme(theme: Theme) {
  localStorage.setItem(PRIMARY_STORAGE_KEY, theme);

  // Keep the existing Settings page compatible until its own visual redesign.
  // The old key is synchronized from the new authoritative preference; it is
  // never allowed to choose the first-visit default.
  for (const key of LEGACY_STORAGE_KEYS) {
    localStorage.setItem(key, theme);
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>("light");
  const currentTheme = useRef<Theme>("light");

  const commitTheme = useCallback((next: Theme) => {
    currentTheme.current = next;
    setThemeState(next);
    applyTheme(next);
    writeStoredTheme(next);
  }, []);

  useLayoutEffect(() => {
    const stored = normalizeTheme(localStorage.getItem(PRIMARY_STORAGE_KEY));
    commitTheme(stored);
  }, [commitTheme]);

  useEffect(() => {
    const root = document.documentElement;

    const observer = new MutationObserver(() => {
      const next = normalizeTheme(root.dataset.theme || null);

      if (next !== currentTheme.current) {
        currentTheme.current = next;
        setThemeState(next);
        writeStoredTheme(next);
      }
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    function syncTheme(event: StorageEvent) {
      if (
        event.key !== PRIMARY_STORAGE_KEY &&
        !LEGACY_STORAGE_KEYS.includes(
          event.key as (typeof LEGACY_STORAGE_KEYS)[number],
        )
      ) {
        return;
      }

      const authoritative = normalizeTheme(
        localStorage.getItem(PRIMARY_STORAGE_KEY),
      );
      commitTheme(authoritative);
    }

    window.addEventListener("storage", syncTheme);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", syncTheme);
    };
  }, [commitTheme]);

  const setTheme = useCallback(
    (next: Theme) => {
      commitTheme(next);
    },
    [commitTheme],
  );

  const toggleTheme = useCallback(() => {
    commitTheme(currentTheme.current === "dark" ? "light" : "dark");
  }, [commitTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme: theme,
      isDark: theme === "dark",
      setTheme,
      toggleTheme,
    }),
    [setTheme, theme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error("useTheme must be used inside ThemeProvider.");
  }

  return value;
}
