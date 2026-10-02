import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const actions = read("app/auth/actions.ts");
const callback = read("app/auth/callback/route.ts");
const page = read("app/auth/page.tsx");
const settings = read("app/settings/page.tsx");
const server = read("app/lib/supabase/server.ts");

assert.match(actions, /signInWithPassword/);
assert.match(actions, /auth\.signUp/);
assert.match(actions, /emailRedirectTo/);
assert.match(actions, /auth\.signOut/);
assert.match(actions, /normalizeAuthNextPath/);
assert.match(callback, /exchangeCodeForSession/);
assert.match(callback, /normalizeAuthNextPath/);
assert.match(page, /minLength=\{8\}/);
assert.match(page, /Check your email|Create your account/);
assert.match(settings, /getVerifiedSupabaseUser/);
assert.match(settings, /signOutAction/);
assert.match(server, /auth\.getClaims\(\)/);

console.log("EMET Supabase auth verification passed.");
