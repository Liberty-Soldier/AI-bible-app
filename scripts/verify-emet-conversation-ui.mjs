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
  const textarea = { style: {}, scrollHeight: 44 };
  const flushTimers = () => {
    for (const [id, timer] of [...timers]) if (timer.delay === 0) { timers.delete(id); timer.fn(); }
  };
  return {
    sessionStorage, localStorage, window, document, listeners, viewportListeners, observers, root, viewport, textarea, flushTimers,
    globals: { window, document, Element, HTMLElement, DOMException,
      crypto: { randomUUID: (() => { let count = 0; return () => `fixture-${++count}`; })() },
      ResizeObserver: class { constructor(fn) { observers.push(fn); } observe() {} disconnect() {} },
    },
    onElement(element) {
      if (!element.props.ref || typeof element.props.ref !== "object") return;
      if (element.props["data-emet-chat"]) element.props.ref.current = root;
      else if (element.props["aria-label"] === "Conversation") element.props.ref.current = viewport;
      else if (element.type === "textarea") element.props.ref.current = textarea;
      else if (element.type === "div" && element.props.className === "space-y-6") element.props.ref.current = content;
    },
  };
}

function chatFixture({ history = [prior], draft = "", scroll, props = {}, evidenceLate = false, location } = {}) {
  const env = environment({
    "emetsees-conversation": JSON.stringify(history),
    "emetsees-conversation-id": "conversation-before",
    "emetsees-conversation-draft": draft,
    ...(scroll ? { "emetsees-conversation-scroll": JSON.stringify({ conversationId: "conversation-before", ...scroll }) } : {}),
  });
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
  let currentProps = { initialUsage: null, ...props };
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
assert.equal(live.viewport.scrollTop, 1200, "A follower should remain at the newest content");
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
assert.equal(reading.viewport.scrollTop, 1800);
const disclosureTarget = new reading.globals.Element();
disclosureTarget.closest = () => ({});
region.props.onPointerDownCapture({ target: disclosureTarget });
reading.viewport.scrollHeight = 2400;
reading.observers.forEach((fn) => fn());
assert.equal(reading.viewport.scrollTop, 1800, "Expanding evidence must stop follow-to-bottom behavior");
console.log("PASS: older-message scroll restoration/stability, following-only auto-scroll, evidence inspection, and visual-viewport composer sizing with fixtures");

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
const ownerChat = chatFixture({ draft: 'Current draft', props: { initialSimpleAvailable: true } });
let selector = elements(ownerChat.tree(), x => x.type === 'select' && x.props.value === 'current')[0];
assert.ok(selector);
selector.props.onChange({ target: { value: 'simple' } });
ownerChat.render();
assert.equal(elements(ownerChat.tree(), x => x.type === 'textarea')[0].props.value, '');
ownerChat.type('Who is the Father?'); ownerChat.send();
assert.equal(ownerChat.requests[0].body.engine,'simple');
assert.equal(ownerChat.requests[0].body.simpleHistory.length,0);
ownerChat.requests[0].finish({ ...answerPayload, shareStudyId: undefined });
await tick(); ownerChat.render();
ownerChat.type('Your previous answer contradicts Scripture'); ownerChat.send();
assert.equal(ownerChat.requests[1].body.simpleHistory.length,1);
assert.equal(ownerChat.requests[1].body.simpleHistory[0].question,'Who is the Father?');
assert.equal(ownerChat.requests[1].body.simpleHistory[0].answer, answerPayload.answer.answer);
ownerChat.requests[1].finish({ ...answerPayload, shareStudyId: undefined }); await tick(); ownerChat.render();
selector = elements(ownerChat.tree(), x => x.type === 'select')[0]; selector.props.onChange({ target: { value: 'current' } }); ownerChat.render();
assert.equal(elements(ownerChat.tree(), x => x.type === 'textarea')[0].props.value,'Current draft');
assert.equal(elements(chatFixture().tree(), x => x.type === 'select').length,0);
console.log('PASS: owner testing control, current default, isolated engine history/drafts, full immediate follow-up context and ordinary-user control visibility.');
const sourceText='Exact server-constructed Scripture text.';
const simplePayload={status:'complete',source:'simple-owner-model',answer:{...answerPayload.answer,claims:[],componentChecks:[],continuityChecks:[],sourceVerification:'locked-corpus-text',citations:[{evidenceId:'scripture:kjv:simple:Genesis 1:1',reference:'Genesis 1:1',translation:'kjv',text:sourceText,verification:'locked-corpus-text'}]}};
const sourceChat=chatFixture({history:[],props:{initialSimpleAvailable:true}});
elements(sourceChat.tree(),x=>x.type==='select')[0].props.onChange({target:{value:'simple'}});sourceChat.render();sourceChat.type('A source display fixture');sourceChat.send();sourceChat.requests[0].finish(simplePayload);await tick();sourceChat.render();
assert.match(text(sourceChat.tree()),/Scripture passages · 1/);
assert.doesNotMatch(text(sourceChat.tree()),/Final supporting citations/);
assert.equal(elements(sourceChat.tree(),x=>x.type==='blockquote')[0].props.children,sourceText);
assert.match(text(sourceChat.tree()),/explanation is model-generated/);
const sourceLink=elements(sourceChat.tree(),x=>x.type==='a'&&x.props.href?.includes('translation=kjv'))[0];assert.ok(sourceLink);
const reopened=chatFixture({history:[{id:'source-fixture',question:'A saved source fixture',source:'simple-owner-model',answer:simplePayload.answer}]});
assert.match(text(reopened.tree()),/Scripture passages · 1/);assert.equal(elements(reopened.tree(),x=>x.type==='blockquote')[0].props.children,sourceText);
const currentChat=chatFixture({history:[{...prior,answer:{...prior.answer,citations:answerPayload.answer.citations}}]});assert.match(text(currentChat.tree()),/Final supporting citations/);assert.equal(elements(currentChat.tree(),x=>x.type==='blockquote').length,0);
console.log('PASS: integrated Simple source disclosure, server text rendering, translation-aware navigation, API normalization and saved-history restoration; current engine disclosure unchanged.');
