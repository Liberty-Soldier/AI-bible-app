import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase",
    "migrations",
    "20261001193000_emet_ai_foundation.sql",
  ),
  "utf8",
);
const proxy = fs.readFileSync(path.join(root, "proxy.ts"), "utf8");
const server = fs.readFileSync(
  path.join(root, "app", "lib", "supabase", "server.ts"),
  "utf8",
);
const admin = fs.readFileSync(
  path.join(root, "app", "lib", "supabase", "admin.ts"),
  "utf8",
);

for (const table of [
  "emet_plans",
  "emet_accounts",
  "emet_usage_periods",
  "emet_question_requests",
  "emet_verified_answers",
]) {
  assert.match(
    migration,
    new RegExp(`alter table public\\.${table} enable row level security`, "i"),
    `${table} must enable RLS`,
  );
  assert.match(
    migration,
    new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, "i"),
    `${table} must revoke default client grants`,
  );
}

assert.match(migration, /\('free', 'Free', 5, 0\)/);
assert.match(migration, /\('lite', 'EMET Lite', 15, 99\)/);
assert.match(migration, /\('starter', 'Starter', 50, 299\)/);
assert.match(migration, /\('study', 'Study', 150, 699\)/);
assert.match(migration, /\('deep-study', 'Deep Study', 300, 999\)/);
assert.match(migration, /for update;/i, "quota reservation must lock its usage row");
assert.match(
  migration,
  /unique \(user_id, request_id\)/i,
  "request replay protection is required",
);
assert.match(
  migration,
  /v_existing\.cache_key <> p_cache_key/i,
  "a replayed request ID must remain bound to its original evidence",
);
assert.match(
  migration,
  /refund_failed_emet_question/i,
  "failed provider attempts must restore quota",
);
assert.match(
  migration,
  /set questions_used = usage\.questions_used \+ 1/i,
  "quota updates must qualify the table column against output-column names",
);
assert.match(
  migration,
  /greatest\(usage\.questions_used - 1, 0\)/i,
  "quota refunds must qualify the table column against output-column names",
);
assert.match(
  migration,
  /revoke all on function public\.reserve_emet_question\(uuid, text\) from public, anon/i,
);
assert.doesNotMatch(
  migration,
  /grant .*emet_verified_answers to authenticated/i,
  "verified shared answers must remain server-only",
);
assert.match(proxy, /updateSupabaseSession/);
assert.match(server, /auth\.getClaims\(\)/);
assert.doesNotMatch(server, /auth\.getSession\(\)/);
assert.match(admin, /SUPABASE_SECRET_KEY/);
assert.doesNotMatch(admin, /NEXT_PUBLIC_SUPABASE_SECRET/);

console.log("EMET AI Supabase foundation verification passed.");
console.log("- Five monthly plan limits are explicit.");
console.log("- Quota reservation is atomic and replay-safe.");
console.log("- Failed provider attempts restore the reserved question credit.");
console.log("- User tables use RLS with explicit grants.");
console.log("- Shared verified answers remain server-only.");
console.log("- Server identity checks use verified claims, not getSession().");
