"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const CHAT_STORAGE_KEY = "emetsees-conversation";

export type EmetChatUsage = {
  planName: string;
  unlimited?: boolean;
  questionLimit: number;
  questionsUsed: number;
  questionsRemaining: number;
  resetsAt?: string;
};

type ReaderContext = {
  type?: "reader";
  book: string;
  chapter: number;
  verse?: string | number | null;
  translation: "web" | "kjv" | "brenton";
};

type WordContext = ReaderContext & {
  displayWord: string;
  displayTokenIndex?: number;
  readerRecordId?: string;
  verseText?: string;
  entityId?: string;
  sourceOccurrenceId?: string;
  sourceLexicalId?: string;
  sourceCorpus?: "hebrew" | "greek-nt" | "lxx";
  sourceResolutionAuthority?: string;
  sourceResolutionMethod?: string;
};

type Answer = {
  answer: string;
  citations: Array<{ evidenceId: string; reference?: string }>;
  limitations: string[];
};

type Exchange = {
  id: string;
  question: string;
  answer: Answer;
  source?: string;
};

function storedExchanges(storage: Storage) {
  const parsed = parseStoredContext<unknown>(storage, CHAT_STORAGE_KEY);
  if (!Array.isArray(parsed)) return [];

  return parsed.slice(-20).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const exchange = candidate as Partial<Exchange>;
    if (
      typeof exchange.id !== "string" ||
      typeof exchange.question !== "string" ||
      !exchange.answer ||
      typeof exchange.answer.answer !== "string"
    ) {
      return [];
    }

    return [{
      id: exchange.id,
      question: exchange.question.slice(0, 800),
      answer: {
        answer: exchange.answer.answer,
        citations: Array.isArray(exchange.answer.citations)
          ? exchange.answer.citations
          : [],
        limitations: Array.isArray(exchange.answer.limitations)
          ? exchange.answer.limitations
          : [],
      },
      source: exchange.source,
    }];
  });
}

function parseStoredContext<T>(storage: Storage, key: string): T | null {
  const value = storage.getItem(key);
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function contextLabel(context: ReaderContext | WordContext | null) {
  if (!context) return "Whole-Scripture evidence search";
  const reference = `${context.book} ${context.chapter}${context.verse ? `:${context.verse}` : ""}`;
  return "displayWord" in context
    ? `${context.displayWord} · ${reference}`
    : reference;
}

function referenceHref(reference: string) {
  const match = reference.match(/^(.*?)\s+(\d+):([^\s]+)$/);
  if (!match) return null;
  return `/read/${encodeURIComponent(match[1])}/${match[2]}?verse=${encodeURIComponent(match[3])}`;
}

function normalizeAnswer(payload: Record<string, unknown>) {
  if (payload.answer && typeof payload.answer === "object") {
    const value = payload.answer as Partial<Answer>;
    if (typeof value.answer === "string") {
      return {
        answer: value.answer,
        citations: Array.isArray(value.citations) ? value.citations : [],
        limitations: Array.isArray(value.limitations) ? value.limitations : [],
      } as Answer;
    }
  }

  return {
    answer:
      typeof payload.answer === "string"
        ? payload.answer
        : "EMET could not produce a supported answer.",
    citations: [],
    limitations: Array.isArray(payload.limitations)
      ? (payload.limitations as string[])
      : [],
  };
}

function resetLabel(value?: string) {
  if (!value) return "the start of next month";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "the start of next month";
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export default function EmetChat({
  initialUsage,
  initialQuestion = "",
}: {
  initialUsage: EmetChatUsage | null;
  initialQuestion?: string;
}) {
  const router = useRouter();
  const [question, setQuestion] = useState(initialQuestion.slice(0, 800));
  const [readerContext, setReaderContext] = useState<ReaderContext | null>(null);
  const [wordContext, setWordContext] = useState<WordContext | null>(null);
  const [usage, setUsage] = useState(initialUsage);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const conversationEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const reader = parseStoredContext<ReaderContext>(
        window.localStorage,
        "bibleiq-current-context",
      );
      const word = parseStoredContext<WordContext>(
        window.sessionStorage,
        "emetsees-word-question-context",
      );
      setReaderContext(reader);
      setWordContext(word);
      setExchanges(storedExchanges(window.sessionStorage));
      setHistoryLoaded(true);
      window.sessionStorage.removeItem("emetsees-word-question-context");
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!historyLoaded) return;
    window.sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(exchanges));
  }, [exchanges, historyLoaded]);

  useEffect(() => {
    if (!exchanges.length) return;
    conversationEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [exchanges.length]);

  const activeContext = wordContext || readerContext;
  async function ask(questionOverride?: string) {
    const finalQuestion = (questionOverride || question).trim();
    if (!finalQuestion || pending) return;

    setQuestion(finalQuestion);
    setPending(true);
    setError("");

    try {
      const endpoint = wordContext ? "/api/emet/explain" : "/api/emet/ask";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: finalQuestion,
          requestId: crypto.randomUUID(),
          previousQuestions: exchanges
            .slice(-4)
            .map((exchange) => exchange.question),
          ...(activeContext ? { context: activeContext } : {}),
        }),
      });
      const payload = (await response.json()) as Record<string, unknown>;

      if (response.status === 401) {
        router.push("/auth?next=%2Femet");
        return;
      }
      if (response.status === 429) {
        const nextUsage = payload.usage as Partial<EmetChatUsage> | undefined;
        if (nextUsage) {
          setUsage((current) => ({
            planName: current?.planName || "Current plan",
            unlimited: nextUsage.unlimited ?? current?.unlimited ?? false,
            questionLimit: nextUsage.questionLimit ?? current?.questionLimit ?? 0,
            questionsUsed: nextUsage.questionsUsed ?? current?.questionsUsed ?? 0,
            questionsRemaining:
              nextUsage.questionsRemaining ?? current?.questionsRemaining ?? 0,
            resetsAt: nextUsage.resetsAt ?? current?.resetsAt,
          }));
        }
        setError("quota-exhausted");
        return;
      }
      if (!response.ok) {
        const answer = normalizeAnswer(payload);
        setError(answer.answer);
        return;
      }

      const answer = normalizeAnswer(payload);
      const nextUsage = payload.usage as Partial<EmetChatUsage> | undefined;
      if (nextUsage) {
        setUsage((current) => ({
          planName: current?.planName || "Current plan",
          unlimited: nextUsage.unlimited ?? current?.unlimited ?? false,
          questionLimit: nextUsage.questionLimit ?? current?.questionLimit ?? 0,
          questionsUsed: nextUsage.questionsUsed ?? current?.questionsUsed ?? 0,
          questionsRemaining:
            nextUsage.questionsRemaining ?? current?.questionsRemaining ?? 0,
          resetsAt: nextUsage.resetsAt ?? current?.resetsAt,
        }));
      }
      setExchanges((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          question: finalQuestion,
          answer,
          source: typeof payload.source === "string" ? payload.source : undefined,
        },
      ]);
      setQuestion("");
    } catch {
      setError("EMET could not connect. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function share(exchange: Exchange) {
    const references = exchange.answer.citations
      .map((citation) => citation.reference)
      .filter(Boolean)
      .join(" · ");
    const text = `${exchange.question}\n\n${exchange.answer.answer}${references ? `\n\nEvidence: ${references}` : ""}\n\nEMETSEES · https://emetsees.com`;

    if (navigator.share) {
      await navigator.share({ title: "EMETSEES answer", text });
    } else {
      await navigator.clipboard.writeText(text);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-6 border-y border-[var(--border)] py-4">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
            Reading context
          </p>
          <p className="mt-1 truncate text-sm font-semibold">
            {contextLabel(activeContext)}
          </p>
        </div>
        {usage ? (
          <div className="text-right">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
              {usage.planName}
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
              {usage.unlimited
                ? "Unlimited testing"
                : `${usage.questionsRemaining} of ${usage.questionLimit} left`}
            </p>
          </div>
        ) : null}
      </div>

      {wordContext ? (
        <button
          type="button"
          onClick={() => setWordContext(null)}
          className="mt-3 border-b border-[var(--border)] pb-0.5 text-xs font-semibold text-[var(--muted)]"
        >
          Ask without the selected word
        </button>
      ) : null}

      {exchanges.length ? (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setExchanges([]);
              setQuestion("");
              setError("");
              window.sessionStorage.removeItem(CHAT_STORAGE_KEY);
            }}
            className="border-b border-[var(--border)] pb-0.5 text-xs font-semibold text-[var(--muted)]"
          >
            New conversation
          </button>
        </div>
      ) : null}

      <div className="mt-6 space-y-6">
        {exchanges.map((exchange) => (
          <article key={exchange.id} className="border-b border-[var(--border)] pb-7">
            <div className="border-l-2 border-[var(--brand)] pl-4">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
                You asked
              </p>
              <p className="mt-1 text-base font-semibold leading-7">
                {exchange.question}
              </p>
            </div>
            <div className="mt-6">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--brand-strong)]">
                EMET answer
              </p>
              <p className="mt-3 whitespace-pre-wrap font-serif text-[1.08rem] leading-8">
                {exchange.answer.answer}
              </p>

              {exchange.answer.citations.length ? (
                <div className="mt-5 border-t border-[var(--border)] pt-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--muted)]">
                    Scripture evidence
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                    {exchange.answer.citations.map((citation) => {
                      const reference = citation.reference;
                      const href = reference ? referenceHref(reference) : null;
                      return href && reference ? (
                        <Link
                          key={`${exchange.id}-${citation.evidenceId}`}
                          href={href}
                          className="border-b border-[var(--brand)] pb-0.5 text-xs font-bold"
                        >
                          {reference}
                        </Link>
                      ) : null;
                    })}
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void share(exchange)}
                className="mt-5 border-b border-[var(--border)] pb-0.5 text-xs font-semibold text-[var(--muted)]"
              >
                Share this answer
              </button>
            </div>
          </article>
        ))}
        <div ref={conversationEndRef} aria-hidden="true" />
      </div>

      {error === "quota-exhausted" ? (
        <section role="alert" className="mt-5 border-y border-[var(--border)] py-4">
          <p className="text-sm font-bold">Your monthly questions are used.</p>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            Your {usage?.planName || "current plan"} allowance resets on {resetLabel(usage?.resetsAt)}.
          </p>
          <Link
            href="/settings#emet-plans"
            className="mt-3 inline-flex border-b-2 border-[var(--brand)] pb-0.5 text-sm font-bold"
          >
            See EMET plans
          </Link>
        </section>
      ) : error ? (
        <p role="alert" className="mt-5 border-l-2 border-amber-500 bg-amber-500/8 px-4 py-3 text-sm font-semibold leading-6">
          {error}
        </p>
      ) : null}

      <form
        className="sticky bottom-0 mt-5 border-t border-[var(--border)] bg-[var(--background)]/95 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl"
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        <label htmlFor="emet-question" className="sr-only">
          Ask EMET a Scripture question
        </label>
        <div className="flex items-end gap-3 border-b border-[var(--border)] bg-[var(--background)] py-2">
          <textarea
            id="emet-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={2}
            maxLength={800}
            placeholder={
              exchanges.length
                ? "Ask a follow-up…"
                : "Ask a Scripture question…"
            }
            disabled={pending || (usage ? !usage.unlimited && usage.questionsRemaining < 1 : false)}
            className="min-h-12 flex-1 resize-none bg-transparent px-0 py-2 text-base leading-7 outline-none placeholder:text-[var(--muted)]"
          />
          <button
            type="submit"
            disabled={pending || !question.trim() || (usage ? !usage.unlimited && usage.questionsRemaining < 1 : false)}
            className="mb-1 shrink-0 border-b-2 border-[var(--brand)] px-1 py-2 text-sm font-black text-[var(--foreground)] disabled:cursor-not-allowed disabled:border-[var(--border)] disabled:opacity-40"
          >
            {pending ? "Tracing…" : "Ask →"}
          </button>
        </div>
        <p className="mt-2 px-2 text-center text-[0.68rem] leading-5 text-[var(--muted)]">
          {exchanges.length
            ? "Continue naturally. Every reply is checked against Scripture evidence."
            : "Answers use supplied Scripture evidence only. Unsupported claims fail closed."}
        </p>
      </form>
    </div>
  );
}
