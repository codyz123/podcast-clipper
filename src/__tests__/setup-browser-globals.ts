// Setup file for tests that import browser-dependent modules (stores, api, etc.)
// Must run before any test file imports to avoid "window is not defined" errors.

if (typeof globalThis.window === "undefined") {
  // @ts-expect-error — minimal window shim for module-level code in settingsStore/api
  globalThis.window = {
    location: { hostname: "localhost", origin: "http://localhost:1420" } as Location,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    },
  };
}
