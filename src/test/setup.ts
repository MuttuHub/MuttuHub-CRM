import "@testing-library/jest-dom/vitest"
import { vi } from "vitest"

// Cleanup: @testing-library/react auto-registers afterEach(() => cleanup())
// when a global `afterEach` exists (vitest `globals: true` provides it),
// so no manual cleanup is needed here.
// See: node_modules/@testing-library/react/dist/index.js

if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

if (typeof window !== "undefined" && typeof ResizeObserver === "undefined") {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverMock
}