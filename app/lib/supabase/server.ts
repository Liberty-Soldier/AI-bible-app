import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicConfig } from "./config";

export async function createSupabaseServerClient() {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  const cookieStore = await cookies();

  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. proxy.ts refreshes them.
        }
      },
    },
  });
}

export async function getVerifiedSupabaseUserId() {
  const user = await getVerifiedSupabaseUser();
  return user?.id ?? null;
}

export type VerifiedSupabaseUser = {
  id: string;
  email: string | null;
};

export async function getVerifiedSupabaseUser(): Promise<VerifiedSupabaseUser | null> {
  const client = await createSupabaseServerClient();
  if (!client) return null;

  const { data, error } = await client.auth.getClaims();
  if (error) return null;

  const subject = data?.claims?.sub;
  if (typeof subject !== "string" || !subject) return null;

  const email = data.claims.email;
  return {
    id: subject,
    email: typeof email === "string" && email ? email : null,
  };
}
