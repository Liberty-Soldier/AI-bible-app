import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import EmetseesWordmark from "@/app/components/branding/EmetseesWordmark";
import { getPublishedSharedStudy } from "@/app/lib/emet/EmetSharedStudy";

const getStudy = cache(getPublishedSharedStudy);

function scriptureHref(reference: string) {
  const match = reference.match(/^(.*?)\s+(\d+):([^\s]+)$/);
  return match ? `/read/${encodeURIComponent(match[1])}/${match[2]}?verse=${encodeURIComponent(match[3])}` : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const study = await getStudy((await params).id);
  if (!study) return { title: "Shared study not found · EMETSEES" };
  const description = study.answer.replace(/\s+/g, " ").slice(0, 190);
  return {
    title: `${study.question} · EMETSEES`,
    description,
    openGraph: { title: study.question, description, type: "article", images: [`/shared/${study.id}/og`] },
    twitter: { card: "summary_large_image", title: study.question, description, images: [`/shared/${study.id}/og`] },
  };
}

export default async function SharedStudyPage({ params }: { params: Promise<{ id: string }> }) {
  const study = await getStudy((await params).id);
  if (!study) notFound();
  return <main className="min-h-screen bg-[var(--background)] px-5 py-8 text-[var(--foreground)]"><article className="mx-auto max-w-2xl rounded-[2rem] border border-[var(--border)] bg-[var(--canvas)] p-6 shadow-[var(--shadow-sm)] sm:p-10"><EmetseesWordmark showDescriptor /><p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand)]">Shared Scripture study</p><h1 className="mt-3 text-3xl font-bold leading-tight tracking-[-0.03em]">{study.question}</h1><div className="mt-7 whitespace-pre-wrap text-[1.05rem] leading-8">{study.answer}</div>{study.citations.length ? <section className="mt-8 border-t border-[var(--border)] pt-6"><h2 className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--muted)]">Scripture evidence</h2><div className="mt-3 flex flex-wrap gap-2">{study.citations.map((citation) => { const href = scriptureHref(citation.reference); return href ? <Link key={`${citation.reference}-${citation.translation}`} href={href} className="rounded-full border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:border-[var(--brand)]">{citation.reference} · {citation.translation.toUpperCase()}</Link> : null; })}</div></section> : null}<p className="mt-8 text-xs leading-5 text-[var(--muted)]">This public page contains only the deliberately shared question, validated answer snapshot, and verified Scripture citations. It does not include the private conversation.</p></article></main>;
}
