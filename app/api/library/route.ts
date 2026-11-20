import { NextResponse } from "next/server";

import {
  createEmptyReaderMemory,
  normalizeReaderMemory,
} from "@/app/lib/readerMemory";
import { isReaderLibraryWithinLimits } from "@/app/lib/readerLibraryMerge";
import {
  createSupabaseServerClient,
  getVerifiedSupabaseUserId,
} from "@/app/lib/supabase/server";

export const dynamic = "force-dynamic";

type LibraryRow = {
  revision: number;
  library: unknown;
};

function reply(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function hasLibraryShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.bookmarks) &&
    Array.isArray(candidate.highlights) &&
    Array.isArray(candidate.notes) &&
    Array.isArray(candidate.highlightCollections)
  );
}

async function readLibrary(
  db: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  owner: string,
) {
  return db
    .from("reader_libraries")
    .select("revision,library")
    .eq("user_id", owner)
    .maybeSingle<LibraryRow>();
}

export async function GET() {
  const owner = await getVerifiedSupabaseUserId();
  if (!owner) return reply({ status: "authentication-required" }, 401);

  const db = await createSupabaseServerClient();
  if (!db) return reply({ status: "library-sync-unavailable" }, 503);

  const { data, error } = await readLibrary(db, owner);
  if (error) return reply({ status: "library-sync-unavailable" }, 503);

  return reply({
    userId: owner,
    revision: data?.revision ?? 0,
    memory: normalizeReaderMemory(data?.library || createEmptyReaderMemory()),
  });
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return reply({ status: "origin-denied" }, 403);

  const owner = await getVerifiedSupabaseUserId();
  if (!owner) return reply({ status: "authentication-required" }, 401);

  const text = await request.text();
  if (text.length > 2_000_000) {
    return reply({ status: "library-too-large" }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply({ status: "invalid-request" }, 400);
  }

  const candidate = body as { revision?: unknown; memory?: unknown };
  if (
    !Number.isSafeInteger(candidate?.revision) ||
    Number(candidate.revision) < 0 ||
    !hasLibraryShape(candidate?.memory)
  ) {
    return reply({ status: "invalid-request" }, 400);
  }

  const revision = Number(candidate.revision);
  const memory = normalizeReaderMemory(candidate.memory);
  if (!isReaderLibraryWithinLimits(memory)) {
    return reply({ status: "library-too-large" }, 413);
  }

  const db = await createSupabaseServerClient();
  if (!db) return reply({ status: "library-sync-unavailable" }, 503);

  const current = await readLibrary(db, owner);
  if (current.error) {
    return reply({ status: "library-sync-unavailable" }, 503);
  }

  if (!current.data) {
    if (revision !== 0) {
      return reply(
        { revision: 0, memory: createEmptyReaderMemory() },
        409,
      );
    }

    const inserted = await db
      .from("reader_libraries")
      .insert({ user_id: owner, revision: 1, library: memory })
      .select("revision,library")
      .single<LibraryRow>();

    if (!inserted.error && inserted.data) {
      return reply({
        revision: inserted.data.revision,
        memory: normalizeReaderMemory(inserted.data.library),
      });
    }

    const raced = await readLibrary(db, owner);
    if (!raced.error && raced.data) {
      return reply(
        {
          revision: raced.data.revision,
          memory: normalizeReaderMemory(raced.data.library),
        },
        409,
      );
    }

    return reply({ status: "library-sync-unavailable" }, 503);
  }

  if (current.data.revision !== revision) {
    return reply(
      {
        revision: current.data.revision,
        memory: normalizeReaderMemory(current.data.library),
      },
      409,
    );
  }

  const updated = await db
    .from("reader_libraries")
    .update({
      revision: revision + 1,
      library: memory,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", owner)
    .eq("revision", revision)
    .select("revision,library")
    .maybeSingle<LibraryRow>();

  if (updated.error) {
    return reply({ status: "library-sync-unavailable" }, 503);
  }

  if (!updated.data) {
    const raced = await readLibrary(db, owner);
    return raced.error || !raced.data
      ? reply({ status: "library-sync-unavailable" }, 503)
      : reply(
          {
            revision: raced.data.revision,
            memory: normalizeReaderMemory(raced.data.library),
          },
          409,
        );
  }

  return reply({
    revision: updated.data.revision,
    memory: normalizeReaderMemory(updated.data.library),
  });
}
