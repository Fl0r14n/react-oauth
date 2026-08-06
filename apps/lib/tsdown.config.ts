import { defineConfig } from 'tsdown'

// two entries: the protocol core, and the optional UI on top of it. The split is
// what keeps @mui out of the dependency graph of an app that only wants the hooks.
export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'dist',
    format: 'esm',
    deps: { neverBundle: ['react', 'react-dom', 'axios', 'zustand', /^zustand\//] },
    dts: true,
    clean: true
  },
  {
    entry: { component: 'src/component/index.ts' },
    outDir: 'dist',
    format: 'esm',
    deps: {
      neverBundle: ['react-oauth-oidc', 'react', 'react-dom', 'axios', 'zustand', /^zustand\//, '@mui/material', /^@mui\//, /^@emotion\//]
    },
    dts: true,
    clean: false
  }
])
