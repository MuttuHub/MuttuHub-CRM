// Shared IntersectionObserver mock for infinite-scroll tests (hook +
// audit-log-section + accesos-section). jsdom does not implement
// IntersectionObserver, so tests that exercise scroll-triggered fetching
// install this mock and drive it manually via `trigger(isIntersecting)`.
import { vi } from "vitest";

type Callback = IntersectionObserverCallback;

export class MockIntersectionObserver implements IntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly root: Element | Document | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];

  callback: Callback;
  observedNodes: Element[] = [];
  observe = vi.fn((node: Element) => {
    this.observedNodes.push(node);
  });
  unobserve = vi.fn((node: Element) => {
    this.observedNodes = this.observedNodes.filter((n) => n !== node);
  });
  disconnect = vi.fn(() => {
    this.observedNodes = [];
  });
  takeRecords = vi.fn((): IntersectionObserverEntry[] => []);

  constructor(callback: Callback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  /** Test helper: simulate the sentinel entering/leaving the viewport. */
  trigger(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this,
    );
  }
}

/** Installs the mock as `window.IntersectionObserver` and resets the
 * instance registry. Call from `beforeEach`; pair with `vi.unstubAllGlobals()`
 * in `afterEach`. */
export function installMockIntersectionObserver() {
  MockIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  return MockIntersectionObserver;
}

/** Returns the most recently constructed mock observer instance. */
export function latestIntersectionObserver(): MockIntersectionObserver {
  const instance =
    MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1];
  if (!instance) {
    throw new Error("No MockIntersectionObserver instance was created yet.");
  }
  return instance;
}
