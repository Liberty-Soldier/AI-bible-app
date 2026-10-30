"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import EmetseesLogo from "@/app/components/branding/EmetseesLogo";
import { buildEmetConversationContext } from "@/app/lib/emet/EmetAiConversation";
import { buildReaderHref } from "@/app/lib/translationPreference";
import { boundedSimpleHistory, followsLatest, publicQualification, safeChatReturnHref, supportQualification } from "./chatPresentation";
import { buildScriptureCitationHref, getCitationTranslation } from "@/app/lib/scriptureCitationNavigation";
import type {
  EmetAiClaim,
  EmetAiClaimSupport,
  EmetAiComponentCheck,
  EmetAiContinuityCheck,
} from "@/app/lib/emet/EmetAiContract";

const CHAT_STORAGE_KEY = "emetsees-conversation";
const CHAT_ID_STORAGE_KEY = "emetsees-conversation-id";
const CHAT_DRAFT_KEY = "emetsees-conversation-draft";
const CHAT_SCROLL_KEY = "emetsees-conversation-scroll";

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
  status?: "complete" | "insufficient-evidence";
  answer: string;
  conclusionSupport: EmetAiClaimSupport;
  componentChecks: EmetAiComponentCheck[];
  claims: EmetAiClaim[];
  continuityChecks: EmetAiContinuityCheck[];
  sourceVerification?: "locked-corpus-text";
  citations: Array<{ evidenceId: string; reference?: string; text?: string; translation?: string; verification?: "locked-corpus-text" }>;
  limitations: string[];
};

type InitialScriptureItem = {
  id: string;
  reference: string;
  text: string;
  translation: "web" | "kjv" | "brenton";
};

function normalizedClaims(value: unknown): EmetAiClaim[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const claim = candidate as Partial<EmetAiClaim>;
    if (typeof claim.text !== "string" || !Array.isArray(claim.evidenceIds)) {
      return [];
    }
    return [{
      id: claim.id || `legacy-proposition-${index + 1}`,
      text: claim.text,
      support: claim.support || "possible-interpretation",
      category: claim.category || "other",
      polarity: claim.polarity || "affirms",
      scope: claim.scope || "the proposition as stated",
      timing: claim.timing || "uncertain",
      evidenceIds: claim.evidenceIds.filter(
        (item): item is string => typeof item === "string",
      ),
    }];
  });
}

type Exchange = {
  id: string;
  question: string;
  answer: Answer;
  source?: string;
  initialScripture?: InitialScriptureItem[];
  shareStudyId?: string;
  outcome?: "answered" | "insufficient-evidence" | "failed";
  transportFailure?: boolean;
};

function storedExchanges(storage: Storage, key = CHAT_STORAGE_KEY) {
  const parsed = parseStoredContext<unknown>(storage, key);
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
      outcome: exchange.outcome,
      transportFailure: exchange.transportFailure,
      answer: {
        status: exchange.answer.status,
        answer: exchange.answer.answer,
        conclusionSupport:
          exchange.answer.conclusionSupport || "possible-interpretation",
        componentChecks: Array.isArray(exchange.answer.componentChecks)
          ? exchange.answer.componentChecks
          : [],
        claims: normalizedClaims(exchange.answer.claims),
        continuityChecks: Array.isArray(exchange.answer.continuityChecks)
          ? exchange.answer.continuityChecks
          : [],
        sourceVerification: exchange.answer.sourceVerification === "locked-corpus-text" ? "locked-corpus-text" as const : undefined,
        citations: Array.isArray(exchange.answer.citations)
          ? exchange.answer.citations
          : [],
        limitations: Array.isArray(exchange.answer.limitations)
          ? exchange.answer.limitations
          : [],
      },
      source: exchange.source,
      initialScripture: Array.isArray(exchange.initialScripture)
        ? exchange.initialScripture.slice(0, 5).flatMap((item) =>
            item &&
            typeof item.id === "string" &&
            typeof item.reference === "string" &&
            typeof item.text === "string" &&
            ["web", "kjv", "brenton"].includes(item.translation)
              ? [item as InitialScriptureItem]
              : [],
          )
        : [],
      shareStudyId: typeof exchange.shareStudyId === "string" ? exchange.shareStudyId : undefined,
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
  if (!context) return "All Scripture";
  const reference = `${context.book} ${context.chapter}${context.verse ? `:${context.verse}` : ""}`;
  return "displayWord" in context
    ? `${context.displayWord} · ${reference}`
    : reference;
}

function normalizeAnswer(payload: Record<string, unknown>): Answer {
  if (payload.answer && typeof payload.answer === "object") {
    const value = payload.answer as Partial<Answer>;
    if (typeof value.answer === "string") {
      return {
        status: value.status,
        answer: value.answer,
        conclusionSupport:
          value.conclusionSupport || "possible-interpretation",
        componentChecks: Array.isArray(value.componentChecks)
          ? value.componentChecks
          : [],
        claims: normalizedClaims(value.claims),
        continuityChecks: Array.isArray(value.continuityChecks)
          ? value.continuityChecks
          : [],
        sourceVerification: value.sourceVerification === "locked-corpus-text" ? "locked-corpus-text" as const : undefined,
        citations: Array.isArray(value.citations) ? value.citations : [],
        limitations: [...new Set([...(Array.isArray(value.limitations) ? value.limitations : []), ...(Array.isArray(payload.limitations) ? payload.limitations.filter((item): item is string => typeof item === "string") : [])])],
      } as Answer;
    }
  }

  return {
    status: payload.status === "insufficient-evidence" ? "insufficient-evidence" : undefined,
    answer:
      typeof payload.answer === "string"
        ? payload.answer
        : "EMET could not produce a supported answer.",
    claims: [],
    componentChecks: [],
    continuityChecks: [],
    conclusionSupport: "does-not-establish",
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

function InitialScripture({
  items,
  pending,
  onNavigate,
}: {
  items: InitialScriptureItem[];
  pending: boolean;
  onNavigate?: () => void;
}) {
  return (
    <details key={pending ? "pending" : "finished"} open={pending ? true : undefined} className="text-sm" data-preliminary-scripture="true">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-[var(--muted)]">
        Preliminary passages{items.length ? ` · ${items.length}` : ""}{pending ? " · preparing answer" : ""}
      </summary>
      <p className="mb-2 text-xs leading-5 text-[var(--muted)]">
        Shown while preparing the answer. These are not final supporting citations; the final answer may use a different verified evidence set.
      </p>
      <div className="max-h-40 space-y-3 overflow-y-auto overscroll-contain border-l-2 border-[var(--border)] pl-3">
        {items.length ? items.map((item) => {
          const href = buildScriptureCitationHref(item);
          return (
            <div key={item.id}>
              <div className="flex flex-wrap items-baseline gap-2">
                {href ? <Link href={href} onClick={onNavigate} className="font-medium underline underline-offset-4">{item.reference}</Link> : <span className="font-medium">{item.reference}</span>}
                <span className="text-xs text-[var(--muted)]">{item.translation === "brenton" ? "Brenton LXX" : item.translation.toUpperCase()}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{item.text}</p>
            </div>
          );
        }) : <p className="text-sm text-[var(--muted)]">Finding relevant passages…</p>}
      </div>
    </details>
  );
}

function qualifications(answer: Answer) {
  const ids = [
    ...answer.claims.map((claim) => claim.id),
    ...answer.citations.map((citation) => citation.evidenceId),
    ...answer.componentChecks.map((check) => check.componentId),
    ...answer.continuityChecks.map((check) => check.propositionId),
  ];
  const messages = [
    supportQualification[answer.conclusionSupport],
    ...answer.limitations,
    ...answer.componentChecks.filter((check) => check.support !== "explicit-statement").map((check) => check.explanation),
    ...answer.continuityChecks.filter((check) => check.verdict !== "preserved").map((check) => check.explanation),
    ...answer.claims.filter((claim) => ["possible-interpretation", "does-not-establish"].includes(claim.support))
      .map((claim) => `${claim.support === "possible-interpretation" ? "Interpretation" : "Not established"}: ${claim.text}`),
  ];
  return [...new Set(messages.filter((message): message is string => typeof message === "string" && Boolean(message.trim()))
    .map((message) => publicQualification(message, ids)))];
}

export default function EmetChat({
  initialUsage,
  initialQuestion = "",
  initialSimpleAvailable = false,
  active = true,
  launchKey = 0,
  returnTo,
  onClose,
}: {
  initialUsage: EmetChatUsage | null;
  initialQuestion?: string;
  initialSimpleAvailable?: boolean;
  active?: boolean;
  launchKey?: number;
  returnTo?: string | null;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [engine, setEngine] = useState<"current" | "simple">("current");
  const chatStorageKey = engine === "simple" ? "emetsees-simple-conversation" : CHAT_STORAGE_KEY;
  const chatIdStorageKey = engine === "simple" ? "emetsees-simple-conversation-id" : CHAT_ID_STORAGE_KEY;
  const draftStorageKey = engine === "simple" ? "emetsees-simple-conversation-draft" : CHAT_DRAFT_KEY;
  const scrollStorageKey = engine === "simple" ? "emetsees-simple-conversation-scroll" : CHAT_SCROLL_KEY;
  const [question, setQuestion] = useState("");
  const [readerContext, setReaderContext] = useState<ReaderContext | null>(null);
  const [useReaderContext, setUseReaderContext] = useState(false);
  const [wordContext, setWordContext] = useState<WordContext | null>(null);
  const [usage, setUsage] = useState(initialUsage);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [conversationId, setConversationId] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [pendingStatus, setPendingStatus] = useState("Searching Scripture…");
  const [initialScripture, setInitialScripture] = useState<InitialScriptureItem[]>([]);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const scrollRestoredRef = useRef(false);
  const savedScrollRef = useRef<{ conversationId: string; top: number; following: boolean } | null>(null);
  const draftRef = useRef("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submissionInFlightRef = useRef(false);
  const initialSubmissionRef = useRef<string | null>(null);
  const progressiveRequestRef = useRef("");
  const pendingInitialScriptureRef = useRef<InitialScriptureItem[]>([]);

  function changeEngine(next: "current" | "simple") {
    if (submissionInFlightRef.current || !historyLoaded || next === engine || (next === "simple" && !initialSimpleAvailable)) return;
    window.sessionStorage.setItem(chatStorageKey, JSON.stringify(exchanges));
    window.sessionStorage.setItem(draftStorageKey, draftRef.current);
    const prefix = next === "simple" ? "emetsees-simple-conversation" : "emetsees-conversation";
    const nextId = window.sessionStorage.getItem(`${prefix}-id`) || crypto.randomUUID();
    window.sessionStorage.setItem(`${prefix}-id`, nextId);
    const draft = window.sessionStorage.getItem(`${prefix}-draft`) || "";
    draftRef.current = draft;
    setEngine(next);
    setQuestion(draft);
    setExchanges(storedExchanges(window.sessionStorage, prefix));
    setConversationId(nextId);
    savedScrollRef.current = parseStoredContext(window.sessionStorage, `${prefix}-scroll`);
    scrollRestoredRef.current = false;
    followingRef.current = true;
    setError("");
    setInitialScripture([]);
    pendingInitialScriptureRef.current = [];
  }

  const revokeSimpleSelection = useEffectEvent(() => changeEngine("current"));
  useEffect(() => {
    if (!initialSimpleAvailable && engine === "simple" && !pending) revokeSimpleSelection();
  }, [initialSimpleAvailable, engine, pending]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const draft = window.sessionStorage.getItem(CHAT_DRAFT_KEY) || "";
      draftRef.current = draft;
      setQuestion(draft);
      savedScrollRef.current = parseStoredContext(window.sessionStorage, CHAT_SCROLL_KEY);
      setExchanges(storedExchanges(window.sessionStorage, CHAT_STORAGE_KEY));
      const storedConversationId = window.sessionStorage.getItem(
        CHAT_ID_STORAGE_KEY,
      );
      const nextConversationId = storedConversationId || crypto.randomUUID();
      window.sessionStorage.setItem(CHAT_ID_STORAGE_KEY, nextConversationId);
      setConversationId(nextConversationId);
      setHistoryLoaded(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!historyLoaded) return;
    window.sessionStorage.setItem(chatStorageKey, JSON.stringify(exchanges));
  }, [exchanges, historyLoaded, chatStorageKey]);

  useEffect(() => { setUsage(initialUsage); }, [initialUsage]);

  useEffect(() => {
    if (!active) return;
    const reader = parseStoredContext<ReaderContext>(window.localStorage, "bibleiq-current-context");
    const word = parseStoredContext<WordContext>(window.sessionStorage, "emetsees-word-question-context");
    setReaderContext(reader);
    setWordContext(word);
    if (word) setUseReaderContext(false);
    window.sessionStorage.removeItem("emetsees-word-question-context");
  }, [active, launchKey]);

  useEffect(() => {
    if (historyLoaded) window.sessionStorage.setItem(draftStorageKey, question);
  }, [question, historyLoaded, draftStorageKey]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!active || !historyLoaded || !viewport) return;
    if (!scrollRestoredRef.current) {
      const saved = savedScrollRef.current;
      if (saved?.conversationId === conversationId && !saved.following) {
        viewport.scrollTop = saved.top;
        followingRef.current = false;
      } else viewport.scrollTop = viewport.scrollHeight;
      scrollRestoredRef.current = true;
    } else if (followingRef.current) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [active, historyLoaded, conversationId, exchanges.length, pending, initialScripture, error]);

  useEffect(() => {
    const root = rootRef.current;
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!active || !root || !viewport) return;
    const visualViewport = window.visualViewport;
    function resize() {
      if (!root || !viewport) return;
      const keyboardOpen = visualViewport && window.innerHeight - visualViewport.height > 80;
      root.style.height = keyboardOpen
        ? `${Math.max(0, visualViewport.offsetTop + visualViewport.height - root.getBoundingClientRect().top)}px`
        : "";
      if (followingRef.current) viewport.scrollTop = viewport.scrollHeight;
    }
    resize();
    visualViewport?.addEventListener("resize", resize);
    visualViewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      if (followingRef.current) viewport.scrollTop = viewport.scrollHeight;
    }) : null;
    if (content) observer?.observe(content);
    observer?.observe(viewport);
    return () => {
      visualViewport?.removeEventListener("resize", resize);
      visualViewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      observer?.disconnect();
      root.style.height = "";
    };
  }, [active]);

  function updateQuestion(value: string) {
    draftRef.current = value;
    setQuestion(value);
    if (historyLoaded) window.sessionStorage.setItem(draftStorageKey, value);
  }

  function restoreSubmittedQuestion(value: string) {
    if (!draftRef.current) updateQuestion(value);
  }

  useEffect(() => {
    if (!pending || engine === "simple") return;
    const readingTimer = window.setTimeout(
      () => setPendingStatus("Reading the relevant passages…"),
      3500,
    );
    const verificationTimer = window.setTimeout(
      () => setPendingStatus("Verifying the answer…"),
      9500,
    );
    return () => {
      window.clearTimeout(readingTimer);
      window.clearTimeout(verificationTimer);
    };
  }, [pending, engine]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [question]);

  // A remembered reading position is a convenience, not an implicit scope.
  // Word-study launches are explicit; ordinary Ask EMET questions default to
  // the whole canon unless the reader opts into the displayed verse.
  const activeContext = wordContext || (useReaderContext ? readerContext : null);
  const backHref = safeChatReturnHref(returnTo) || (readerContext
    ? buildReaderHref({ book: readerContext.book, chapter: readerContext.chapter, verse: readerContext.verse, translation: readerContext.translation })
    : "/");
  const conversationHref = backHref === "/" ? "/emet" : `/emet?returnTo=${encodeURIComponent(backHref)}`;

  async function ask(questionOverride?: string) {
    const finalQuestion = (questionOverride || question).trim();
    if (!finalQuestion || pending || submissionInFlightRef.current) return;

    submissionInFlightRef.current = true;
    if (questionOverride === undefined) updateQuestion("");
    setPendingQuestion(finalQuestion);
    setPendingStatus(engine === "simple" ? "Preparing Simple EMET answer…" : "Searching Scripture…");
    setInitialScripture([]);
    pendingInitialScriptureRef.current = [];
    setPending(true);
    setError("");

    try {
      const activeConversationId = conversationId || crypto.randomUUID();
      if (!conversationId) {
        window.sessionStorage.setItem(
          chatIdStorageKey,
          activeConversationId,
        );
        setConversationId(activeConversationId);
      }
      const conversationContext = buildEmetConversationContext(
        exchanges.filter((exchange) => !exchange.transportFailure).map((exchange) => ({
          question: exchange.question,
          answer: exchange.answer.answer,
          outcome: exchange.source === "fail-closed" ? "failed" : "answered",
          references: exchange.answer.citations
            .map((citation) => citation.reference || "")
            .filter(Boolean),
          claims: exchange.answer.claims.map((claim) => ({
            id: claim.id,
            text: claim.text,
            support: claim.support,
            category: claim.category,
            polarity: claim.polarity,
            scope: claim.scope,
            timing: claim.timing,
            references: claim.evidenceIds
              .flatMap((evidenceId) =>
                exchange.answer.citations
                  .filter((citation) => citation.evidenceId === evidenceId)
                  .map((citation) => citation.reference || ""),
              )
              .filter(Boolean),
          })),
        })),
      );
      const sharedRequest = {
        question: finalQuestion,
        conversation: conversationContext,
        ...(activeContext ? { context: activeContext } : {}),
        ...(engine === "simple" ? {
          engine: "simple",
          simpleHistory: boundedSimpleHistory(exchanges.filter((exchange) => !exchange.transportFailure)
            .map((exchange) => ({ question: exchange.question, answer: exchange.answer.answer }))),
        } : {}),
      };
      const progressiveToken = crypto.randomUUID();
      progressiveRequestRef.current = progressiveToken;
      if (!wordContext && engine === "current") {
        void fetch("/api/emet/evidence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sharedRequest),
        }).then(async (initialResponse) => {
          if (!initialResponse.ok) return null;
          return await initialResponse.json() as {
            status?: string;
            items?: InitialScriptureItem[];
          };
        }).then((initialPayload) => {
          if (progressiveRequestRef.current !== progressiveToken) return;
          const items = initialPayload?.status === "ready" && Array.isArray(initialPayload.items)
            ? initialPayload.items.slice(0, 5)
            : [];
          pendingInitialScriptureRef.current = items;
          setInitialScripture(items);
          setPendingStatus(items.length ? "Analyzing these passages…" : "Finding relevant passages…");
        }).catch(() => {
          if (progressiveRequestRef.current === progressiveToken) {
            setPendingStatus("Finding relevant passages…");
          }
        });
      } else {
        setPendingStatus("Finding relevant passages…");
      }

      const endpoint = wordContext && engine === "current" ? "/api/emet/explain" : "/api/emet/ask";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...sharedRequest,
          requestId: crypto.randomUUID(),
          conversationId: activeConversationId,
        }),
      });
      const payload = (await response.json()) as Record<string, unknown>;

      if (response.status === 401) {
        restoreSubmittedQuestion(finalQuestion);
        router.push(`/auth?next=${encodeURIComponent(`/emet?returnTo=${encodeURIComponent(backHref)}`)}`);
        return;
      }
      if (response.status === 429 && payload.status === "rate-limited") {
        setError("Please wait a few seconds before testing another Simple EMET question.");
        restoreSubmittedQuestion(finalQuestion);
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
        restoreSubmittedQuestion(finalQuestion);
        return;
      }
      if (!response.ok) {
        const answer = normalizeAnswer(payload);
        setExchanges((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            question: finalQuestion,
            answer,
            outcome: payload.status === "insufficient-evidence" || answer.status === "insufficient-evidence" || response.status === 422 ? "insufficient-evidence" : "failed",
            source: typeof payload.source === "string" ? payload.source : "fail-closed",
            initialScripture: pendingInitialScriptureRef.current,
          },
        ]);
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
          outcome: answer.status === "insufficient-evidence" || payload.status === "insufficient-evidence" ? "insufficient-evidence" : "answered",
          source: typeof payload.source === "string" ? payload.source : undefined,
          initialScripture: pendingInitialScriptureRef.current,
          shareStudyId: typeof payload.shareStudyId === "string" ? payload.shareStudyId : undefined,
        },
      ]);
    } catch {
      setExchanges((current) => [...current, {
        id: crypto.randomUUID(),
        question: finalQuestion,
        answer: normalizeAnswer({ answer: "EMET could not connect. Please try again." }),
        source: "fail-closed",
        outcome: "failed",
        transportFailure: true,
        initialScripture: pendingInitialScriptureRef.current,
      }]);
      restoreSubmittedQuestion(finalQuestion);
    } finally {
      progressiveRequestRef.current = "";
      setPendingQuestion("");
      setPending(false);
      submissionInFlightRef.current = false;
    }
  }

  const launchInitialQuestion = useEffectEvent((value: string) => {
    void ask(value);
  });

  useEffect(() => {
    const launchQuestion = initialQuestion.trim().slice(0, 800);
    const submissionKey = `${launchKey}:${launchQuestion}`;
    if (!active || pending || !historyLoaded || !launchQuestion || initialSubmissionRef.current === submissionKey) return;
    initialSubmissionRef.current = submissionKey;
    if (window.location.pathname === "/emet") {
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    launchInitialQuestion(launchQuestion);
  }, [active, pending, historyLoaded, initialQuestion, launchKey]);

  async function share(exchange: Exchange) {
    if (!exchange.shareStudyId) return;
    const response = await fetch("/api/emet/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studyId: exchange.shareStudyId }),
    });
    if (!response.ok) throw new Error("Study publication failed.");
    const payload = await response.json() as { path: string };
    const url = new URL(payload.path, window.location.origin).toString();
    const references = exchange.answer.citations
      .map((citation) => citation.reference)
      .filter(Boolean)
      .join(" · ");
    const text = `${exchange.question}\n\n${exchange.answer.answer}${references ? `\n\nEvidence: ${references}` : ""}`;

    if (navigator.share) {
      await navigator.share({ title: exchange.question, text, url });
    } else {
      await navigator.clipboard.writeText(url);
    }
  }

  const quotaExhausted = usage ? !usage.unlimited && usage.questionsRemaining < 1 : false;

  function resetConversation() {
    if (submissionInFlightRef.current || !historyLoaded) return;
    setExchanges([]);
    updateQuestion("");
    setError("");
    setInitialScripture([]);
    pendingInitialScriptureRef.current = [];
    window.sessionStorage.removeItem(chatStorageKey);
    const nextConversationId = crypto.randomUUID();
    window.sessionStorage.setItem(chatIdStorageKey, nextConversationId);
    setConversationId(nextConversationId);
    followingRef.current = true;
    savedScrollRef.current = null;
  }

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col bg-[var(--canvas)] text-[var(--foreground)]" data-emet-chat="true">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 border-b border-[var(--border)] px-4 pb-1 pt-[max(0.25rem,env(safe-area-inset-top))] sm:px-6">
        <h1 className="flex min-h-11 items-center gap-2 text-base font-semibold">
          <EmetseesLogo size={20} variant="gold" />
          Ask EMET
        </h1>
        <div className="flex items-center gap-1">
          <button type="button" disabled={pending || !historyLoaded} onClick={resetConversation} className="min-h-11 rounded-lg px-2 text-sm text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50">New conversation</button>
          {onClose ? (
            <button type="button" onClick={onClose} aria-label="Close Ask EMET" className="min-h-11 rounded-lg px-2 text-sm font-medium">Close</button>
          ) : (
            <Link href={backHref} className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium">Back</Link>
          )}
        </div>
      </header>

      {initialSimpleAvailable ? (
        <label className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-1 text-xs text-[var(--muted)] sm:px-6">
          Owner testing
          <select aria-label="Owner testing engine" value={engine} disabled={pending || !historyLoaded} onChange={(event) => changeEngine(event.target.value === "simple" ? "simple" : "current")} className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2 text-sm text-[var(--foreground)]">
            <option value="current">Current EMET</option>
            <option value="simple">Simple EMET · experimental</option>
          </select>
          {engine === "simple" ? <span>Private owner test · not published</span> : null}
        </label>
      ) : null}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 px-4 py-1 text-xs text-[var(--muted)] sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2">
          <span className="break-words">{contextLabel(activeContext)}</span>
          {activeContext ? (
            <button type="button" aria-label={`Remove ${contextLabel(activeContext)} context`} onClick={() => {
              if (wordContext) setWordContext(null);
              else setUseReaderContext(false);
            }} className="min-h-11 px-2 text-sm">Clear</button>
          ) : readerContext ? (
            <button type="button" onClick={() => setUseReaderContext(true)} className="min-h-11 px-1 text-xs underline underline-offset-4">Use {contextLabel(readerContext)}</button>
          ) : null}
        </div>
        {usage ? (
          <details>
            <summary className="min-h-11 cursor-pointer py-3">Usage</summary>
            <p className="pb-2">{usage.planName} · {usage.unlimited ? "Unlimited" : `${usage.questionsRemaining} of ${usage.questionLimit} left`}</p>
          </details>
        ) : null}
      </div>

      <div
        ref={viewportRef}
        role="region"
        aria-label="Conversation"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 focus-visible:outline-2 focus-visible:outline-[var(--brand)] sm:px-6"
        style={{ overflowAnchor: "none" }}
        onScroll={(event) => {
          if (!active) return;
          const viewport = event.currentTarget;
          followingRef.current = followsLatest(viewport);
          if (historyLoaded) window.sessionStorage.setItem(scrollStorageKey, JSON.stringify({ conversationId, top: viewport.scrollTop, following: followingRef.current }));
        }}
        onPointerDownCapture={(event) => {
          if (event.target instanceof Element && event.target.closest("details")) followingRef.current = false;
        }}
        onKeyDownCapture={(event) => {
          if (["Enter", " "].includes(event.key) && event.target instanceof Element && event.target.closest("details")) followingRef.current = false;
        }}
      >
        <div ref={contentRef} className="space-y-6">
          {!exchanges.length && !pending ? (
            <div className="py-8 text-center">
              <p className="text-lg font-medium">What would you like to understand?</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Ask naturally. Inspect the Scripture behind each answer.</p>
            </div>
          ) : null}

          {exchanges.map((exchange) => {
            const outcome = exchange.outcome || (exchange.answer.status === "insufficient-evidence" ? "insufficient-evidence" : exchange.source === "fail-closed" ? "failed" : "answered");
            const notes = qualifications(exchange.answer);
            const simpleSources = exchange.source === "simple-owner-model" || exchange.answer.sourceVerification === "locked-corpus-text";
            return (
              <article key={exchange.id} className="space-y-3" aria-label="Question and response">
                <div className="flex justify-end">
                  <p className="max-w-[90%] whitespace-pre-wrap break-words rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-base leading-7"><span className="sr-only">Question: </span>{exchange.question}</p>
                </div>
                {exchange.initialScripture?.length ? <InitialScripture items={exchange.initialScripture} pending={false} onNavigate={onClose} /> : null}
                <div className="min-w-0 space-y-3">
                  {outcome !== "answered" ? (
                    <p role={outcome === "failed" ? "alert" : "status"} className="text-sm font-semibold">{outcome === "insufficient-evidence" ? "Insufficient evidence" : "Answer unavailable"}</p>
                  ) : null}
                  <div aria-label="EMET response" className="whitespace-pre-wrap break-words text-base leading-7" data-emet-answer="true">{exchange.answer.answer}</div>
                  {notes.length ? (
                    <section aria-label="Answer qualifications" className="border-l-2 border-[var(--border)] pl-3 text-sm leading-6 text-[var(--muted)]">
                      <p className="font-medium">Qualifications</p>
                      <ul className="mt-1 space-y-1">
                        {notes.map((note, index) => <li key={index} className="whitespace-pre-wrap break-words">{note}</li>)}
                      </ul>
                    </section>
                  ) : null}
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-1 text-sm">
                    {exchange.answer.citations.length ? (
                      <details className="group">
                        <summary className="min-h-11 cursor-pointer py-3 font-medium text-[var(--muted)]">{simpleSources ? "Scripture passages" : "Sources"} · {exchange.answer.citations.length}</summary>
                        <p className="mb-1 text-xs text-[var(--muted)]">{simpleSources ? "Passage text is checked against the stated translation. The explanation is model-generated; these checks do not verify every inference or unattributed quotation." : "Final supporting citations"}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 pb-2">
                          {exchange.answer.citations.map((citation) => {
                            const reference = citation.reference;
                            const translation = getCitationTranslation(citation);
                            const href = buildScriptureCitationHref(citation, { returnTo: conversationHref, returnLabel: "Ask EMET" });
                            if (simpleSources && citation.verification === "locked-corpus-text" && typeof citation.text === "string" && href && reference) {
                              return (
                                <div key={`${exchange.id}-${citation.evidenceId}`} className="w-full space-y-1 pb-3">
                                  <Link href={href} onClick={onClose} className="inline-flex min-h-11 items-center gap-x-1 underline decoration-[var(--brand)] underline-offset-4">
                                    {reference}<span className="text-xs text-[var(--muted)]">· {translation === "brenton" ? "Brenton" : translation?.toUpperCase()}</span>
                                  </Link>
                                  <blockquote className="whitespace-pre-wrap break-words leading-6">{citation.text}</blockquote>
                                </div>
                              );
                            }
                            return href && reference ? (
                              <Link key={`${exchange.id}-${citation.evidenceId}`} href={href} onClick={onClose} className="inline-flex min-h-11 flex-wrap items-center gap-x-1 underline decoration-[var(--brand)] underline-offset-4">
                                {reference}{translation ? <span className="text-xs text-[var(--muted)]">· {translation === "brenton" ? "Brenton" : translation.toUpperCase()}</span> : null}
                              </Link>
                            ) : reference ? <span key={`${exchange.id}-${citation.evidenceId}`} className="py-3">{reference}</span> : null;
                          })}
                        </div>
                      </details>
                    ) : null}
                    {exchange.shareStudyId ? (
                      <button type="button" aria-label="Publish and share this answer" onClick={() => {
                        void share(exchange).catch((error: unknown) => {
                          if (!(error instanceof DOMException && error.name === "AbortError")) setError("Sharing could not be completed. Please try again.");
                        });
                      }} className="min-h-11 px-1 text-[var(--muted)]">Share</button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}

          {pending && pendingQuestion ? (
            <article className="space-y-3" aria-label="Pending question">
              <div className="flex justify-end">
                <p className="max-w-[90%] whitespace-pre-wrap break-words rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-base leading-7">{pendingQuestion}</p>
              </div>
              {engine === "current" ? <InitialScripture items={initialScripture} pending onNavigate={onClose} /> : null}
            </article>
          ) : null}
          {!pending && error === "quota-exhausted" && initialScripture.length ? <InitialScripture items={initialScripture} pending={false} onNavigate={onClose} /> : null}
          {error === "quota-exhausted" ? (
            <section role="alert" className="text-sm leading-6">
              <p className="font-medium">Your monthly questions are used.</p>
              <p className="mt-1 text-[var(--muted)]">Your {usage?.planName || "current plan"} allowance resets on {resetLabel(usage?.resetsAt)}.</p>
              <Link href="/settings#emet-plans" onClick={onClose} className="inline-flex min-h-11 items-center underline underline-offset-4">See EMET plans</Link>
            </section>
          ) : error ? <p role="alert" className="text-sm leading-6">{error}</p> : null}
        </div>
      </div>

      <form
        className="shrink-0 border-t border-[var(--border)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6"
        aria-busy={pending}
        onSubmit={(event) => { event.preventDefault(); void ask(); }}
      >
        {pending ? <p role="status" className="mb-2 text-xs leading-5 text-[var(--muted)]">{pendingStatus} You can draft a follow-up.</p> : null}
        <label htmlFor="emet-question" className="sr-only">Ask EMET a Scripture question</label>
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 pl-3 focus-within:border-[var(--brand)]">
          <textarea
            ref={textareaRef}
            id="emet-question"
            value={question}
            onChange={(event) => updateQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            maxLength={800}
            placeholder={pending || exchanges.length ? "Ask a follow-up…" : "Ask a Scripture question…"}
            disabled={!historyLoaded}
            className="max-h-40 min-h-11 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-2.5 text-base leading-6 outline-none placeholder:text-[var(--muted)]"
          />
          <button type="submit" aria-label={pending ? "EMET is preparing an answer" : "Send question"} disabled={!historyLoaded || pending || !question.trim() || quotaExhausted} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--foreground)] text-lg text-[var(--canvas)] disabled:cursor-not-allowed disabled:opacity-30">
            {pending ? <span aria-hidden="true" className="h-3 w-3 animate-pulse rounded-full bg-current" /> : <span aria-hidden="true">↑</span>}
          </button>
        </div>
        <p className="mt-1 hidden text-center text-xs leading-5 text-[var(--muted)] pointer-fine:block">Enter to send · Shift+Enter for a new line</p>
      </form>
    </div>
  );
}
