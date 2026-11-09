import { clientBundle } from '../../client/tsdown.client.ts'

/**
 * Build faces for the installable sapper bundle.
 *
 * Both Node entries are fully self-contained: only Node builtins stay imports.
 * The plugin's framework dependencies (`dsh-tools`, `schemastery`,
 * `skill-filesystem`) are workspace packages that an installation resolves
 * from its own tree, *not* from a profile's `node_modules`, so a plugin package
 * installed from a directory cannot import them by name. Inlining is safe here
 * because every one of them is either a pure factory (`defineTool`), a schema
 * object, or a provider registered into an existing service — none carries
 * `instanceof` identity across the boundary.
 */
export default clientBundle(import.meta.dirname, ['src/index.ts', 'src/tool.ts'], {
  lib: {
    deps: {
      neverBundle: (specifier: string) => specifier.startsWith('node:'),
      alwaysBundle: (specifier: string) => !specifier.startsWith('node:'),
    },
  },
})
