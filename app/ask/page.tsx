import { redirect } from "next/navigation";

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const queryValue = (await searchParams).q;
  const query = Array.isArray(queryValue) ? queryValue[0] : queryValue;

  redirect(query ? `/emet?q=${encodeURIComponent(query)}` : "/emet");
}
