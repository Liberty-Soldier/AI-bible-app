export function normalizeAuthNextPath(value: unknown, fallback = "/settings") {
  if (typeof value !== "string") return fallback;

  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  if (path.startsWith("/auth/callback")) return fallback;

  return path;
}

export function authPageHref({
  mode,
  next,
  messageType,
  message,
}: {
  mode?: "signin" | "signup";
  next?: string;
  messageType?: "error" | "notice";
  message?: string;
}) {
  const params = new URLSearchParams();
  if (mode) params.set("mode", mode);
  if (next) params.set("next", normalizeAuthNextPath(next));
  if (messageType && message) params.set(messageType, message);

  const query = params.toString();
  return query ? `/auth?${query}` : "/auth";
}
