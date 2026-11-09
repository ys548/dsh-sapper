import ts from 'typescript'
import { clientBundle } from '../../client/tsdown.client.ts'

/** A module id whose path (before any `?query`) names a TypeScript source. */
const TYPESCRIPT_MODULE = /^[^?]*\.[cm]?tsx?(?:\?|$)/
const DECORATOR_SYNTAX = /^\s*@[A-Za-z_$][\w$]*/m

/**
 * Lower TypeScript decorators in inlined workspace sources.
 *
 * The root workspace build gets this from `typertPlugin`; a standalone bundle
 * build does not, and rolldown's own TypeScript handling keeps `@Remote(...)`
 * on class members verbatim. Node cannot parse that syntax, so leaving it in
 * makes the emitted plugin fail to import at install time. Transpiling the
 * decorator-bearing modules here reproduces what the root build does.
 */
function decoratorLowering () {
  return {
    name: 'dsh-sapper-decorator-lowering',
    transform: {
      filter: { id: TYPESCRIPT_MODULE },
      handler (code: string, id: string) {
        if (!TYPESCRIPT_MODULE.test(id) || !DECORATOR_SYNTAX.test(code)) return
        const file = id.replace(/\?.*$/su, '')
        const result = ts.transpileModule(code, {
          fileName: file,
          compilerOptions: {
            target: ts.ScriptTarget.ES2024,
            module: ts.ModuleKind.ESNext,
            ...(file.endsWith('x') ? { jsx: ts.JsxEmit.ReactJSX } : {}),
            sourceMap: true,
          },
        })
        return {
          code: result.outputText.replace(/\n?\/\/# sourceMappingURL=.*$/u, '\n'),
          map: result.sourceMapText,
        }
      },
    },
  }
}

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
    plugins: [decoratorLowering()],
  },
})
