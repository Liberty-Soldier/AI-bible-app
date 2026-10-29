import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { createUiFixture, elements, storage, text } from "./lib/ui-fixture-runtime.mjs";

const root = process.cwd();
const defaultModules = {
  "next/link": { __esModule: true, default: "a" },
  "next/navigation": { useRouter: () => ({ push() {} }), notFound: () => { throw new Error("NOT_FOUND"); } },
  "@/app/components/branding/EmetseesLogo": { __esModule: true, default: "logo" },
  "@/app/components/branding/EmetseesWordmark": { __esModule: true, default: "wordmark" },
};

// Compile the real global styles with deterministic utility candidates. Inspect
// the resulting cascade, not just the presence of strings in the input file.
const css = fs.readFileSync("app/globals.css", "utf8").replace(
  '@import "tailwindcss";',
  '@import "tailwindcss" source(none);\n@source inline("text-xs text-sm font-semibold font-sans dark:text-red-300");',
);
const compiled = await postcss([tailwind({ base: root, optimize: false })]).process(css, {
  from: `${root}/app/globals.css`,
});
function ancestors(node) {
  const result = [];
  for (let parent = node.parent; parent; parent = parent.parent) result.push(parent);
  return result;
}
let controlReset = false;
let darkUtility = false;
let smallText = false;
let controlWeight = false;
let controlTypeface = false;
let serif = false;
compiled.root.walkRules((rule) => {
  const parents = ancestors(rule);
  if (rule.selector.includes("button") && rule.selector.includes("a") && rule.nodes?.some((x) => x.prop === "font" && x.value === "inherit")) {
    controlReset = true;
    assert(parents.some((x) => x.name === "layer" && x.params === "base"), "Control font reset must stay in the base layer");
  }
  if (rule.selector === ".text-sm") {
    smallText = true;
    assert(parents.some((x) => x.name === "layer" && x.params === "utilities"));
    assert(rule.nodes.some((x) => x.prop === "font-size"));
  }
  if (rule.selector === ".font-semibold") {
    controlWeight = true;
    assert(rule.nodes.some((x) => x.prop === "font-weight"));
  }
  if (rule.selector === ".font-sans") {
    controlTypeface = true;
    assert(rule.nodes.some((x) => x.prop === "font-family"));
  }
  if (rule.selector.includes("dark\\:text-red-300")) {
    darkUtility = true;
    const selectors = rule.toString() + parents.filter((x) => x.type === "rule").map((x) => x.selector).join(" ");
    assert.match(selectors, /data-theme/);
    assert(!parents.some((x) => x.name === "media" && /prefers-color-scheme/.test(x.params)));
  }
  if (rule.selector === ".reader-serif") {
    serif = true;
    assert(rule.nodes.some((x) => x.prop === "font-family" && x.value.includes("Georgia")));
  }
});
assert(controlReset && darkUtility && smallText && controlWeight && controlTypeface && serif);
assert.doesNotMatch(compiled.css, /prefers-color-scheme/);
console.log("PASS: compiled typography cascade, serif preservation, and explicit-theme dark utilities");

// Exercise the pre-hydration script and actual provider/toggle against saved
// primary and legacy preferences, conflicting keys, and blocked storage.
for (const [initial, expected] of [
  [{}, "light"],
  [{ "emetsees-theme": "dark" }, "dark"],
  [{ "emetsees-theme": "light", "bibleiq-theme": "dark" }, "light"],
  [{ "bibleiq-theme": "dark" }, "dark"],
  [{ theme: "dark" }, "dark"],
  [{ "emetsees-theme": "invalid" }, "light"],
  [null, "light"],
]) {
  const localStorage = initial === null ? {
    getItem() { throw new Error("Storage blocked"); },
    setItem() { throw new Error("Storage blocked"); },
  } : storage(initial);
  const document = { documentElement: { dataset: {}, style: {} } };
  const listeners = {};
  const fixture = createUiFixture({
    modules: {
      ...defaultModules,
      "next/font/google": { Geist: () => ({ variable: "sans" }), Geist_Mono: () => ({ variable: "mono" }) },
      "./globals.css": {},
      "@/app/components/ThemeProvider": { __esModule: true, default: "provider" },
      "@/app/components/GlobalAskButton": { __esModule: true, default: "ask" },
    },
    globals: {
      document, localStorage,
      window: { addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {} },
      MutationObserver: class { observe() {} disconnect() {} },
    },
  });
  const layout = fixture.load("app/layout.tsx").default({ children: null });
  const script = elements(layout, (x) => x.type === "script")[0].props.dangerouslySetInnerHTML.__html;
  vm.runInNewContext(script, { localStorage, document });
  assert.equal(document.documentElement.dataset.theme, expected);
  assert.equal(document.documentElement.style.colorScheme, expected);
  const provider = fixture.load("app/components/ThemeProvider.tsx");
  let tree = fixture.render(provider.default, { children: null });
  assert.equal(tree.props.value.theme, expected);
  // Load the Settings control with the actual provider hook, not its own state.
  const toggleFixture = createUiFixture({ modules: { "@/app/components/ThemeProvider": provider } });
  const toggle = toggleFixture.load("app/components/ThemeToggle.tsx").default;
  let button = toggleFixture.render(toggle);
  assert.equal(text(button), expected === "dark" ? "Switch to Light" : "Switch to Dark");
  button.props.onClick();
  tree = fixture.render();
  const next = expected === "dark" ? "light" : "dark";
  assert.equal(tree.props.value.theme, next);
  assert.equal(document.documentElement.dataset.theme, next);
  assert.equal(document.documentElement.style.colorScheme, next);
  button = toggleFixture.render();
  assert.equal(text(button), next === "dark" ? "Switch to Light" : "Switch to Dark");
  if (initial !== null) {
    for (const key of ["emetsees-theme", "bibleiq-theme", "theme"]) assert.equal(localStorage.getItem(key), next);
    localStorage.setItem("emetsees-theme", expected);
    listeners.storage({ key: "emetsees-theme" });
    tree = fixture.render();
    assert.equal(tree.props.value.theme, expected);
  }
}
console.log("PASS: first-visit light default, saved/legacy preferences, active Settings label, toggle, storage synchronization, blocked storage");

const fixture = createUiFixture();
const { buildScriptureCitationHref, getCitationTranslation } = fixture.load("app/lib/scriptureCitationNavigation.ts");
for (const translation of ["web", "kjv", "brenton"]) {
  for (const reference of ["John 3:16", "1 Corinthians 13:4", "Psalms 9:1a", "John 3:16-18"]) {
    for (const citation of [{ reference, translation }, { reference, evidenceId: `scripture:${translation}:42` }]) {
      const href = buildScriptureCitationHref(citation, { returnTo: "/shared/fixture?from=reader", returnLabel: "shared study" });
      const url = new URL(href, "https://fixture.invalid");
      assert.equal(url.searchParams.get("translation"), translation);
      assert.equal(url.searchParams.get("verse"), reference.split(":")[1]);
      assert.equal(url.searchParams.get("citation"), "1");
      assert.equal(url.searchParams.get("returnTo"), "/shared/fixture?from=reader");
      assert.equal(url.searchParams.get("returnLabel"), "shared study");
      assert.equal(decodeURIComponent(url.pathname), `/read/${reference.slice(0, reference.lastIndexOf(" "))}/${reference.split(" ").at(-1).split(":")[0]}`);
    }
  }
}
for (const citation of [
  { reference: "John 3:16" },
  { reference: "John 3:16", translation: "translation" },
  { reference: "John 3:16", evidenceId: "lexical:hebrew:H1" },
  { reference: "John 3:16", translation: "web", evidenceId: "scripture:kjv:42" },
  { reference: "invalid", translation: "web" },
  { reference: "John 0:16", translation: "web" },
]) assert.equal(buildScriptureCitationHref(citation), null);
assert.equal(getCitationTranslation({ evidenceId: "scripture:KJV:42" }), "kjv");
console.log("PASS: citation links preserve WEB/KJV/Brenton, numbered books, verse labels/ranges, and return navigation; unknown/conflicting identity never defaults to WEB");

// Render the shared-answer page from a local snapshot: no database or publication.
const shared = createUiFixture({ modules: {
  ...defaultModules,
  "@/app/lib/emet/EmetSharedStudy": { getPublishedSharedStudy: async () => ({
    id: "fixture", question: "Fixture question", answer: "Fixture answer",
    citations: ["web", "kjv", "brenton", "unknown"].map((translation) => ({ reference: "Genesis 1:1", translation })),
  }) },
} });
const sharedTree = await shared.load("app/shared/[id]/page.tsx").default({ params: Promise.resolve({ id: "fixture" }) });
const sharedLinks = elements(sharedTree, (x) => x.type === "a");
assert.equal(sharedLinks.length, 3);
assert.deepEqual(sharedLinks.map((x) => new URL(x.props.href, "https://fixture.invalid").searchParams.get("translation")), ["web", "kjv", "brenton"]);
assert.match(text(sharedTree), /UNKNOWN/);
console.log("PASS: actual shared-answer rendering preserves translations and leaves unknown citations readable without guessed links");

// Test the reader route with local chapter responses. Citation failures must not
// request another translation, while normal reading retains its existing fallback.
const readerComponents = ["SacredNameToggle", "ReaderAppearanceControls", "ReaderSelector", "SaveReadingPosition", "ReaderVerseScroller", "ChapterSwipe", "MobileBottomNav", "CollapsibleReaderHeader", "SaveBibleIQContext", "VerseActionController", "ReaderStickyHeader", "ReaderFirstUseTip", "RestoredWordStudyNavigation"];
for (const [translation, available, citation] of [
  ["web", true, "1"], ["kjv", true, "1"], ["brenton", true, "1"],
  ["kjv", false, "1"], ["brenton", false, "1"], ["kjv", false, undefined],
]) {
  const requests = [];
  const reader = createUiFixture({
    modules: {
      ...defaultModules,
      ...Object.fromEntries(readerComponents.map((name) => [`@/app/components/${name}`, { __esModule: true, default: name }])),
      "next/headers": { headers: async () => new Map([["host", "fixture.invalid"]]) },
      "../../../data/scripture/bookCatalog": { bookCatalog: [{ book: "Genesis", chapters: 50 }] },
      "@/app/data/scripture/ReaderVerseAdapter": { normalizeReaderChapter: (data) => data },
      "@/app/data/scripture/CanonicalVerseStore": { getCanonicalChapterTokenAvailability: async () => ({}) },
    },
    globals: { fetch: async (url) => {
      const requested = /runtime\/(\w+)\//.exec(url)[1];
      requests.push(requested);
      return {
        ok: requested === "web" || available,
        json: async () => ({ verses: [{ id: "fixture", verseLabel: "1" }], superscriptions: [] }),
      };
    } },
  });
  const tree = await reader.load("app/read/[book]/[chapter]/page.tsx").default({
    params: Promise.resolve({ book: "Genesis", chapter: "1" }),
    searchParams: Promise.resolve({ translation, citation, verse: "1", returnTo: "/shared/fixture", returnLabel: "shared study" }),
  });
  if (!available && citation) {
    assert.match(text(tree), /Citation unavailable/);
    assert.match(text(tree), /No other translation has been substituted/);
    assert.deepEqual(requests, [translation]);
    assert.equal(elements(tree, (x) => x.type === "a")[0].props.href, "/shared/fixture");
  } else {
    const controller = elements(tree, (x) => x.type === "VerseActionController")[0];
    assert.equal(controller.props.activeTranslation, available ? translation : "web");
    assert.equal(controller.props.highlightedVerse, "1");
  }
}
console.log("PASS: actual reader route retains verified translations, fails explicitly without substitution, and preserves ordinary reading fallback");

// Execute the actual chat handlers with a deferred local response. Invoking a
// stale reset handler in the same tick must also leave the conversation intact.
for (const ok of [true, false]) {
  const previous = { id: "previous", question: "Previous question", answer: {
    answer: "Previous answer", citations: ["web", "kjv", "brenton"].map((translation) => ({ evidenceId: `scripture:${translation}:42`, reference: "Genesis 1:1" })),
    claims: [], limitations: [],
  }, initialScripture: [{ id: "early", reference: "Genesis 1:1", translation: "brenton", text: "Fixture passage" }] };
  const sessionStorage = storage({ "emetsees-conversation": JSON.stringify([previous]), "emetsees-conversation-id": "old-conversation" });
  const localStorage = storage();
  const timers = [];
  let finish;
  let requestBody;
  const chat = createUiFixture({
    modules: { ...defaultModules, "@/app/lib/emet/EmetAiConversation": { buildEmetConversationContext: (value) => value } },
    globals: {
      crypto: { randomUUID: (() => { let id = 0; return () => `fixture-${++id}`; })() },
      window: {
        localStorage, sessionStorage,
        setTimeout: (fn, delay) => { if (!delay) timers.push(fn); return timers.length; },
        clearTimeout() {}, requestAnimationFrame: (fn) => fn(),
      },
      fetch: async (url, options) => {
        if (url === "/api/emet/evidence") return { ok: true, json: async () => ({ status: "ready", items: [] }) };
        assert.equal(url, "/api/emet/ask", "Only fixture requests are allowed");
        requestBody = JSON.parse(options.body);
        return new Promise((resolve) => { finish = () => resolve({ ok, status: ok ? 200 : 422, json: async () => ({ answer: { answer: ok ? "Fixture answer" : "Insufficient fixture evidence", citations: [], claims: [], limitations: [] } }) }); });
      },
    },
  });
  let tree = chat.render(chat.load("app/components/emet/EmetChat.tsx").default, { initialUsage: null });
  while (timers.length) timers.shift()();
  tree = chat.render();
  const citationLinks = elements(tree, (x) => x.type === "a" && x.props.href.startsWith("/read/"));
  assert.deepEqual(citationLinks.map((x) => new URL(x.props.href, "https://fixture.invalid").searchParams.get("translation")), ["brenton", "web", "kjv", "brenton"]);
  const reset = elements(tree, (x) => x.type === "button" && text(x) === "New conversation")[0];
  const textarea = elements(tree, (x) => x.type === "textarea")[0];
  textarea.props.onChange({ target: { value: "Pending fixture question" } });
  tree = chat.render();
  const pending = elements(tree, (x) => x.type === "form")[0].props.onSubmit({ preventDefault() {} });
  // onSubmit intentionally launches ask without awaiting it, as in the browser.
  assert.equal(pending, undefined);
  reset.props.onClick();
  assert.equal(sessionStorage.getItem("emetsees-conversation-id"), "old-conversation");
  tree = chat.render();
  assert.equal(elements(tree, (x) => x.type === "button" && text(x) === "New conversation")[0].props.disabled, true);
  assert.match(text(tree), /Previous answer/);
  assert.equal(requestBody.conversationId, "old-conversation");
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  tree = chat.render();
  assert.match(text(tree), ok ? /Fixture answer/ : /Insufficient fixture evidence/);
  assert.match(text(tree), /Previous answer/);
  const enabledReset = elements(tree, (x) => x.type === "button" && text(x) === "New conversation")[0];
  assert.equal(enabledReset.props.disabled, false);
  assert.equal(JSON.parse(sessionStorage.getItem("emetsees-conversation")).length, 2);
  enabledReset.props.onClick();
  tree = chat.render();
  assert.doesNotMatch(text(tree), /Previous answer|Pending fixture question/);
  assert.notEqual(sessionStorage.getItem("emetsees-conversation-id"), "old-conversation");
  assert.equal(JSON.parse(sessionStorage.getItem("emetsees-conversation")).length, 0);
}
console.log("PASS: actual Ask EMET citation rendering, pending/same-tick reset guard, success/failure history, and normal reset after completion");
console.log("UI foundation fixture regressions passed. No AI or external requests were made.");
