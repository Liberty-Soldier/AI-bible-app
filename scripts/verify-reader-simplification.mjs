import assert from "node:assert/strict";
import { createUiFixture, elements, storage, text } from "./lib/ui-fixture-runtime.mjs";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const link = { __esModule: true, default: "a" };
const component = (name) => ({ __esModule: true, default: name });
const button = (tree, label) => {
  const found = elements(tree, (x) => x.type === "button" && (text(x) === label || x.props["aria-label"] === label))[0];
  assert(found, `Missing button: ${label}`);
  return found;
};
function browser(initial = {}) {
  const localStorage = storage(initial);
  const sessionStorage = storage();
  const listeners = {};
  const document = {
    body: { style: {} },
    addEventListener: (name, fn) => { listeners[name] = fn; },
    removeEventListener: (name) => { delete listeners[name]; },
  };
  const window = {
    localStorage, sessionStorage, location: { origin: "https://fixture.invalid", href: "https://fixture.invalid/read/Genesis/1?translation=kjv&restoreWordStudy=1" },
    isSecureContext: true, scrollY: 123, innerHeight: 800,
    setTimeout: () => 1, clearTimeout() {}, dispatchEvent() {},
    addEventListener() {}, removeEventListener() {}, scrollTo() {},
  };
  return { localStorage, sessionStorage, document, window, listeners };
}
function globals(env, extra = {}) {
  return { ...env, Event, Node: class {}, AbortController, DOMException, ...extra };
}

// Both book browsing and the reader header use this same direct-link grid.
for (const translation of ["web", "kjv", "brenton"]) {
  const env = browser({ preferredTranslation: translation });
  for (const explicit of [undefined, translation]) {
    const fixture = createUiFixture({ modules: { "next/link": link }, globals: globals(env) });
    const tree = fixture.render(fixture.load("app/components/BookPassageSelector.tsx").default, {
      book: "1 Corinthians", chapterCount: 16, translation: explicit, currentChapter: 3,
    });
    const links = elements(tree, (x) => x.type === "a");
    assert.equal(links.length, 16);
    for (const [index, chapterLink] of links.entries()) {
      const url = new URL(chapterLink.props.href, env.window.location.origin);
      assert.equal(decodeURIComponent(url.pathname), `/read/1 Corinthians/${index + 1}`);
      assert.equal(url.searchParams.get("translation"), translation);
      assert.equal(url.searchParams.has("verse"), false);
    }
    assert.equal(links[2].props["aria-current"], "page");
    assert.equal(links[4].props.prefetch, false, "Chapter grids must not prefetch every chapter");
    assert.equal(env.localStorage.getItem("preferredTranslation"), translation);
    assert.equal(elements(tree, (x) => x.type === "button").length, 0);
  }
}
console.log("PASS: direct chapter links, shared grid, saved WEB/KJV/Brenton preference, numbered books, current-chapter state");

const env = browser();
const navigations = [];
const selector = createUiFixture({
  modules: { "next/navigation": { useRouter: () => ({ push: (href) => navigations.push(href) }) }, "next/link": link },
  globals: globals(env),
});
const Selector = selector.load("app/components/ReaderSelector.tsx").default;
const selectorProps = {
  books: ["Genesis", "Exodus", "Matthew", "Revelation", "Tobit"], currentBook: "Genesis", currentChapter: 1,
  maxChapter: 50, currentTranslation: "kjv", currentVerse: "1a", verseOptions: ["1", "1a", "2"],
  strictCitation: true, returnTo: "/shared/fixture", returnLabel: "shared study",
};
let tree = selector.render(Selector, selectorProps);
assert.doesNotMatch(text(tree), /King James Version|Typeface/);
elements(tree, (x) => x.type === "select" && x.props["aria-label"] === "Book")[0].props.onChange({ target: { value: "Exodus" } });
tree = selector.render();
const grid = elements(tree, (x) => x.type?.name === "BookPassageSelector")[0];
assert.equal(grid.props.book, "Exodus");
assert.equal(grid.props.chapterCount, 40);
assert.equal(grid.props.translation, "kjv");
assert.equal(navigations.length, 0, "Choosing a book must expose chapters before navigation");
elements(tree, (x) => x.type === "select" && x.props["aria-label"] === "Book")[0].props.onChange({ target: { value: "Genesis" } });
tree = selector.render();
elements(tree, (x) => x.type === "select" && x.props["aria-label"] === "Verse")[0].props.onChange({ target: { value: "1a" } });
let destination = new URL(navigations.at(-1), env.window.location.origin);
assert.equal(destination.searchParams.get("verse"), "1a");
assert.equal(destination.searchParams.get("citation"), "1");
assert.equal(destination.searchParams.get("returnTo"), "/shared/fixture");
tree = selector.render(Selector, { ...selectorProps, mode: "translation" });
assert.equal(elements(tree, (x) => x.type === "select").length, 0);
button(tree, "Brenton SeptuagintBrenton").props.onClick();
destination = new URL(navigations.at(-1), env.window.location.origin);
assert.equal(destination.pathname, "/read/Genesis/1");
assert.equal(destination.searchParams.get("translation"), "brenton");
assert.equal(destination.searchParams.get("verse"), "1a");
assert.equal(destination.searchParams.get("citation"), "1");
assert.equal(destination.searchParams.get("returnLabel"), "shared study");
assert.equal(env.localStorage.getItem("preferredTranslation"), "brenton");
console.log("PASS: book selection opens chapters in place; optional runtime verse labels and explicit translation changes preserve location/citation return parameters");

const header = createUiFixture({ globals: globals(env) });
tree = header.render(header.load("app/components/CollapsibleReaderHeader.tsx").default, {
  title: "Genesis 1", translationLabel: "KJV", passage: "PASSAGE_PICKER", translation: "TRANSLATION_PICKER", children: "APPEARANCE_ONLY",
});
assert.equal(elements(tree, (x) => x.type === "button").length, 3);
assert.doesNotMatch(text(tree), /PICKER|APPEARANCE_ONLY/);
const trigger = { focus() {} };
for (const [label, content] of [
  ["Choose passage, current passage Genesis 1", "PASSAGE_PICKER"],
  ["Choose translation, current translation KJV", "TRANSLATION_PICKER"],
  ["Reading appearance", "APPEARANCE_ONLY"],
]) {
  button(tree, label).props.onClick({ currentTarget: trigger });
  tree = header.render();
  assert(text(tree).includes(content));
  for (const other of ["PASSAGE_PICKER", "TRANSLATION_PICKER", "APPEARANCE_ONLY"]) if (other !== content) assert(!text(tree).includes(other));
  assert.match(elements(tree, (x) => x.type === "section")[0].props.className, /max-h-.*50dvh.*overflow-y-auto/);
}
tree.props.onKeyDown({ key: "Escape", preventDefault() {} });
tree = header.render();
assert.equal(elements(tree, (x) => x.type === "section").length, 0);
console.log("PASS: independent passage/translation/Aa panels, compact default header, bounded scrolling, Escape dismissal");

const verses = [1, 2, 3].map((verse) => ({ id: `Genesis.1.${verse}`, book: "Genesis", chapter: 1, verse, verseLabel: String(verse), reference: `Genesis 1:${verse}`, text: `Fixture verse ${verse}`, translation: "kjv" }));
const memoryEnv = browser();
const copied = [];
const shared = [];
let closed = 0;
const actions = createUiFixture({
  modules: { "@/app/components/SourceBreakdownVerse": component("source-tool") },
  globals: globals(memoryEnv, { navigator: { clipboard: { writeText: async (value) => copied.push(value) }, share: async (value) => shared.push(value) } }),
});
const Actions = actions.load("app/components/VerseActionSheet.tsx").default;
const memory = () => JSON.parse(memoryEnv.localStorage.getItem("scripture-search-reader-memory"));
let actionProps = { open: true, verses: [verses[0]], onClose: () => { closed++; } };
tree = actions.render(Actions, actionProps);
assert.equal(elements(tree, (x) => x.type === "button").length, 2);
assert.equal(elements(tree, (x) => x.type === "source-tool").length, 0);
assert.doesNotMatch(text(tree), /Highlight|Copy|Word Study/);
assert.equal(elements(tree, (x) => x.props.role === "group" && x.props["aria-label"] === "Selected verse actions").length, 1);
button(tree, "Open verse actions").props.onClick();
tree = actions.render();
assert.equal(elements(tree, (x) => x.type === "source-tool")[0].props.label, "Original language / Word Study");
assert.equal(elements(tree, (x) => x.props["aria-label"] === "Highlight color").length, 0);
await button(tree, "Copy").props.onClick();
assert.match(copied.at(-1), /Genesis 1:1 · KJV/);
assert.match(copied.at(-1), /translation=kjv&verse=1/);
button(tree, "Bookmark").props.onClick();
tree = actions.render();
assert.equal(memory().bookmarks[0].id, verses[0].id);
button(tree, "Remove bookmark").props.onClick();
assert.equal(memory().bookmarks.length, 0);
button(tree, "Highlight").props.onClick();
tree = actions.render();
const colors = elements(tree, (x) => x.type?.name === "ColorButton");
assert.equal(colors.length, 5);
colors.find((x) => x.props.label === "Blue").props.onClick();
assert.equal(memory().highlights[0].color, "blue");
button(tree, "Remove highlight").props.onClick();
assert.equal(memory().highlights.length, 0);
button(tree, "Back to actions").props.onClick();
tree = actions.render();
button(tree, "Note").props.onClick();
tree = actions.render();
elements(tree, (x) => x.type === "textarea")[0].props.onChange({ target: { value: "Local fixture note" } });
tree = actions.render();
elements(tree, (x) => x.type === "form")[0].props.onSubmit({ preventDefault() {} });
tree = actions.render();
assert.equal(memory().notes[0].note, "Local fixture note");
assert.equal(memory().notes[0].verses[0].translation, "kjv");
await button(tree, "Share").props.onClick();
assert.match(shared[0].url, /translation=kjv&verse=1/);
assert.match(shared[0].text, /Fixture verse 1/);
// Noncontiguous selections must not claim that intervening verses were selected.
actionProps = { ...actionProps, verses: [verses[0], verses[2]] };
tree = actions.render(Actions, actionProps);
assert.match(text(tree), /Genesis 1:1, 3/);
await button(tree, "Copy").props.onClick();
assert.match(copied.at(-1), /Fixture verse 1/);
assert.match(copied.at(-1), /Fixture verse 3/);
assert.doesNotMatch(copied.at(-1), /Fixture verse 2/);
button(tree, "Bookmark").props.onClick();
assert.equal(memory().bookmarks.length, 2);
tree = actions.render();
button(tree, "Highlight").props.onClick();
tree = actions.render();
elements(tree, (x) => x.type?.name === "ColorButton" && x.props.label === "Yellow")[0].props.onClick();
assert.equal(memory().highlights.length, 2);
button(tree, "Back to actions").props.onClick();
tree = actions.render();
button(tree, "Note").props.onClick();
tree = actions.render();
elements(tree, (x) => x.type === "textarea")[0].props.onChange({ target: { value: "Multiverse note" } });
tree = actions.render();
elements(tree, (x) => x.type === "form")[0].props.onSubmit({ preventDefault() {} });
assert.equal(memory().notes.find((note) => note.note === "Multiverse note").verses.length, 2);
tree = actions.render();
await button(tree, "Share").props.onClick();
assert.match(shared.at(-1).text, /Fixture verse 1/);
assert.match(shared.at(-1).text, /Fixture verse 3/);
assert.doesNotMatch(shared.at(-1).text, /Fixture verse 2/);
button(tree, "Original language / Word Study").props.onClick();
tree = actions.render();
const sourceTools = elements(tree, (x) => x.type === "source-tool");
assert.equal(sourceTools.length, 2);
assert.equal(sourceTools[1].props.reference, "Genesis 1:3");
memoryEnv.listeners.keydown({ key: "Escape", preventDefault() {} });
tree = actions.render();
assert.equal(elements(tree, (x) => x.type === "source-tool").length, 0);
button(tree, "Clear verse selection").props.onClick();
assert.equal(closed, 1);
assert.equal(actions.render(Actions, { ...actionProps, open: false, verses: [] }), null);
console.log("PASS: compact selection, on-demand palette/source tools, real bookmark/highlight/note persistence, native sharing, copy, multiverse/noncontiguous selection, keyboard dismissal");

// Exercise verse-number selection with the actual chapter adapter and memory code.
const controllerEnv = browser();
const controller = createUiFixture({
  modules: {
    "@/app/components/ScriptureText": component("scripture-text"),
    "@/app/components/VerseActionSheet": component("verse-actions"),
    "@/app/lib/readerPreferences": { useReaderPreferences: () => ({ fontFamily: "serif", textSize: "large", lineSpacing: "relaxed" }) },
  }, globals: globals(controllerEnv),
});
tree = controller.render(controller.load("app/components/VerseActionController.tsx").default, {
  verses: verses.map((verse) => ({ ...verse, sources: [{ text: verse.text }] })), activeTranslation: "kjv", tokenAvailabilityByVerse: {},
});
let selectors = elements(tree, (x) => x.props["data-verse-selector"]);
const selectEvent = () => ({ preventDefault() {}, stopPropagation() {} });
selectors[2].props.onClick(selectEvent());
tree = controller.render();
selectors = elements(tree, (x) => x.props["data-verse-selector"]);
selectors[0].props.onClick(selectEvent());
tree = controller.render();
const selection = elements(tree, (x) => x.type === "verse-actions")[0];
assert.deepEqual(Array.from(selection.props.verses, (x) => x.verse), [1, 3]);
assert.equal(selection.props.verses[0].translation, "kjv");
assert.equal(elements(tree, (x) => x.props["aria-pressed"] === true).length, 2);
assert.equal(elements(tree, (x) => x.type === "scripture-text").length, 3);
assert(elements(tree, (x) => /reader-serif/.test(x.props.className || "") && /leading-\[2.02\]/.test(x.props.className || "") && /pb-28/.test(x.props.className || "")).length);
selection.props.onClose();
tree = controller.render();
assert.equal(elements(tree, (x) => x.type === "verse-actions")[0].props.open, false);
console.log("PASS: real verse selection sorts/toggles without altering Scripture; selected state, serif/size/spacing preferences, and reading clearance are preserved");

// Source lookup remains lazy and carries each translation to the existing sheet.
for (const [translation, corpus] of [["web", "hebrew"], ["kjv", "greek-nt"], ["brenton", "lxx"]]) {
  let requests = 0;
  const source = createUiFixture({
    modules: { "@/app/components/SourceBreakdownSheet": component("source-sheet") },
    globals: { fetch: async (href) => {
      requests++;
      const url = new URL(href, "https://fixture.invalid");
      assert.equal(url.pathname, "/api/source-breakdown");
      assert.equal(url.searchParams.get("translation"), translation);
      assert.equal(url.searchParams.get("verse"), "1a");
      return { ok: true, json: async () => ({ resolved: true, corpus, translation, sourceVerses: [] }) };
    } },
  });
  tree = source.render(source.load("app/components/SourceBreakdownVerse.tsx").default, {
    reference: "Genesis 1:1a", verse: 1, translation, verseText: "Fixture text", label: "Original language / Word Study",
  });
  assert.equal(requests, 0);
  button(tree, "Original language / Word Study").props.onClick();
  await tick();
  tree = source.render();
  assert.equal(requests, 1);
  assert.equal(elements(tree, (x) => x.type === "source-sheet")[0].props.data.corpus, corpus);
}
console.log("PASS: explicit-only source lookup for Hebrew, Greek NT, and Septuagint; translation and string verse-label identity retained");

// Traverse the existing source-word UI into Word Study using fixture evidence.
function expandPure(node) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(expandPure);
  if (typeof node.type === "function" && ["SourceVerseBlock", "SelectedWordDetails"].includes(node.type.name)) return expandPure(node.type(node.props));
  return { ...node, props: { ...node.props, children: expandPure(node.props?.children) } };
}
for (const [translation, corpus, lexicalId] of [["web", "hebrew", "H1254"], ["kjv", "greek-nt", "G3056"], ["brenton", "lxx", "L1"]]) {
  const sourceEnv = browser();
  const occurrence = { id: `fixture:${corpus}`, surface: "Fixture source", lexicalId, entityId: `word:${corpus}:${lexicalId}`, grammarOnly: false };
  const sheet = createUiFixture({
    modules: { "@/app/components/WordStudySheet": component("word-study"), "@/app/components/ScriptureText": component("scripture-text") },
    globals: globals(sourceEnv, { fetch: async () => ({ ok: true, json: async () => ({ resolved: true, entity: { simple: { meaning: "Fixture meaning" } } }) }) }),
  });
  const Sheet = sheet.load("app/components/SourceBreakdownSheet.tsx").default;
  tree = sheet.render(Sheet, { data: { corpus, translation, displayedReference: { book: "Genesis", chapter: 1, verse: "1" }, sourceVerses: [{ source: corpus, reference: "Genesis 1:1", witness: "Local fixture", occurrences: [occurrence] }] }, verseText: "Fixture text", onClose() {} });
  await tick();
  tree = expandPure(sheet.render());
  elements(tree, (x) => x.props["data-source-word"])[0].props.onClick();
  tree = expandPure(sheet.render());
  button(tree, "View full Word Overview→").props.onClick();
  tree = sheet.render();
  const word = elements(tree, (x) => x.type === "word-study")[0];
  assert.equal(word.props.sourceOccurrenceId, occurrence.id);
  assert.equal(word.props.sourceLexicalId, lexicalId);
  assert.equal(word.props.sourceCorpus, corpus);
  assert.equal(word.props.translation, translation);
  word.props.onClose();
  tree = sheet.render();
  assert.equal(elements(tree, (x) => x.type === "word-study").length, 0);
}
console.log("PASS: source-word selection opens Word Study for all three corpora with canonical identity and return-to-source behavior intact");

const positionEnv = browser();
const position = createUiFixture({ globals: globals(positionEnv) });
position.render(position.load("app/components/SaveReadingPosition.tsx").default, { book: "Genesis", chapter: 2, translation: "brenton" });
const savedPosition = JSON.parse(positionEnv.localStorage.getItem("lastReadingPosition"));
assert.equal(savedPosition.chapter, 2);
assert.equal(savedPosition.translation, "brenton");
const restoredContext = { word: "Fixture source", book: "Genesis", chapter: 1, verse: 1, translation: "kjv", entityId: "word:hebrew:H1254" };
positionEnv.sessionStorage.setItem("emetsees-word-study-navigation-v1", JSON.stringify({ context: restoredContext, view: "occurrences", scrollTop: 123 }));
let restoredHref;
const restore = createUiFixture({
  modules: { "next/navigation": { useRouter: () => ({ replace: (href) => { restoredHref = href; } }) }, "@/app/components/WordStudySheet": component("word-study") }, globals: globals(positionEnv),
});
tree = restore.render(restore.load("app/components/RestoredWordStudyNavigation.tsx").default, { active: true });
assert.equal(tree.props.entityId, restoredContext.entityId);
assert.equal(tree.props.translation, "kjv");
tree.props.onClose();
assert.equal(restoredHref, "/read/Genesis/1?translation=kjv");
console.log("PASS: reading-position tracking and saved Word Study restoration remain translation-aware");
console.log("Reader simplification fixture regressions passed. No external or AI requests were made.");
