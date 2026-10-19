// Test helper: jsdom has no layout, so the viewport is decided by the `matchMedia` mock. `mockViewport(true)`
// makes the phone query `(max-width: 767px)` match; any other query keeps answering `false`.

import { expect, vi } from "vitest"

export function mockViewport(mobile: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: mobile && query.includes("max-width"),
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

/** Every text control, select and button of a capture form is a 44 px touch target (`h-11`). */
export function expectTouchTargets(form: HTMLElement): void {
  const controls = Array.from(
    form.querySelectorAll<HTMLElement>("input:not([type=radio]):not([type=file]), select, button"),
  )
  expect(controls.length).toBeGreaterThan(2)
  for (const control of controls) {
    expect(control.className, control.outerHTML.slice(0, 90)).toMatch(/(^|\s)h-11(\s|$)/)
  }
}
