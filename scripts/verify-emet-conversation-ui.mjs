import assert from "node:assert/strict";
import { createUiFixture, elements, storage, text } from "./lib/ui-fixture-runtime.mjs";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const component = (name) => ({ __esModule: true, default: name });
const button = (tree, label) => {
  const found = elements(tree, (x) => x.type === "button" && (text(x) === label || x.props["aria-label"] === label))[0];
  assert(found, `Missing button: ${label}`);
  return found;
};
const prior = {
  id: "earlier", question: "Earlier question", source: "model", outcome: "answered",
  answer: { status: "complete", answer: "Earlier answer", conclusionSupport: "explicit-statement", claims: [], componentChecks: [], continuityChecks: [], citations: [], limitations: [] },
};
const passages = [{ id: "scripture:brenton:1", reference: "Genesis 1:1", text: "Exact preliminary\npassage", translation: "brenton" }];
const exactAnswer = "Exact answer.\n\n“Quoted Scripture.”\n  Indented wording.";
const answerPayload = {
  status: "complete", source: "model", shareStudyId: "local-shared-study",
  answer: {
    status: "complete", answer: exactAnswer, conclusionSupport: "possible-interpretation",
    claims: [{ id: "private-claim-47", text: "A qualified interpretation", support: "possible-interpretation", evidenceIds: ["scripture:kjv:2"] }],
    componentChecks: [{ componentId: "private-part-2", support: "strong-implication", explanation: "private-part-2 requires an inference.", evidenceIds: [] }],
    continuityChecks: [{ propositionId: "private-claim-47", verdict: "narrowed", explanation: "The conclusion is limited to this setting.", evidenceIds: [] }],
    citations: ["web", "kjv", "brenton"].map((translation, index) => ({ evidenceId: `scripture:${translation}:${index + 1}`, reference: "Genesis 1:1" })),
    limitations: ["These passages do not establish the broader claim."],
  },
  limitations: ["A separate supplied qualification remains visible."],
};

function environment(initial = {}) {
  const sessionStorage = storage(initial);
  const localStorage = storage();
  const listeners = {};
  const viewportListeners = {};
  const timers = new Map();
  let timerId = 0;
  const observers = [];
  class Element {
    closest() { return null; }
  }
  class HTMLElement extends Element {
    focus() { document.activeElement = this; }
    getClientRects() { return [{}]; }
  }
  const document = { activeElement: new HTMLElement(), body: { style: { overflow: "" } } };
  const window = {
    sessionStorage, localStorage, location: new URL("https://fixture.invalid/emet"), innerHeight: 800,
    visualViewport: {
      height: 800, offsetTop: 0,
      addEventListener: (key, fn) => { viewportListeners[key] = fn; },
      removeEventListener: (key) => { delete viewportListeners[key]; },
    },
    addEventListener: (key, fn) => { listeners[key] = fn; },
    removeEventListener: (key) => { delete listeners[key]; },
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    history: { state: {}, replaceState(state, unused, href) { window.location = new URL(href, window.location.origin); } },
  };
  const root = { style: {}, getBoundingClientRect: () => ({ top: 60 }) };
  let top = 0;
  const viewport = {
    scrollHeight: 1000, clientHeight: 400,
    get scrollTop() { return top; },
    set scrollTop(value) { top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); },
  };
  const content = {};
  const geometry = new Map();
  const overrides = new Map();
  const anchorNodes = new Map();
  let anchors = [];
  viewport.top = 100;
  viewport.getBoundingClientRect = () => ({ top: viewport.top, bottom: viewport.top + viewport.clientHeight, height: viewport.clientHeight });
  viewport.querySelectorAll = () => anchors;
  const positionAnchor = (key, position) => overrides.set(key, { ...geometry.get(key), ...position });
  const anchorTop = (key) => (overrides.get(key) || geometry.get(key))?.top;
  function layoutContent(element) {
    let cursor = 0;
    anchors = elements(element, (x) => typeof x.props["data-emet-scroll-anchor"] === "string").map((anchor) => {
      const key = anchor.props["data-emet-scroll-anchor"];
      const question = key.endsWith(":question");
      const height = question ? Math.max(40, Math.ceil(text(anchor).length / 70) * 28) : Math.max(160, Math.ceil(text(anchor).length / 70) * 28);
      geometry.set(key, { top: cursor, height });
      cursor += height + (question ? 8 : 20);
      if (!anchorNodes.has(key)) anchorNodes.set(key, {
        dataset: { emetScrollAnchor: key },
        getBoundingClientRect() {
          const box = overrides.get(key) || geometry.get(key);
          const top = viewport.top + box.top - viewport.scrollTop;
          return { top, bottom: top + box.height, height: box.height };
        },
      });
      return anchorNodes.get(key);
    });
  }
  const textarea = { style: {}, scrollHeight: 44 };
  const flushTimers = () => {
    for (const [id, timer] of [...timers]) if (timer.delay === 0) { timers.delete(id); timer.fn(); }
  };
  return {
    sessionStorage, localStorage, window, document, listeners, viewportListeners, observers, root, viewport, textarea, flushTimers, positionAnchor, anchorTop,
    globals: { window, document, Element, HTMLElement, DOMException,
      crypto: { randomUUID: (() => { let count = 0; return () => `fixture-${++count}`; })() },
      ResizeObserver: class { constructor(fn) { this.callback = fn; observers.push(fn); } observe() {} disconnect() { const index = observers.indexOf(this.callback); if (index >= 0) observers.splice(index, 1); } },
    },
    onElement(element) {
      if (!element.props.ref || typeof element.props.ref !== "object") return;
      if (element.props["data-emet-chat"]) element.props.ref.current = root;
      else if (element.props["aria-label"] === "Conversation") element.props.ref.current = viewport;
      else if (element.type === "textarea") element.props.ref.current = textarea;
      else if (element.type === "div" && element.props["data-emet-content"]) { element.props.ref.current = content; layoutContent(element); }
    },
  };
}

function chatFixture({ history = [prior], draft = "", scroll, props = {}, evidenceLate = false, location, legacyHistory, legacyDraft = "" } = {}) {
  const env = environment({
    "emetsees-conversation": JSON.stringify(history),
    "emetsees-conversation-id": "conversation-before",
    "emetsees-conversation-draft": draft,
    ...(scroll ? { "emetsees-conversation-scroll": JSON.stringify({ conversationId: "conversation-before", ...scroll }) } : {}),
  });
  if (legacyHistory) {
    env.sessionStorage.setItem("emetsees-simple-conversation", JSON.stringify(legacyHistory));
    env.sessionStorage.setItem("emetsees-simple-conversation-id", "preserved-owner-conversation");
    env.sessionStorage.setItem("emetsees-simple-conversation-draft", legacyDraft);
  }
  if (location) env.window.location = new URL(location);
  const requests = [];
  const shared = [];
  const copied = [];
  const pushes = [];
  const contexts = [];
  const deferredEvidence = [];
  const fetch = async (url, options) => {
    if (url === "/api/emet/evidence") {
      if (evidenceLate) return new Promise((resolve) => deferredEvidence.push(() => resolve({ ok: true, json: async () => ({ status: "ready", items: passages }) })));
      return { ok: true, json: async () => ({ status: "ready", items: passages }) };
    }
    if (url === "/api/emet/share") {
      assert.equal(JSON.parse(options.body).studyId, "local-shared-study");
      return { ok: true, json: async () => ({ path: "/shared/local-shared-study" }) };
    }
    assert(["/api/emet/ask", "/api/emet/explain"].includes(url), `Unexpected non-fixture request: ${url}`);
    return new Promise((resolve, reject) => requests.push({
      url, body: JSON.parse(options.body),
      finish: (payload = answerPayload, status = 200) => resolve({ ok: status >= 200 && status < 300, status, json: async () => payload }),
      reject,
    }));
  };
  const fixture = createUiFixture({
    modules: {
      "next/link": component("a"),
      "next/navigation": { useRouter: () => ({ push: (href) => pushes.push(href) }) },
      "@/app/components/branding/EmetseesLogo": component("logo"),
      "@/app/lib/emet/EmetAiConversation": { buildEmetConversationContext: (value) => { contexts.push(value); return value; } },
    },
    globals: { ...env.globals, fetch, navigator: { share: async (value) => shared.push(value), clipboard: { writeText: async (value) => copied.push(value) } } },
    onElement: env.onElement,
  });
  const Chat = fixture.load("app/components/emet/EmetChat.tsx").default;
  let currentProps = { initialUsage: null, initialEngine: "current", ...props };
  fixture.render(Chat, currentProps);
  env.flushTimers();
  let tree = fixture.render();
  return {
    ...env, fixture, requests, shared, copied, pushes, contexts, deferredEvidence,
    render(nextProps) {
      if (nextProps) currentProps = { ...currentProps, ...nextProps };
      tree = fixture.render(Chat, currentProps);
      return tree;
    },
    type(value) {
      elements(tree, (x) => x.type === "textarea")[0].props.onChange({ target: { value } });
      tree = fixture.render();
      return tree;
    },
    send() {
      elements(tree, (x) => x.type === "form")[0].props.onSubmit({ preventDefault() {} });
      tree = fixture.render();
      return tree;
    },
    tree: () => tree,
  };
}

const live = chatFixture();
const staleReset = button(live.tree(), "New conversation");
live.type("A fixture question");
live.send();
assert.equal(live.requests.length, 1);
staleReset.props.onClick();
assert.equal(live.sessionStorage.getItem("emetsees-conversation-id"), "conversation-before");
await tick();
let tree = live.render();
let preliminary = elements(tree, (x) => x.props["data-preliminary-scripture"])[0];
assert.equal(preliminary.props.open, true);
assert.match(text(preliminary), /not final supporting citations/);
assert.match(text(preliminary), /Exact preliminary\npassage/);
assert.equal(elements(tree, (x) => x.type === "textarea")[0].props.disabled, false);
assert.equal(button(tree, "New conversation").props.disabled, true);
assert.equal(button(tree, "EMET is preparing an answer").props.disabled, true);
live.type("Typed follow-up while waiting");
live.viewport.scrollHeight = 1600;
live.requests[0].finish();
await tick();
tree = live.render();
preliminary = elements(tree, (x) => x.props["data-preliminary-scripture"])[0];
assert.equal(preliminary.props.open, undefined, "Completed preliminary evidence must be collapsed");
assert.equal(elements(tree, (x) => x.props["data-emet-answer"])[1].props.children, exactAnswer);
assert.equal(elements(tree, (x) => x.type === "textarea")[0].props.value, "Typed follow-up while waiting");
assert.equal(live.sessionStorage.getItem("emetsees-conversation-draft"), "Typed follow-up while waiting");
assert.match(text(tree), /These passages do not establish the broader claim/);
assert.match(text(tree), /A separate supplied qualification remains visible/);
assert.match(text(tree), /The conclusion is limited to this setting/);
assert.doesNotMatch(text(tree), /private-claim-47|private-part-2/);
const finalLinks = elements(tree, (x) => x.type === "a" && x.props.href.startsWith("/read/"));
assert.deepEqual(finalLinks.map((x) => new URL(x.props.href, live.window.location.origin).searchParams.get("translation")), ["brenton", "web", "kjv", "brenton"]);
const latestId = elements(tree, x => x.props["data-emet-scroll-anchor"]?.endsWith(":answer")).at(-1).props["data-emet-scroll-anchor"].replace(":answer", "");
assert.equal(live.viewport.scrollTop, live.anchorTop(`${latestId}:question`) - 8, "An arriving answer should reveal its beginning with the question");
assert.ok(live.viewport.scrollTop < 1200, "Do not jump to the end of a completed response");
button(tree, "Publish and share this answer").props.onClick();
await tick();
assert.equal(live.shared[0].url, "https://fixture.invalid/shared/local-shared-study");
assert(live.shared[0].text.includes(exactAnswer));
assert.match(live.shared[0].text, /Genesis 1:1/);
assert.match(elements(tree, (x) => x.type === "form")[0].props.className, /shrink-0.*safe-area-inset-bottom/);
assert.match(elements(tree, (x) => x.type === "p" && text(x).includes("Shift+Enter"))[0].props.className, /hidden.*pointer-fine:block/);
console.log("PASS: pending preliminary passages, automatic collapse, exact answer/source preservation, visible qualifications without internal IDs, editable pending drafts, reset guard, and shared-answer publication compatibility");

// Reading older content must survive pending/completed updates, disclosure
// expansion, composer resizing, and visual-viewport keyboard events.
const reading = chatFixture({ scroll: { top: 125, following: false }, draft: "Restored draft" });
assert.equal(reading.viewport.scrollTop, 125);
assert.equal(elements(reading.tree(), (x) => x.type === "textarea")[0].props.value, "Restored draft");
reading.type("Another question");
reading.send();
await tick();
reading.render();
reading.viewport.scrollHeight = 1800;
reading.requests[0].finish();
await tick();
tree = reading.render();
assert.equal(reading.viewport.scrollTop, 125);
reading.observers.forEach((fn) => fn());
assert.equal(reading.viewport.scrollTop, 125);
reading.window.visualViewport.height = 420;
reading.viewportListeners.resize();
assert.equal(reading.root.style.height, "360px");
assert.equal(reading.viewport.scrollTop, 125);
reading.window.visualViewport.height = 800;
reading.viewportListeners.resize();
assert.equal(reading.root.style.height, "");
const region = elements(tree, (x) => x.props["aria-label"] === "Conversation")[0];
reading.viewport.scrollTop = reading.viewport.scrollHeight;
region.props.onScroll({ currentTarget: reading.viewport });
reading.viewport.scrollHeight = 2200;
reading.observers.forEach((fn) => fn());
assert.equal(reading.viewport.scrollTop, 1400, "Layout growth should preserve the reading position even when previously at the bottom");
const disclosureTarget = new reading.globals.Element();
disclosureTarget.closest = () => ({});
region.props.onPointerDownCapture({ target: disclosureTarget });
reading.viewport.scrollHeight = 2400;
reading.observers.forEach((fn) => fn());
assert.equal(reading.viewport.scrollTop, 1400, "Expanding evidence must preserve position");
console.log("PASS: older-message scroll restoration/stability, one-shot answer reveal, evidence inspection, and visual-viewport composer sizing with fixtures");

for (const [status, payload, expected] of [
  [422, { status: "insufficient-evidence", answer: "Exact insufficient-evidence wording.", limitations: ["The passages do not establish that timing."] }, "Insufficient evidence"],
  [503, { answer: "Exact service response.", limitations: ["No complete answer was verified."] }, "Answer unavailable"],
]) {
  const failed = chatFixture();
  failed.type("Question without enough evidence");
  failed.send();
  await tick();
  failed.requests[0].finish(payload, status);
  await tick();
  tree = failed.render();
  assert.match(text(tree), new RegExp(expected));
  assert.equal(elements(tree, (x) => x.props["data-emet-answer"])[1].props.children, payload.answer);
  assert.match(text(tree), new RegExp(payload.limitations[0].replace(/\./g, "\\.")));
  assert.equal(elements(tree, (x) => x.props["data-preliminary-scripture"])[0].props.open, undefined);
  assert.equal(button(tree, "New conversation").props.disabled, false);
  button(tree, "New conversation").props.onClick();
  tree = failed.render();
  assert.equal(elements(tree, (x) => x.props["data-emet-answer"]).length, 0);
  assert.equal(failed.sessionStorage.getItem("emetsees-conversation-draft"), "");
}
const disconnected = chatFixture();
disconnected.type("Lost connection question");
disconnected.send();
await tick();
disconnected.type("Keep this newer follow-up");
disconnected.requests[0].reject(new Error("Fixture network failure"));
await tick();
tree = disconnected.render();
assert.match(text(tree), /Answer unavailable/);
assert.equal(elements(tree, (x) => x.props["data-preliminary-scripture"])[0].props.open, undefined);
assert.equal(elements(tree, (x) => x.type === "textarea")[0].props.value, "Keep this newer follow-up");
disconnected.send();
assert.equal(disconnected.contexts.at(-1).length, 1, "UI-only network errors must not enter reasoning context");
disconnected.requests[1].finish();
await tick();
disconnected.render();
const restored = chatFixture();
restored.type("Restore this question");
restored.send();
restored.requests[0].reject(new Error("Fixture network failure"));
await tick();
tree = restored.render();
assert.equal(elements(tree, (x) => x.type === "textarea")[0].props.value, "Restore this question");
console.log("PASS: insufficient evidence and HTTP/network failures retain exact wording, qualifications and preliminary access; newer drafts survive, empty drafts recover, and transport UI stays outside reasoning context");

const late = chatFixture({ evidenceLate: true });
late.type("Fast final answer");
late.send();
late.requests[0].finish();
await tick();
late.render();
late.deferredEvidence[0]();
await tick();
tree = late.render();
assert.equal(elements(tree, (x) => x.props["data-preliminary-scripture"]).length, 0, "Late evidence must not attach to an already finished answer");
const hidden = chatFixture({ props: { onClose() {} } });
hidden.type("Finish while hidden");
hidden.send();
await tick();
hidden.render({ active: false });
hidden.requests[0].finish();
await tick();
hidden.render();
tree = hidden.render({ active: true, launchKey: 1 });
assert.equal(elements(tree, (x) => x.props["data-emet-answer"])[1].props.children, exactAnswer);
assert.equal(hidden.requests.length, 1);
assert.equal(JSON.parse(hidden.sessionStorage.getItem("emetsees-conversation")).length, 2);
const contextualLocation = "https://fixture.invalid/read/Genesis/1?translation=kjv&verse=3";
const launched = chatFixture({ location: contextualLocation, draft: "Keep draft during contextual launch", props: { initialQuestion: "Context question", launchKey: 1 } });
assert.equal(launched.requests.length, 1);
assert.equal(launched.window.location.href, contextualLocation);
launched.requests[0].finish();
await tick();
launched.render();
launched.render({ active: false });
tree = launched.render({ active: true });
assert.equal(launched.requests.length, 1, "Reopening must not repeat an initial paid request");
assert.equal(elements(tree, (x) => x.type === "textarea")[0].props.value, "Keep draft during contextual launch");
console.log("PASS: late-evidence isolation, pending completion while hidden, single initial submission, and draft/history persistence across contextual reopen");

const quota = chatFixture();
quota.type("Quota fixture question");
quota.send();
await tick();
quota.type("Keep the next draft");
quota.requests[0].finish({ usage: { planName: "Fixture plan", questionLimit: 2, questionsUsed: 2, questionsRemaining: 0, resetsAt: "2026-11-01T00:00:00Z" } }, 429);
await tick();
tree = quota.render();
assert.match(text(tree), /allowance resets on/);
assert.equal(button(tree, "Send question").props.disabled, true);
assert.equal(elements(tree, (x) => x.type === "textarea")[0].props.value, "Keep the next draft");
assert.equal(elements(tree, (x) => x.props["data-preliminary-scripture"])[0].props.open, undefined);
const expired = chatFixture({ props: { returnTo: "/read/Genesis/1?translation=kjv&verse=3" } });
expired.type("Question before session expires");
expired.send();
expired.requests[0].finish({ status: "authentication-required" }, 401);
await tick();
expired.render();
const authDestination = new URL(expired.pushes[0], "https://fixture.invalid");
const nextDestination = new URL(authDestination.searchParams.get("next"), "https://fixture.invalid");
assert.equal(nextDestination.searchParams.get("returnTo"), "/read/Genesis/1?translation=kjv&verse=3");
assert.equal(expired.sessionStorage.getItem("emetsees-conversation-draft"), "Question before session expires");
console.log("PASS: quota and expired-session handling preserve drafts, preliminary access, and the contextual reading return URL");

// Both entry points render the same chat; contextual closing preserves the
// mounted instance and the reading URL rather than remounting a second layout.
for (const authenticated of [true, false]) {
  const env = environment();
  env.window.location = new URL("https://fixture.invalid/read/Genesis/1?translation=kjv&verse=3#verse-3");
  const readingHref = `${env.window.location.pathname}${env.window.location.search}${env.window.location.hash}`;
  const pushes = [];
  const fixture = createUiFixture({
    modules: {
      "next/navigation": { usePathname: () => "/read/Genesis/1", useRouter: () => ({ push: (href) => pushes.push(href) }) },
      "@/app/components/emet/EmetChat": component("chat"),
    }, globals: { ...env.globals, fetch: async () => ({ status: authenticated ? 200 : 401, ok: authenticated, json: async () => ({ usage: null }) }) },
  });
  const Global = fixture.load("app/components/GlobalAskButton.tsx").default;
  fixture.render(Global);
  env.listeners["emetsees:open-emet"]({ detail: { question: "Context question" } });
  await tick();
  tree = fixture.render();
  if (authenticated) {
    let chat = elements(tree, (x) => x.type === "chat")[0];
    assert.equal(chat.props.active, true);
    assert.match(elements(tree, x => x.props.role === "dialog")[0].props.className, /max-w-3xl.*100dvh/);
    assert.equal(chat.key, undefined, "Reopening must not key/remount the active request owner");
    chat.props.onClose();
    tree = fixture.render();
    chat = elements(tree, (x) => x.type === "chat")[0];
    assert.equal(chat.props.active, false);
    assert.equal(elements(tree, (x) => x.props.hidden === true).length, 1);
    assert.equal(env.document.body.style.overflow, "");
    assert.equal(`${env.window.location.pathname}${env.window.location.search}${env.window.location.hash}`, readingHref);
  } else {
    const authUrl = new URL(pushes[0], env.window.location.origin);
    const nextUrl = new URL(authUrl.searchParams.get("next"), env.window.location.origin);
    assert.equal(nextUrl.searchParams.get("q"), "Context question");
    assert.equal(nextUrl.searchParams.get("returnTo"), readingHref);
  }
}
const page = createUiFixture({ modules: {
  "@/app/lib/emet/experimental/SimpleEmetAccess": { canUseSimpleEmet: async () => false },
  "@/app/lib/emet/EmetPublicRouting": { getPublicEmetEngine: () => "simple" },
  "next/navigation": { redirect: (href) => { throw new Error(href); } },
  "@/app/components/emet/EmetChat": component("chat"),
  "@/app/lib/emet/EmetAiQuota": { getEmetAiUsageSummary: async () => null },
  "@/app/lib/supabase/server": { getVerifiedSupabaseUser: async () => ({ id: "local-user" }) },
} });
tree = await page.load("app/emet/page.tsx").default({ searchParams: Promise.resolve({ returnTo: "/read/Genesis/1?translation=kjv&verse=3" }) });
assert.equal(elements(tree, (x) => x.type === "chat").length, 1);
assert.equal(elements(tree, (x) => x.type === "chat")[0].props.returnTo, "/read/Genesis/1?translation=kjv&verse=3");
assert.equal(elements(tree, (x) => /overflow-y-auto/.test(x.props.className || "")).length, 0);
const helpers = page.load("app/components/emet/chatPresentation.ts");
assert.equal(helpers.safeChatReturnHref("//outside.invalid"), null);
assert.equal(helpers.safeChatReturnHref("/emet"), null);
assert.equal(helpers.publicQualification('{"claimId":"internal-1","message":"Only this setting is established."}'), "Only this setting is established.");
console.log("PASS: common page/panel chat layout, mounted contextual close, original reading URL, authenticated return path, and public qualification formatting");
console.log("Ask EMET conversation UI fixture regressions passed. No external or AI requests were made.");
const publicHistory=chatFixture({draft:'Public draft',props:{initialEngine:'simple'}});
assert.equal(elements(publicHistory.tree(),x=>x.type==='select').length,0);
publicHistory.type('Who is the Father?');publicHistory.send();assert.equal(publicHistory.requests[0].body.engine,undefined);
assert.equal(publicHistory.requests[0].body.simpleHistory.length,1,'Existing public history must reach Simple EMET');
publicHistory.requests[0].finish({...answerPayload,shareStudyId:undefined});await tick();publicHistory.render();
publicHistory.type('Your previous answer contradicts Scripture');publicHistory.send();assert.equal(publicHistory.requests[1].body.simpleHistory.at(-1).question,'Who is the Father?');
publicHistory.requests[1].finish({...answerPayload,shareStudyId:undefined});await tick();publicHistory.render();
publicHistory.type('Draft before rollback');publicHistory.render({initialEngine:'current'});
assert.equal(elements(publicHistory.tree(),x=>x.type==='textarea')[0].props.value,'Draft before rollback');
assert.equal(elements(publicHistory.tree(),x=>x.props['data-emet-answer']).length,3,'Server routing changes must not switch stored threads');
assert.doesNotMatch(text(publicHistory.tree()),/Owner testing|experimental|Private owner test/);
console.log('PASS: no engine selector, server-selected Simple requests, existing public history, follow-up context and draft/history preservation across rollback.');
const sourceText='Exact server-constructed Scripture text.';
const simplePayload={status:'complete',source:'simple-owner-model',answer:{...answerPayload.answer,claims:[],componentChecks:[],continuityChecks:[],sourceVerification:'locked-corpus-text',citations:[{evidenceId:'scripture:kjv:simple:Genesis 1:1',reference:'Genesis 1:1',translation:'kjv',text:sourceText,verification:'locked-corpus-text'}]}};
const sourceChat=chatFixture({history:[],props:{initialEngine:"simple",initialOwnerDiagnostics:true}});
sourceChat.render();sourceChat.type('A source display fixture');sourceChat.send();sourceChat.requests[0].finish(simplePayload);await tick();sourceChat.render();
assert.match(text(sourceChat.tree()),/Scripture passages · 1/);
assert.doesNotMatch(text(sourceChat.tree()),/Final supporting citations/);
assert.equal(elements(sourceChat.tree(),x=>x.type==='blockquote')[0].props.children,sourceText);
assert.match(text(sourceChat.tree()),/explanation is model-generated/);
const sourceLink=elements(sourceChat.tree(),x=>x.type==='a'&&x.props.href?.includes('translation=kjv'))[0];assert.ok(sourceLink);
const reopened=chatFixture({history:[{id:'source-fixture',question:'A saved source fixture',source:'simple-owner-model',answer:simplePayload.answer}]});
assert.match(text(reopened.tree()),/Scripture passages · 1/);assert.equal(elements(reopened.tree(),x=>x.type==='blockquote')[0].props.children,sourceText);
const currentChat=chatFixture({history:[{...prior,answer:{...prior.answer,citations:answerPayload.answer.citations}}]});assert.match(text(currentChat.tree()),/Final supporting citations/);assert.equal(elements(currentChat.tree(),x=>x.type==='blockquote').length,0);
console.log('PASS: integrated Simple source disclosure, server text rendering, translation-aware navigation, API normalization and saved-history restoration; current engine disclosure unchanged.');
const unresolvedAnswer='An exact model answer, including “a quoted explanatory phrase” and Invented 999:1.';
const unresolvedPayload={...simplePayload,status:'complete-unverified',shareStudyId:'must-never-be-published',answer:{...simplePayload.answer,answer:unresolvedAnswer,verificationStatus:'unverified',unresolvedReferences:[{reference:'Invented 999:1',translation:'web',reason:'citation-unresolved'}]}};
const inspectChat=chatFixture({history:[],props:{initialEngine:"simple",initialOwnerDiagnostics:true}});
inspectChat.render();inspectChat.type('Can a Christian eat pork?');inspectChat.send();inspectChat.requests[0].finish(unresolvedPayload);await tick();inspectChat.render();
assert.equal(elements(inspectChat.tree(),x=>x.props['aria-label']==='EMET response')[0].props.children,unresolvedAnswer);
assert.equal(elements(inspectChat.tree(),x=>x.props['aria-label']==='Unverified model answer'&&x.props.role==='alert').length,1);
assert.match(text(inspectChat.tree()),/owner inspection only/);
assert.match(text(inspectChat.tree()),/Invented 999:1 · web — not verified/);
assert.equal(elements(inspectChat.tree(),x=>x.type==='a'&&text(x).includes('Invented')).length,0);
assert.equal(elements(inspectChat.tree(),x=>x.props['aria-label']==='Publish and share this answer').length,0);
assert.equal(elements(inspectChat.tree(),x=>x.type==='blockquote')[0].props.children,sourceText);
inspectChat.type('Does your previous answer follow from Scripture?');inspectChat.send();
assert.equal(inspectChat.requests[1].body.simpleHistory[0].answer,unresolvedAnswer);
inspectChat.requests[1].finish(unresolvedPayload);await tick();inspectChat.render();
const restoredInspection=chatFixture({props:{initialOwnerDiagnostics:true},history:[{id:'unverified-stored',question:'An owner question',source:'simple-owner-model',shareStudyId:'must-stay-hidden',answer:unresolvedPayload.answer}]});
assert.equal(elements(restoredInspection.tree(),x=>x.props['aria-label']==='Unverified model answer').length,1);
assert.equal(elements(restoredInspection.tree(),x=>x.props['aria-label']==='Publish and share this answer').length,0);
assert.match(text(restoredInspection.tree()),/Invented 999:1/);
const noSources=chatFixture({props:{initialOwnerDiagnostics:true},history:[{id:'no-sources',question:'An owner question',source:'simple-owner-model',answer:{...unresolvedPayload.answer,citations:[]}}]});
assert.equal(elements(noSources.tree(),x=>x.props['aria-label']==='EMET response')[0].props.children,unresolvedAnswer);
assert.equal(elements(noSources.tree(),x=>x.type==='blockquote').length,0);
assert.equal(elements(noSources.tree(),x=>x.type==='a'&&text(x).includes('Invented')).length,0);
console.log('PASS: exact unresolved answer inspection, prominent warning, invalid references remain unlinked, verified subset source text, sharing blocked, follow-up context and persisted warning state.');
for(const support of ['strong-implication','theological-synthesis']){
 const message=support==='strong-implication'?'This answer includes an inference from Scripture.':'This answer brings several passages together in interpretation.';
 const material='The passage addresses this audience; extending the conclusion requires additional evidence.';
 const notice='Owner experiment: passage text is checked; the explanation remains model-generated.';
 const styleAnswer={...simplePayload.answer,conclusionSupport:support,limitations:[material,notice]};
 const calm=chatFixture({history:[{id:'style-simple',question:'Explain the passage',source:'simple-owner-model',answer:styleAnswer}]});
 assert.ok(!text(calm.tree()).includes(message));assert.ok(text(calm.tree()).includes(material));assert.ok(text(calm.tree()).includes(notice));
 assert.equal(elements(calm.tree(),x=>x.props['aria-label']==='EMET response')[0].props.children,styleAnswer.answer);
 const publicStyle=chatFixture({history:[{id:'style-current',question:'Explain the passage',source:'model',answer:{...prior.answer,conclusionSupport:support,limitations:[material]}}]});
 assert.ok(text(publicStyle.tree()).includes(message));assert.ok(text(publicStyle.tree()).includes(material));
}
for(const[support,message]of [['possible-interpretation','This is a possible interpretation, rather than an explicit statement of Scripture.'],['does-not-establish','The available evidence does not establish this conclusion.']]){
 const uncertain=chatFixture({history:[{id:'material-uncertainty',question:'What follows?',source:'simple-owner-model',answer:{...simplePayload.answer,conclusionSupport:support}}]});
 assert.ok(text(uncertain.tree()).includes(message));
}
console.log('PASS: Simple supported-answer generic notices omitted; all supplied material limitations, owner notices and genuine uncertainty retained; public engine qualifications and answer text unchanged.');

// Deterministic DOM-geometry fixtures, not a browser layout/keyboard simulation.
const scrollRegion = chat => elements(chat.tree(), x => x.props['aria-label'] === 'Conversation')[0];
const lastAnswerAnchor = chat => elements(chat.tree(), x => x.props['data-emet-scroll-anchor']?.endsWith(':answer')).at(-1).props['data-emet-scroll-anchor'];
const questionAnchorFor = answerAnchor => answerAnchor.replace(/:answer$/, ':question');
function assertResponseBeginning(chat) {
 const answerKey = lastAnswerAnchor(chat);
 const responseOffset = chat.anchorTop(answerKey) - chat.viewport.scrollTop;
 assert.ok(responseOffset >= 0 && responseOffset < chat.viewport.clientHeight - 80, `Response beginning must be visible, offset=${responseOffset}`);
}
const shortArrival = chatFixture({history:[]});
shortArrival.viewport.scrollHeight=400;
shortArrival.type('A short answer question');shortArrival.send();await tick();shortArrival.render();
shortArrival.requests[0].finish({...answerPayload,answer:{...answerPayload.answer,answer:'A short answer.'}});await tick();shortArrival.render();
assert.equal(shortArrival.viewport.scrollTop,0);assertResponseBeginning(shortArrival);

const longArrival = chatFixture();
longArrival.viewport.scrollHeight=6000;
longArrival.type('A long answer question');longArrival.send();await tick();longArrival.render();
const longText='A paragraph requiring natural downward reading.\n\n'.repeat(120);
longArrival.requests[0].finish({...answerPayload,answer:{...answerPayload.answer,answer:longText}});await tick();longArrival.render();
assertResponseBeginning(longArrival);
assert.equal(longArrival.viewport.scrollTop,longArrival.anchorTop(questionAnchorFor(lastAnswerAnchor(longArrival)))-8);
assert.ok(longArrival.viewport.scrollTop < longArrival.viewport.scrollHeight-longArrival.viewport.clientHeight);
assert.equal(elements(longArrival.tree(),x=>x.props['data-emet-answer']).at(-1).props.children,longText);
// A later observer callback must not repeat the arrival scroll or chase the end.
const arrivalTop=longArrival.viewport.scrollTop;
longArrival.viewport.scrollHeight+=200;longArrival.observers.forEach(fn=>fn());assert.equal(longArrival.viewport.scrollTop,arrivalTop);
// The next explicit question gets its own stable anchor after following the end.
longArrival.viewport.scrollTop=longArrival.viewport.scrollHeight;
scrollRegion(longArrival).props.onScroll({currentTarget:longArrival.viewport});
longArrival.type('A second consecutive question');longArrival.send();await tick();longArrival.render();
longArrival.viewport.scrollHeight=12000;
longArrival.requests[1].finish({...answerPayload,answer:{...answerPayload.answer,answer:longText}});await tick();longArrival.render();assertResponseBeginning(longArrival);
const secondTop=longArrival.viewport.scrollTop;
longArrival.observers.forEach(fn=>fn());assert.equal(longArrival.viewport.scrollTop,secondTop);

const interrupted = chatFixture();interrupted.viewport.scrollHeight=7000;
interrupted.type('Read older material while waiting');interrupted.send();await tick();interrupted.render();
scrollRegion(interrupted).props.onWheelCapture({deltaY:-100});
interrupted.viewport.scrollTop=100;scrollRegion(interrupted).props.onScroll({currentTarget:interrupted.viewport});
interrupted.requests[0].finish({...answerPayload,answer:{...answerPayload.answer,answer:longText}});await tick();interrupted.render();
assert.equal(interrupted.viewport.scrollTop,100,'Manual upward scrolling during generation cancels the reveal');
interrupted.observers.forEach(fn=>fn());assert.equal(interrupted.viewport.scrollTop,100);
// Reading farther down after arrival must also survive observers and drafts.
interrupted.viewport.scrollTop=150;scrollRegion(interrupted).props.onScroll({currentTarget:interrupted.viewport});
interrupted.type('A preserved follow-up draft');interrupted.render();interrupted.observers.forEach(fn=>fn());assert.equal(interrupted.viewport.scrollTop,150);

// If preliminary content consumes the viewport, prefer the actual response
// instead of scrolling to a question that would hide the response beginning.
const tallPreliminary = chatFixture();tallPreliminary.viewport.scrollHeight=6000;
tallPreliminary.type('A question with large preliminary evidence');tallPreliminary.send();await tick();tallPreliminary.render();
const pendingKey=elements(tallPreliminary.tree(),x=>x.props['aria-label']==='Pending question')[0].key;
const questionTop=tallPreliminary.anchorTop(`${pendingKey}:question`);
tallPreliminary.positionAnchor(`${pendingKey}:answer`,{top:questionTop+600,height:2500});
tallPreliminary.requests[0].finish({...answerPayload,answer:{...answerPayload.answer,answer:longText}});await tick();tallPreliminary.render();
assert.equal(tallPreliminary.viewport.scrollTop,questionTop+600-8);assertResponseBeginning(tallPreliminary);

// Preserve a stable reading offset when content above it expands or collapses.
const anchored = chatFixture();anchored.viewport.scrollHeight=6000;
anchored.type('A layout preservation question');anchored.send();await tick();anchored.render();anchored.requests[0].finish({...answerPayload,answer:{...answerPayload.answer,answer:longText}});await tick();anchored.render();
const key=lastAnswerAnchor(anchored);
anchored.viewport.scrollTop=anchored.anchorTop(key)+100;scrollRegion(anchored).props.onScroll({currentTarget:anchored.viewport});
const originalOffset=anchored.anchorTop(key)-anchored.viewport.scrollTop;
const disclosure=new anchored.globals.Element();disclosure.closest=()=>({});
scrollRegion(anchored).props.onPointerDownCapture({target:disclosure});
const beforeExpansion=anchored.viewport.scrollTop;
anchored.positionAnchor(key,{top:anchored.anchorTop(key)+180});anchored.viewport.scrollHeight+=180;
anchored.observers.forEach(fn=>fn());
assert.equal(anchored.viewport.scrollTop,beforeExpansion+180);assert.equal(anchored.anchorTop(key)-anchored.viewport.scrollTop,originalOffset);
anchored.observers.forEach(fn=>fn());assert.equal(anchored.viewport.scrollTop,beforeExpansion+180,'No repeated movement for an unchanged expanded source');
scrollRegion(anchored).props.onKeyDownCapture({key:'Enter',target:disclosure});
anchored.positionAnchor(key,{top:anchored.anchorTop(key)-80});anchored.observers.forEach(fn=>fn());
assert.equal(anchored.anchorTop(key)-anchored.viewport.scrollTop,originalOffset,'Qualifications/content changes preserve the same reading offset');
// Composer and keyboard resizing preserve position rather than jump to the end.
const beforeKeyboard=anchored.viewport.scrollTop;
anchored.viewport.clientHeight=240;anchored.window.visualViewport.height=420;anchored.viewportListeners.resize();
assert.equal(anchored.root.style.height,'360px');assert.equal(anchored.viewport.scrollTop,beforeKeyboard);
anchored.viewport.top+=24;anchored.window.visualViewport.offsetTop=24;anchored.viewportListeners.scroll();
assert.equal(anchored.anchorTop(key)-anchored.viewport.scrollTop,originalOffset);
anchored.viewport.top-=24;anchored.window.visualViewport.height=800;anchored.window.visualViewport.offsetTop=0;anchored.viewport.clientHeight=400;anchored.viewportListeners.resize();
assert.equal(anchored.root.style.height,'');assert.equal(anchored.viewport.scrollTop,beforeKeyboard);
anchored.type('A multiline\nfollow-up\ndraft');anchored.observers.forEach(fn=>fn());assert.equal(anchored.viewport.scrollTop,beforeKeyboard);
// Hide/reopen and persisted following=true both retain saved reading positions.
anchored.render({active:false});anchored.render({active:true});assert.equal(anchored.viewport.scrollTop,beforeKeyboard);
const restoredFollower = chatFixture({scroll:{top:125,following:true}});
assert.equal(restoredFollower.viewport.scrollTop,125);restoredFollower.observers.forEach(fn=>fn());assert.equal(restoredFollower.viewport.scrollTop,125);
// Completion while a panel is hidden reveals once on reopening, not while hidden.
const hiddenArrival=chatFixture();hiddenArrival.viewport.scrollHeight=6000;
hiddenArrival.type('A hidden pending answer');hiddenArrival.send();await tick();hiddenArrival.render();const hiddenTop=hiddenArrival.viewport.scrollTop;
hiddenArrival.render({active:false});hiddenArrival.requests[0].finish({...answerPayload,answer:{...answerPayload.answer,answer:longText}});await tick();hiddenArrival.render();assert.equal(hiddenArrival.viewport.scrollTop,hiddenTop);
hiddenArrival.render({active:true});assertResponseBeginning(hiddenArrival);

const simpleArrival=chatFixture({history:[],props:{initialEngine:"simple",initialOwnerDiagnostics:true}});
simpleArrival.render();simpleArrival.viewport.scrollHeight=6000;
simpleArrival.type('A Simple EMET reading fixture');simpleArrival.send();simpleArrival.requests[0].finish({...unresolvedPayload,answer:{...unresolvedPayload.answer,answer:longText}});await tick();simpleArrival.render();assertResponseBeginning(simpleArrival);
assert.equal(elements(simpleArrival.tree(),x=>x.props['aria-label']==='Unverified model answer').length,1);
assert.equal(elements(simpleArrival.tree(),x=>x.props['aria-label']==='Publish and share this answer').length,0);
assert.match(scrollRegion(simpleArrival).props.className,/px-3.*sm:px-5/);
assert.match(elements(simpleArrival.tree(),x=>x.props['data-emet-content'])[0].props.className,/space-y-5/);
assert.match(elements(simpleArrival.tree(),x=>x.type==='form')[0].props.className,/shrink-0.*safe-area-inset-bottom/);
console.log('PASS: short/long answers, consecutive questions, question visibility, large preliminary sections, manual scrolling during/after generation, stable source/qualification anchors, reopening including followers, hidden completion, keyboard/composer resize, and current/Simple rendering with deterministic geometry fixtures. Browser/device verification remains separate.');

for (const gesture of ["touch", "keyboard"]) {
  const manual = chatFixture(); manual.viewport.scrollHeight = 6000;
  manual.type(`A ${gesture} reading fixture`); manual.send(); await tick(); manual.render();
  if (gesture === "touch") scrollRegion(manual).props.onTouchMoveCapture();
  else scrollRegion(manual).props.onKeyDownCapture({ key: "PageUp", target: new manual.globals.Element() });
  manual.viewport.scrollTop = 100;
  scrollRegion(manual).props.onScroll({ currentTarget: manual.viewport });
  manual.requests[0].finish({ ...answerPayload, answer: { ...answerPayload.answer, answer: longText } }); await tick(); manual.render();
  assert.equal(manual.viewport.scrollTop, 100, `${gesture} reading intent prevents an arrival jump`);
}
const widthPageTree = await page.load("app/emet/page.tsx").default({ searchParams: Promise.resolve({}) });
assert.equal(elements(widthPageTree, x => /max-w-3xl/.test(x.props.className || "")).length, 1);
console.log("PASS: touch/keyboard manual reading guards and matching wider page/panel shells; no browser rendering is implied.");

const publicDefault=chatFixture({history:[prior],props:{initialEngine:undefined}});
assert.equal(elements(publicDefault.tree(),x=>x.type==='select').length,0);
publicDefault.type('Default public question');publicDefault.send();assert.equal(publicDefault.requests[0].url,'/api/emet/ask');assert.equal(publicDefault.requests[0].body.simpleHistory[0].answer,prior.answer.answer);assert.equal(elements(publicDefault.tree(),x=>x.props['data-preliminary-scripture']).length,0);
publicDefault.requests[0].finish({...simplePayload,source:'simple-model'});await tick();publicDefault.render();assert.match(text(publicDefault.tree()),/Scripture passages/);assert.doesNotMatch(text(publicDefault.tree()),/Owner testing|experimental|Private owner test/);
const legacyOwner={...prior,id:'legacy-owner',question:'A preserved owner question',source:'simple-model',answer:simplePayload.answer};
const migrated=chatFixture({history:[prior],legacyHistory:[legacyOwner],legacyDraft:'Owner follow-up',props:{initialEngine:'simple',initialOwnerDiagnostics:true}});
assert.match(text(migrated.tree()),/A preserved owner question/);assert.equal(elements(migrated.tree(),x=>x.type==='textarea')[0].props.value,'Owner follow-up');
assert.equal(JSON.parse(migrated.sessionStorage.getItem('emetsees-conversation'))[0].question,prior.question,'Public history must not be overwritten when preserving a legacy owner thread');
migrated.render({initialEngine:'current'});assert.match(text(migrated.tree()),/A preserved owner question/);assert.equal(elements(migrated.tree(),x=>x.type==='textarea')[0].props.value,'Owner follow-up');
const noOwner=chatFixture({history:[prior],legacyHistory:[legacyOwner],props:{initialEngine:'simple',initialOwnerDiagnostics:false}});assert.doesNotMatch(text(noOwner.tree()),/A preserved owner question/);
const privateHistory=chatFixture({history:[{...legacyOwner,source:'simple-owner-model',answer:unresolvedPayload.answer}],props:{initialOwnerDiagnostics:false}});assert.doesNotMatch(text(privateHistory.tree()),/Invented 999:1|An exact model answer/);assert.match(text(privateHistory.tree()),/authorized owner inspection/);
console.log('PASS: actual public default, no selector/experimental labels, public history preserved, legacy owner history/draft preserved without merging threads, rollback continuity and private saved diagnostics hidden from non-owners.');

const publicUnverified=chatFixture({history:[{...legacyOwner,source:'simple-model',answer:{...unresolvedPayload.answer,unresolvedReferences:undefined}}],props:{initialEngine:'simple',initialOwnerDiagnostics:false}});
assert.equal(elements(publicUnverified.tree(),x=>x.props['aria-label']==='Unverified model answer').length,1);
assert.equal(elements(publicUnverified.tree(),x=>x.props['data-emet-answer'])[0].props.children,unresolvedPayload.answer.answer);
assert.doesNotMatch(text(publicUnverified.tree()),/owner inspection only|Unresolved references/);
assert.equal(elements(publicUnverified.tree(),x=>x.props['aria-label']==='Unresolved references (not verified)').length,0);
assert.equal(elements(publicUnverified.tree(),x=>x.props['aria-label']==='Publish and share this answer').length,0);
console.log('PASS: public unresolved answers keep exact prose and a visible warning, private source diagnostics stay hidden, publishing remains blocked.');
