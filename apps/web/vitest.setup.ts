import { config } from "dotenv";

config({ path: ".env.test" });

// jsdom has no layout engine, so `offsetParent` always returns null regardless
// of whether an element is actually hidden (https://github.com/jsdom/jsdom/issues/1590).
// Components that use `offsetParent !== null` as a "is this visibly rendered"
// check (e.g. focus-trap logic that must skip display:none elements) need a
// stand-in here so that behaviour matches real browsers under test.
if (typeof HTMLElement !== "undefined" && typeof document !== "undefined") {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      if (!document.body.contains(this)) return null;
      let node: HTMLElement | null = this;
      while (node) {
        if (node.style?.display === "none" || getComputedStyle(node).display === "none") {
          return null;
        }
        node = node.parentElement;
      }
      return document.body;
    },
  });
}

if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (index) => [...store.keys()][index] ?? null,
  } as Storage;
}
