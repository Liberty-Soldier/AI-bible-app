import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

// A small hook/element fixture runner, not a browser or a React DOM substitute.
// It executes the actual component handlers with controlled storage and requests.
export function createUiFixture({ modules = {}, globals = {}, onElement } = {}) {
  const slots = [];
  const effects = [];
  let cursor = 0;
  let dirty = false;
  let component;
  let props;
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], (value) => {
        const next = typeof value === "function" ? value(slots[i]) : value;
        if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; }
      }];
    },
    useRef(initial) { return react.useState(() => ({ current: initial }))[0]; },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        const previous = slots[i];
        slots[i] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
    useEffectEvent(fn) {
      const ref = react.useRef(fn);
      ref.current = fn;
      return (...args) => ref.current(...args);
    },
    createContext(value) {
      const context = { current: value };
      context.Provider = { context };
      return context;
    },
    useContext(context) { return context.current; },
    cache(fn) { return fn; },
  };
  react.useLayoutEffect = react.useEffect;
  const jsx = (type, elementProps, key) => {
    if (type?.context) type.context.current = elementProps.value;
    const element = { type, props: elementProps || {}, key };
    onElement?.(element);
    return element;
  };
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = fs.readFileSync(filename, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      fileName: filename,
    });
    const require = (id) => {
      if (id === "react") return react;
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (id in modules) return modules[id];
      let target = id.startsWith("@/") ? path.resolve(id.slice(2))
        : id.startsWith(".") ? path.resolve(path.dirname(filename), id) : null;
      if (!target) throw new Error(`Unexpected fixture import: ${id}`);
      if (!path.extname(target)) target += fs.existsSync(`${target}.ts`) ? ".ts" : ".tsx";
      return load(target);
    };
    vm.runInNewContext(outputText, { module, exports: module.exports, require, console, URL, URLSearchParams, ...globals }, { filename });
    return module.exports;
  }
  function render(nextComponent = component, nextProps = props) {
    component = nextComponent;
    props = nextProps;
    let tree;
    for (let pass = 0; pass < 20; pass++) {
      dirty = false;
      cursor = 0;
      tree = component(props);
      while (effects.length) effects.shift()();
      if (!dirty) return tree;
    }
    throw new Error("Fixture did not settle");
  }
  return { load, render };
}

export function elements(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => elements(child, predicate));
  if (typeof tree.type === "function" && tree.type.name === "InitialScripture") {
    return elements(tree.type(tree.props), predicate);
  }
  return [...(predicate(tree) ? [tree] : []), ...elements(tree.props?.children, predicate)];
}

export function text(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  return text(tree.props?.children);
}

export function storage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
  };
}
