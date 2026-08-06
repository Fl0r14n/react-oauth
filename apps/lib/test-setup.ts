import { GlobalRegistrator } from '@happy-dom/global-registrator'

// bun test runs in a bare JS runtime; @testing-library/react and the component specs need a DOM.
// Preloaded via bunfig.toml so this runs before any spec module is evaluated.
const {
  fetch: bunFetch,
  Request: BunRequest,
  Response: BunResponse,
  Headers: BunHeaders,
  FormData: BunFormData,
  Blob: BunBlob
} = globalThis

GlobalRegistrator.register()

// happy-dom installs its own fetch, which routes through `node:http`. Under Bun that shim mis-parses
// responses from a Bun.serve origin — `HPE_UNEXPECTED_CONTENT_LENGTH` — so any spec talking to a local
// test server fails at the transport layer for reasons that have nothing to do with the code under
// test. Bun's native fetch is both spec-compliant and what the library actually gets at runtime, so put
// it back. Nothing here needs happy-dom's fetch: it exists for the DOM, not the network.
//
// The body types go back with it. A happy-dom FormData handed to Bun's fetch is not the FormData it
// knows, so it never gets serialized as multipart — the request goes out with no Content-Type at all,
// which looks exactly like a library bug and is not one.
Object.defineProperties(globalThis, {
  fetch: { value: bunFetch, configurable: true, writable: true },
  Request: { value: BunRequest, configurable: true, writable: true },
  Response: { value: BunResponse, configurable: true, writable: true },
  Headers: { value: BunHeaders, configurable: true, writable: true },
  FormData: { value: BunFormData, configurable: true, writable: true },
  Blob: { value: BunBlob, configurable: true, writable: true }
})
