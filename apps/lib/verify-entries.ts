/** Checks the invariants the three build entries rely on. They all fail silently: a relative import
 * across an entry boundary just inlines a second copy, and a missing `'use client'` only shows up in a
 * consumer's Next.js build. Run after `build`. */
import { readFileSync } from 'node:fs'

const read = (name: string) => readFileSync(`dist/${name}`, 'utf8')

const core = read('core.mjs')
const index = read('index.mjs')
const component = read('component.mjs')
const axiosAdapter = read('axios.mjs')

const imports = (source: string) => [...source.matchAll(/^import\s.*?from\s*["']([^"']+)["']/gm)].map(m => m[1])

const failures: string[] = []
const check = (ok: boolean, failure: string) => {
  if (!ok) failures.push(failure)
}

// the core is the whole reason there are separate entries: it must stay usable off the client boundary
check(
  !imports(core).some(id => id === 'react' || id.startsWith('react/') || id.startsWith('react-dom')),
  `core.mjs imports React — it must stay usable in a server component or a worker. Imports: ${imports(core).join(', ')}`
)
check(!core.includes('use client'), 'core.mjs carries a "use client" directive, which defeats the point of the entry')

// axios is an optional peer, which only holds while exactly one entry imports it
const importsAxios = (source: string) => imports(source).some(id => id === 'axios' || id.startsWith('axios/'))
check(!importsAxios(core), 'core.mjs imports axios — it is meant to be a fetch-only core, and axios is an optional peer')
check(!importsAxios(index), 'index.mjs imports axios — only the /axios entry may, or the optional peer becomes required')
check(!importsAxios(component), 'component.mjs imports axios — only the /axios entry may')
check(importsAxios(axiosAdapter), 'axios.mjs does not import axios — the adapter has inlined or lost it')
// it needs only *types* from the core, which erase, so the right assertion is that nothing was inlined —
// requiring a runtime import would fail for the good reason
check(
  !/\bconst (createOAuth|tokenState|createStore)\b/.test(axiosAdapter),
  'axios.mjs has inlined part of the core instead of using its types'
)
check(
  !imports(axiosAdapter).some(id => id === 'react' || id.startsWith('react/')),
  'axios.mjs imports React — the adapter takes an instance so it can stay usable outside a component'
)

// the hooks and the component are client-only, and Next needs to be told
check(index.startsWith('"use client"'), 'index.mjs is missing its leading "use client" directive')
check(component.startsWith('"use client"'), 'component.mjs is missing its leading "use client" directive')

// each entry keeps the others external, so exactly one copy of the core exists at runtime and the
// component sees the same React context the app's provider wrote to
check(imports(index).includes('react-oauth-oidc/core'), 'index.mjs does not import the core by package name — it has inlined a copy')
check(
  imports(component).includes('react-oauth-oidc'),
  'component.mjs does not import the package root by package name — it has inlined a second core, so it will not see the app instance'
)
check(!/\bconst createOAuth\b/.test(index), 'index.mjs has inlined createOAuth instead of re-exporting it from the core')
check(!/\bconst createOAuth\b/.test(component), 'component.mjs has inlined createOAuth — a second core')

if (failures.length) {
  console.error(`✗ ${failures.length} entry invariant(s) broken:\n${failures.map(f => `  - ${f}`).join('\n')}`)
  process.exit(1)
}

console.log('✓ entry invariants hold: core is React-free and directive-free, index and component are "use client", no inlined copies')
