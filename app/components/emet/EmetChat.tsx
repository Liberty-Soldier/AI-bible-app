"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
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
  verificationStatus?: "references-verified" | "unverified";
  unresolvedReferences?: Array<{ reference: string; translation?: string; reason: string }>;
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
        ...simpleInspection(exchange.answer),
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

function simpleInspection(value: Partial<Answer>) {
  return {
    verificationStatus: value.verificationStatus === "unverified" ? "unverified" as const : value.verificationStatus === "references-verified" ? "references-verified" as const : undefined,
    unresolvedReferences: Array.isArray(value.unresolvedReferences) ? value.unresolvedReferences.slice(0, 17)
      .filter((item) => item && typeof item.reference === "string" && typeof item.reason === "string")
      .map((item) => ({ reference: item.reference.slice(0, 160), reason: item.reason.slice(0, 64), translation: typeof item.translation === "string" ? item.translation.slice(0, 32) : undefined })) : [],
  };
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
        ...simpleInspection(value),
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
      <p className="mb-1 text-xs leading-5 text-[var(--muted)]">
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

function qualifications(answer: Answer, simple = false) {
  const ids = [
    ...answer.claims.map((claim) => claim.id),
    ...answer.citations.map((citation) => citation.evidenceId),
    ...answer.componentChecks.map((check) => check.componentId),
    ...answer.continuityChecks.map((check) => check.propositionId),
  ];
  const messages = [
    // Simple EMET already discloses the scope of source verification. Avoid
    // adding a generic inference/synthesis disclaimer to every supported answer;
    // retain all supplied limitations and genuine uncertainty categories.
    ...(simple && ["strong-implication", "theological-synthesis"].includes(answer.conclusionSupport) ? [] : [supportQualification[answer.conclusionSupport]]),
    ...answer.limitations,
    ...answer.componentChecks.filter((check) => check.support !== "explicit-statement").map((check) => check.explanation),
    ...answer.continuityChecks.filter((check) => check.verdict !== "preserved").map((check) => check.explanation),
    ...answer.claims.filter((claim) => ["possible-interpretation", "does-not-establish"].includes(claim.support))
      .map((claim) => `${claim.support === "possible-interpretation" ? "Interpretation" : "Not established"}: ${claim.text}`),
  ];
  return [...new Set(messages.filter((message): message is string => typeof message === "string" && Boolean(message.trim()))
    .map((message) => publicQualification(message, ids)))];
}

type ChatReadingPosition = { anchor: string | null; offset: number; top: number };
const chatAnchors = (viewport: HTMLElement) => Array.from(viewport.querySelectorAll<HTMLElement>("[data-emet-scroll-anchor]"));
const chatAnchor = (viewport: HTMLElement, key: string) => chatAnchors(viewport).find((node) => node.dataset.emetScrollAnchor === key);

function readingPosition(viewport: HTMLElement): ChatReadingPosition {
  const top = viewport.getBoundingClientRect().top;
  const anchors = chatAnchors(viewport).map((node) => ({ node, rect: node.getBoundingClientRect() }));
  // Prefer the response over its containing question when reading inside it.
  const visible = [...anchors].reverse().find(({ rect }) => rect.top <= top + 1 && rect.bottom > top + 1)
    || anchors.find(({ rect }) => rect.bottom > top + 1);
  return { anchor: visible?.node.dataset.emetScrollAnchor || null, offset: visible ? visible.rect.top - top : 0, top: viewport.scrollTop };
}

export default function EmetChat({
  initialUsage,
  initialQuestion = "",
  initialEngine = "simple",
  initialOwnerDiagnostics = false,
  active = true,
  launchKey = 0,
  returnTo,
  onClose,
}: {
  initialUsage: EmetChatUsage | null;
  initialQuestion?: string;
  initialEngine?: "simple" | "current";
  initialOwnerDiagnostics?: boolean;
  active?: boolean;
  launchKey?: number;
  returnTo?: string | null;
  onClose?: () => void;
}) {
  const router = useRouter();
  const engine = initialEngine;
  // Storage follows the conversation, not a deployment's engine selection. A
  // rollback therefore keeps the current thread, draft and reading position.
  const [historyPrefix, setHistoryPrefix] = useState(CHAT_STORAGE_KEY);
  const chatStorageKey = historyPrefix;
  const chatIdStorageKey = `${historyPrefix}-id`;
  const draftStorageKey = `${historyPrefix}-draft`;
  const scrollStorageKey = `${historyPrefix}-scroll`;
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
  const [pendingExchangeId, setPendingExchangeId] = useState("");
  const [pendingStatus, setPendingStatus] = useState("Searching Scripture…");
  const [initialScripture, setInitialScripture] = useState<InitialScriptureItem[]>([]);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const scrollRestoredRef = useRef(false);
  const savedScrollRef = useRef<{ conversationId: string; top: number; following: boolean; anchor?: string | null; offset?: number } | null>(null);
  const readingPositionRef = useRef<ChatReadingPosition | null>(null);
  const expectedScrollTopRef = useRef<number | null>(null);
  const arrivingRef = useRef<{ id: string; reveal: boolean; pendingShown: boolean } | null>(null);
  const draftRef = useRef("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submissionInFlightRef = useRef(false);
  const initialSubmissionRef = useRef<string | null>(null);
  const progressiveRequestRef = useRef("");
  const pendingInitialScriptureRef = useRef<InitialScriptureItem[]>([]);

  const setConversationTop = useCallback((top: number) => {
    const viewport = viewportRef.current;
    if (!viewport || Math.abs(viewport.scrollTop - top) < 0.5) return;
    viewport.scrollTop = Math.max(0, top);
    expectedScrollTopRef.current = viewport.scrollTop;
  }, []);

  const rememberReadingPosition = useCallback(() => {
    const viewport = viewportRef.current;
    if (!active || !historyLoaded || !viewport) return;
    const position = readingPosition(viewport);
    readingPositionRef.current = position;
    window.sessionStorage.setItem(scrollStorageKey, JSON.stringify({ conversationId, ...position, following: followingRef.current }));
  }, [active, historyLoaded, conversationId, scrollStorageKey]);

  const preserveReadingPosition = useCallback(() => {
    const viewport = viewportRef.current;
    if (!active || !viewport) return;
    const saved = readingPositionRef.current;
    const anchor = saved?.anchor ? chatAnchor(viewport, saved.anchor) : null;
    if (anchor && saved) {
      const offset = anchor.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
      setConversationTop(viewport.scrollTop + offset - saved.offset);
    } else if (saved) setConversationTop(saved.top);
    rememberReadingPosition();
  }, [active, rememberReadingPosition, setConversationTop]);

  const revealResponse = useCallback((id: string, pendingOnly = false) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const questionAnchor = chatAnchor(viewport, `${id}:question`);
    const responseAnchor = chatAnchor(viewport, `${id}:answer`);
    const top = viewport.getBoundingClientRect().top;
    const questionTop = questionAnchor?.getBoundingClientRect().top;
    const responseTop = responseAnchor?.getBoundingClientRect().top;
    const keepQuestion = questionTop !== undefined && (pendingOnly || responseTop === undefined || responseTop - questionTop <= Math.max(0, viewport.clientHeight - 120));
    const target = keepQuestion ? questionTop : responseTop;
    if (target !== undefined) setConversationTop(viewport.scrollTop + target - top - 8);
  }, [setConversationTop]);

  function pauseFollowing() {
    followingRef.current = false;
    expectedScrollTopRef.current = null;
    if (arrivingRef.current) arrivingRef.current.reveal = false;
    rememberReadingPosition();
  }

  useEffect(() => {
    if (historyLoaded) return;
    const timer = window.setTimeout(() => {
      // Preserve existing owner test conversations without merging unrelated
      // threads or deleting the public conversation kept in its original key.
      const prefix = initialOwnerDiagnostics && storedExchanges(window.sessionStorage, "emetsees-simple-conversation").length
        ? "emetsees-simple-conversation" : CHAT_STORAGE_KEY;
      setHistoryPrefix(prefix);
      const draft = window.sessionStorage.getItem(`${prefix}-draft`) || "";
      draftRef.current = draft;
      setQuestion(draft);
      savedScrollRef.current = parseStoredContext(window.sessionStorage, `${prefix}-scroll`);
      setExchanges(storedExchanges(window.sessionStorage, prefix));
      const storedConversationId = window.sessionStorage.getItem(
        `${prefix}-id`,
      );
      const nextConversationId = storedConversationId || crypto.randomUUID();
      window.sessionStorage.setItem(`${prefix}-id`, nextConversationId);
      setConversationId(nextConversationId);
      setHistoryLoaded(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [initialOwnerDiagnostics, historyLoaded]);

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

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!active || !historyLoaded || !viewport) return;
    if (!scrollRestoredRef.current) {
      const saved = savedScrollRef.current;
      if (saved?.conversationId === conversationId) {
        setConversationTop(Number.isFinite(saved.top) ? saved.top : 0);
        followingRef.current = saved.following;
        if (saved.anchor && typeof saved.offset === "number") {
          readingPositionRef.current = { anchor: saved.anchor, offset: saved.offset, top: saved.top };
          preserveReadingPosition();
        }
      } else if (exchanges.length) revealResponse(exchanges[exchanges.length - 1].id);
      else setConversationTop(0);
      scrollRestoredRef.current = true;
      rememberReadingPosition();
    }
    const arriving = arrivingRef.current;
    if (arriving && !pending) {
      if (arriving.reveal && exchanges.some((exchange) => exchange.id === arriving.id)) revealResponse(arriving.id);
      else preserveReadingPosition();
      arrivingRef.current = null; // One reveal per response; later disclosures only preserve position.
    } else if (arriving && pending && !arriving.pendingShown) {
      if (arriving.reveal) revealResponse(arriving.id, true);
      arriving.pendingShown = true;
    } else preserveReadingPosition();
    rememberReadingPosition();
  }, [active, historyLoaded, conversationId, exchanges, pending, initialScripture, error, preserveReadingPosition, rememberReadingPosition, revealResponse, setConversationTop]);

  useEffect(() => {
    const root = rootRef.current;
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!active || !root || !viewport) return;
    const visualViewport = window.visualViewport;
    function resize() {
      if (!root) return;
      const keyboardOpen = visualViewport && window.innerHeight - visualViewport.height > 80;
      root.style.height = keyboardOpen
        ? `${Math.max(0, visualViewport.offsetTop + visualViewport.height - root.getBoundingClientRect().top)}px`
        : "";
      preserveReadingPosition();
    }
    resize();
    visualViewport?.addEventListener("resize", resize);
    visualViewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(preserveReadingPosition) : null;
    if (content) observer?.observe(content);
    observer?.observe(viewport);
    return () => {
      visualViewport?.removeEventListener("resize", resize);
      visualViewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      observer?.disconnect();
      root.style.height = "";
    };
  }, [active, preserveReadingPosition]);

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

    const exchangeId = crypto.randomUUID();
    arrivingRef.current = { id: exchangeId, reveal: followingRef.current, pendingShown: false };
    setPendingExchangeId(exchangeId);
    submissionInFlightRef.current = true;
    if (questionOverride === undefined) updateQuestion("");
    setPendingQuestion(finalQuestion);
    setPendingStatus(engine === "simple" ? "Preparing an answer…" : "Searching Scripture…");
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
        simpleHistory: boundedSimpleHistory(exchanges.filter((exchange) => !exchange.transportFailure)
          .map((exchange) => ({ question: exchange.question, answer: exchange.answer.answer }))),
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
        setError("Please wait a few seconds before asking another question.");
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
            id: exchangeId,
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
          id: exchangeId,
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
        id: exchangeId,
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
    readingPositionRef.current = null;
    arrivingRef.current = null;
    scrollRestoredRef.current = false;
    expectedScrollTopRef.current = null;
  }

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col bg-[var(--canvas)] text-[var(--foreground)]" data-emet-chat="true">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 border-b border-[var(--border)] px-3 pt-[max(0.25rem,env(safe-area-inset-top))] sm:px-5">
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

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 px-3 py-0 text-xs text-[var(--muted)] sm:px-5">
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
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2 focus-visible:outline-2 focus-visible:outline-[var(--brand)] sm:px-5"
        style={{ overflowAnchor: "none" }}
        onScroll={(event) => {
          if (!active) return;
          const viewport = event.currentTarget;
          const expected = expectedScrollTopRef.current;
          expectedScrollTopRef.current = null;
          if (expected === null || Math.abs(viewport.scrollTop - expected) > 1) {
            followingRef.current = followsLatest(viewport);
            if (!followingRef.current && arrivingRef.current) arrivingRef.current.reveal = false;
          }
          rememberReadingPosition();
        }}
        onWheelCapture={(event) => { if (event.deltaY < 0) pauseFollowing(); }}
        onTouchMoveCapture={pauseFollowing}
        onPointerDownCapture={(event) => {
          if (event.target === event.currentTarget || (event.target instanceof Element && event.target.closest("details"))) pauseFollowing();
        }}
        onKeyDownCapture={(event) => {
          if (["PageUp", "ArrowUp", "Home"].includes(event.key) || (["Enter", " "].includes(event.key) && event.target instanceof Element && event.target.closest("details"))) pauseFollowing();
        }}
      >
        <div ref={contentRef} className="space-y-5" data-emet-content="true">
          {!exchanges.length && !pending ? (
            <div className="py-6 text-center">
              <p className="text-lg font-medium">What would you like to understand?</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Ask naturally. Inspect the Scripture behind each answer.</p>
            </div>
          ) : null}

          {exchanges.map((exchange) => {
            const outcome = exchange.outcome || (exchange.answer.status === "insufficient-evidence" ? "insufficient-evidence" : exchange.source === "fail-closed" ? "failed" : "answered");
            const simpleSources = exchange.source === "simple-owner-model" || exchange.answer.sourceVerification === "locked-corpus-text";
            const notes = qualifications(exchange.answer, simpleSources);
            if (exchange.source === "simple-owner-model" && exchange.answer.verificationStatus === "unverified" && !initialOwnerDiagnostics) {
              return <article key={exchange.id} role="status" className="text-sm text-[var(--muted)]">This saved unverified response is available only for authorized owner inspection.</article>;
            }
            return (
              <article key={exchange.id} className="space-y-2" aria-label="Question and response">
                <div className="flex justify-end" data-emet-scroll-anchor={`${exchange.id}:question`}>
                  <p className="max-w-[94%] sm:max-w-[86%] whitespace-pre-wrap break-words rounded-xl bg-[var(--surface-soft)] px-3 py-1.5 text-base leading-7"><span className="sr-only">Question: </span>{exchange.question}</p>
                </div>
                {exchange.initialScripture?.length ? <InitialScripture items={exchange.initialScripture} pending={false} onNavigate={onClose} /> : null}
                <div className="min-w-0 space-y-2" data-emet-scroll-anchor={`${exchange.id}:answer`}>
                  {outcome !== "answered" ? (
                    <p role={outcome === "failed" ? "alert" : "status"} className="text-sm font-semibold">{outcome === "insufficient-evidence" ? "Insufficient evidence" : "Answer unavailable"}</p>
                  ) : null}
                  {simpleSources && exchange.answer.verificationStatus === "unverified" ? (
                    <section role="alert" aria-label="Unverified model answer" className="rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-sm leading-6">
                      <p className="font-semibold">{initialOwnerDiagnostics ? "Unverified model answer · owner inspection only" : "Unverified model answer"}</p>
                      <p>The answer is shown as generated. Its references or conclusion could not be verified. Only the separately displayed passages have verified Scripture text. This answer cannot be published as a verified study.</p>
                      {initialOwnerDiagnostics && exchange.answer.unresolvedReferences?.length ? (
                        <ul aria-label="Unresolved references (not verified)" className="mt-2 space-y-1">
                          {exchange.answer.unresolvedReferences.map((item, index) => <li key={index}>{item.reference}{item.translation ? ` · ${item.translation}` : ""} — not verified</li>)}
                        </ul>
                      ) : null}
                    </section>
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
                        <p className="mb-1 text-xs text-[var(--muted)]">{simpleSources ? "Passage text is checked against the stated translation. The explanation is model-generated, including any quoted wording; these checks do not independently verify it." : "Final supporting citations"}</p>
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
                    {!simpleSources && exchange.shareStudyId ? (
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
            <article key={pendingExchangeId} className="space-y-2" aria-label="Pending question">
              <div className="flex justify-end" data-emet-scroll-anchor={`${pendingExchangeId}:question`}>
                <p className="max-w-[94%] sm:max-w-[86%] whitespace-pre-wrap break-words rounded-xl bg-[var(--surface-soft)] px-3 py-1.5 text-base leading-7">{pendingQuestion}</p>
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
        className="shrink-0 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-5"
        aria-busy={pending}
        onSubmit={(event) => { event.preventDefault(); void ask(); }}
      >
        {pending ? <p role="status" className="mb-1 text-xs leading-5 text-[var(--muted)]">{pendingStatus} You can draft a follow-up.</p> : null}
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
