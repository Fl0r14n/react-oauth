import { GlobalRegistrator } from '@happy-dom/global-registrator'

// bun test runs in a bare JS runtime; @testing-library/react and the component specs need a DOM.
// Preloaded via bunfig.toml so this runs before any spec module is evaluated.
GlobalRegistrator.register()
