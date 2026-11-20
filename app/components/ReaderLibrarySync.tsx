"use client";

import { useEffect, useLayoutEffect } from "react";

import {
  activateReaderMemoryOwner,
  createEmptyReaderMemory,
  getReaderMemory,
  normalizeReaderMemory,
  saveReaderMemory,
  type ReaderMemory,
} from "@/app/lib/readerMemory";
import {
  mergeReaderLibraries,
  readerLibrariesEqual,
} from "@/app/lib/readerLibraryMerge";

export type ReaderLibrarySyncStatus =
  | "signed-out"
  | "syncing"
  | "synced"
  | "offline"
  | "error";

const SYNC_KEY_PREFIX = "scripture-search-reader-sync-v1:";

type SyncSnapshot = {
  revision: number;
  base: ReaderMemory;
};

type CloudLibrary = {
  userId?: string;
  revision: number;
  memory: ReaderMemory;
};

function publishStatus(status: ReaderLibrarySyncStatus) {
  document.documentElement.dataset.readerLibrarySync = status;
  window.dispatchEvent(
    new CustomEvent("reader-library-sync-status", { detail: status }),
  );
}

function readSnapshot(userId: string): SyncSnapshot | null {
  try {
    const raw = localStorage.getItem(`${SYNC_KEY_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SyncSnapshot>;
    if (!Number.isSafeInteger(parsed.revision) || Number(parsed.revision) < 0) {
      return null;
    }
    return {
      revision: Number(parsed.revision),
      base: normalizeReaderMemory(parsed.base),
    };
  } catch {
    return null;
  }
}

function writeSnapshot(
  userId: string,
  revision: number,
  base: ReaderMemory,
) {
  localStorage.setItem(
    `${SYNC_KEY_PREFIX}${userId}`,
    JSON.stringify({ revision, base: normalizeReaderMemory(base) }),
  );
}

async function readCloudLibrary(signal: AbortSignal): Promise<CloudLibrary> {
  const response = await fetch("/api/library", {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  if (!response.ok) {
    throw new Error(response.status === 401 ? "signed-out" : "read-failed");
  }

  return response.json();
}

async function writeCloudLibrary(
  revision: number,
  memory: ReaderMemory,
  signal: AbortSignal,
) {
  const response = await fetch("/api/library", {
    method: "PUT",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision, memory }),
    signal,
  });

  if (response.status === 409) return null;
  if (!response.ok) {
    throw new Error(response.status === 401 ? "signed-out" : "write-failed");
  }

  return response.json() as Promise<CloudLibrary>;
}

export default function ReaderLibrarySync({
  userId,
}: {
  userId: string | null;
}) {
  useLayoutEffect(() => {
    activateReaderMemoryOwner(userId);
  }, [userId]);

  useEffect(() => {
    activateReaderMemoryOwner(userId);
    if (!userId) {
      publishStatus("signed-out");
      return;
    }
    const ownerId = userId;

    const controller = new AbortController();
    let stopped = false;
    let inFlight = false;
    let queued = false;
    let timer: number | null = null;

    async function synchronize() {
      if (stopped) return;
      if (inFlight) {
        queued = true;
        return;
      }

      inFlight = true;
      queued = false;
      publishStatus("syncing");

      try {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const cloud = await readCloudLibrary(controller.signal);
          if (cloud.userId && cloud.userId !== ownerId) {
            throw new Error("account-mismatch");
          }

          const remote = normalizeReaderMemory(cloud.memory);
          const localAtStart = getReaderMemory();
          const snapshot = readSnapshot(ownerId);
          const base = snapshot?.base || createEmptyReaderMemory();
          const merged = mergeReaderLibraries(base, localAtStart, remote);

          if (readerLibrariesEqual(merged, remote)) {
            writeSnapshot(ownerId, cloud.revision, remote);
            if (readerLibrariesEqual(getReaderMemory(), localAtStart)) {
              if (!readerLibrariesEqual(localAtStart, merged)) {
                saveReaderMemory(merged);
              }
            } else {
              queued = true;
            }
            publishStatus("synced");
            return;
          }

          const saved = await writeCloudLibrary(
            cloud.revision,
            merged,
            controller.signal,
          );
          if (!saved) continue;

          const savedMemory = normalizeReaderMemory(saved.memory);
          writeSnapshot(ownerId, saved.revision, savedMemory);

          const currentLocal = getReaderMemory();
          const finalLocal = readerLibrariesEqual(currentLocal, localAtStart)
            ? savedMemory
            : mergeReaderLibraries(localAtStart, currentLocal, savedMemory);

          if (!readerLibrariesEqual(currentLocal, finalLocal)) {
            saveReaderMemory(finalLocal);
          }
          if (!readerLibrariesEqual(finalLocal, savedMemory)) queued = true;

          publishStatus("synced");
          return;
        }

        throw new Error("conflict-retry-exhausted");
      } catch (error) {
        if (controller.signal.aborted || stopped) return;
        if (error instanceof Error && error.message === "signed-out") {
          publishStatus("signed-out");
        } else {
          publishStatus(navigator.onLine ? "error" : "offline");
        }
      } finally {
        inFlight = false;
        if (queued && !stopped) {
          queued = false;
          window.setTimeout(synchronize, 0);
        }
      }
    }

    function schedule(delay = 400) {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void synchronize();
      }, delay);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") schedule(0);
    }

    function scheduleSoon() {
      schedule();
    }

    function scheduleNow() {
      schedule(0);
    }

    schedule(0);
    window.addEventListener("reader-memory-updated", scheduleSoon);
    window.addEventListener("storage", scheduleSoon);
    window.addEventListener("focus", scheduleNow);
    window.addEventListener("online", scheduleNow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const interval = window.setInterval(() => schedule(0), 30_000);

    return () => {
      stopped = true;
      controller.abort();
      if (timer !== null) window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("reader-memory-updated", scheduleSoon);
      window.removeEventListener("storage", scheduleSoon);
      window.removeEventListener("focus", scheduleNow);
      window.removeEventListener("online", scheduleNow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [userId]);

  return null;
}
