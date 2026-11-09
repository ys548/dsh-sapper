/**
 * Import the built half of the bundle the way the Loader does.
 *
 * Runs after `pnpm run build` and before packing: a bundle that cannot be
 * imported fails at preset-mount time inside the GUI, where the only symptom is
 * 「预设加载失败」, so catch it here instead. Also prints the config defaults the
 * Loader will get from the exported schema — they must be install-relative, not
 * the source checkout's absolute paths.
 *
 * Usage: node scripts/check-lib.mjs
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const PACKAGE_ROOT = resolve(import.meta.dirname, '..')
const failures = []

const decorator = /^\s*@[A-Za-z_$][\w$]*/m

for (const file of ['index.js', 'tool.js']) {
  const path = resolve(PACKAGE_ROOT, 'lib', file)
  const source = readFileSync(path, 'utf8')
  if (decorator.test(source)) {
    failures.push(`${file}: still carries decorator syntax (needs decoratorLowering in tsdown.config.ts)`)
  }
  try {
    await import(pathToFileURL(path).href)
  } catch (error) {
    failures.push(`${file}: import failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const tool = await import(pathToFileURL(resolve(PACKAGE_ROOT, 'lib', 'tool.js')).href).catch(() => undefined)
if (tool !== undefined) {
  const defaults = tool.Config({})
  const expectedRoot = resolve(PACKAGE_ROOT, 'sapper')
  if (defaults.sapperRoot !== expectedRoot) {
    failures.push(`Config({}).sapperRoot is ${String(defaults.sapperRoot)}, expected the vendored CLI ${expectedRoot}`)
  }
  if (defaults.pythonPath !== (process.env.SAPPER_PYTHON ?? 'python')) {
    failures.push(`Config({}).pythonPath is ${String(defaults.pythonPath)}, expected SAPPER_PYTHON or "python"`)
  }
  console.log('config defaults:', JSON.stringify(defaults))
}

if (failures.length > 0) {
  for (const line of failures) console.error(`FAIL ${line}`)
  process.exitCode = 1
} else {
  console.log('lib check: ok (both entries import, no decorator syntax, install-relative defaults)')
}
