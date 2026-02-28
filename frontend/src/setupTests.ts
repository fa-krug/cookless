import '@testing-library/jest-dom'

// Polyfill window.matchMedia for jsdom (used by useMediaQuery)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Polyfill ResizeObserver for jsdom (used by Radix UI)
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Polyfill pointer capture / scrollIntoView for jsdom (used by Radix UI)
window.HTMLElement.prototype.scrollIntoView = () => {};
window.HTMLElement.prototype.hasPointerCapture = () => false;
window.HTMLElement.prototype.setPointerCapture = () => {};
window.HTMLElement.prototype.releasePointerCapture = () => {};

// Patch getComputedStyle for vaul (Drawer): jsdom returns "" for CSS
// transform, but vaul expects a valid value like "none" for its
// swipe-to-close pointer tracking.
const _origGetComputedStyle = window.getComputedStyle;
window.getComputedStyle = (elt: Element, pseudoElt?: string | null) => {
  const style = _origGetComputedStyle(elt, pseudoElt);
  if (!style.transform) {
    Object.defineProperty(style, "transform", { value: "none" });
  }
  return style;
};
