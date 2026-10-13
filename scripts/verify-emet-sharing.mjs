import fs from "node:fs";

function read(path) { return fs.readFileSync(path, "utf8"); }
function requireText(source, text, label) { if (!source.includes(text)) throw new Error(`Missing ${label}`); }

const migration = read("supabase/migrations/20261012170000_emet_shared_studies.sql");
const store = read("app/lib/emet/EmetSharedStudy.ts");
const route = read("app/api/emet/share/route.ts");
const page = read("app/shared/[id]/page.tsx");
const chat = read("app/components/emet/EmetChat.tsx");

requireText(migration, "published_at timestamptz", "unpublished/public boundary");
requireText(migration, "revoke all on table public.emet_shared_studies from public, anon, authenticated", "direct-access revocation");
requireText(migration, "unique (owner_user_id, snapshot_hash)", "repeat-share identity");
requireText(store, '.not("published_at", "is", null)', "public publication filter");
requireText(store, '.eq("owner_user_id", userId)', "owner-scoped publication");
requireText(route, "getVerifiedSupabaseUserId", "authenticated publication");
requireText(page, "It does not include the private conversation", "privacy disclosure");
requireText(page, "generateMetadata", "question-specific metadata");
requireText(chat, 'fetch("/api/emet/share"', "deliberate publication action");
requireText(chat, "navigator.share", "native sharing");
requireText(chat, "navigator.clipboard.writeText(url)", "copy-link fallback");
console.log("EMET shared-study security and metadata verification passed.");
