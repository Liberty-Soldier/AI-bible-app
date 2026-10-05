"use client";

import { useMemo, useSyncExternalStore } from "react";

export type ReaderFontFamily = "serif" | "sans";
export type ReaderTextSize = "small" | "medium" | "large";
export type ReaderLineSpacing = "compact" | "comfortable" | "relaxed";

export type ReaderPreferences = {
  fontFamily: ReaderFontFamily;
  textSize: ReaderTextSize;
  lineSpacing: ReaderLineSpacing;
};

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  fontFamily: "serif",
  textSize: "medium",
  lineSpacing: "comfortable",
};

const STORAGE_KEY = "emetsees-reader-preferences-v1";
const CHANGE_EVENT = "emetsees:reader-preferences";
const DEFAULT_SNAPSHOT = JSON.stringify(DEFAULT_READER_PREFERENCES);

function isFontFamily(value: unknown): value is ReaderFontFamily {
  return value === "serif" || value === "sans";
}

function isTextSize(value: unknown): value is ReaderTextSize {
  return value === "small" || value === "medium" || value === "large";
}

function isLineSpacing(value: unknown): value is ReaderLineSpacing {
  return (
    value === "compact" || value === "comfortable" || value === "relaxed"
  );
}

function parsePreferences(snapshot: string): ReaderPreferences {
  try {
    const value = JSON.parse(snapshot) as Partial<ReaderPreferences>;

    return {
      fontFamily: isFontFamily(value.fontFamily)
        ? value.fontFamily
        : DEFAULT_READER_PREFERENCES.fontFamily,
      textSize: isTextSize(value.textSize)
        ? value.textSize
        : DEFAULT_READER_PREFERENCES.textSize,
      lineSpacing: isLineSpacing(value.lineSpacing)
        ? value.lineSpacing
        : DEFAULT_READER_PREFERENCES.lineSpacing,
    };
  } catch {
    return DEFAULT_READER_PREFERENCES;
  }
}

function getSnapshot() {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_SNAPSHOT;
}

function getServerSnapshot() {
  return DEFAULT_SNAPSHOT;
}

function subscribe(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key === STORAGE_KEY) onChange();
  }

  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useReaderPreferences() {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return useMemo(() => parsePreferences(snapshot), [snapshot]);
}

export function updateReaderPreferences(patch: Partial<ReaderPreferences>) {
  const current = parsePreferences(getSnapshot());
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
