/**
 * Regenerate the dsh-sapper bundle's shipped assets from their single source of
 * truth in this checkout:
 *
 * - `presets/sapper.patch.yml`, `presets/sapper-worker.patch.yml` — copied from
 *   `packages/bundle/web-app/presets/`, then rewritten for install:
 *   the tool row points at this package (`dsh-sapper/tool`) and loses the
 *   absolute `sapperRoot` / `pythonPath` paths (the wrapper defaults them from
 *   `import.meta.dirname` and `SAPPER_ROOT` / `SAPPER_PYTHON`), and the
 *   `skill-filesystem` row loses `customSkillDirs` because the bundle's
 *   profile-level half registers the catalog itself;
 * - `presets/sapper-skills/`, `presets/sapper-lanes/` — copied verbatim;
 * - `src/client/` — the paged board's browser sources, copied from
 *   `packages/client/ui-sapper-board/src/client/` so tsc can compile them
 *   inside this package (a relative import across packages would land outside
 *   this package's `rootDir`);
 * - `sapper/lib/` — the vendored Python CLI (`sapper.py` + its modules).
 *
 * Run with `node scripts/sync-assets.mjs` from the package directory.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE = resolve(HERE, '..')
const REPO = resolve(PACKAGE, '../..')
const WEB_APP_PRESETS = resolve(REPO, 'bundle/web-app/presets')
const BOARD_CLIENT = resolve(REPO, 'client/ui-sapper-board/src/client')
const SAVER_CLI = resolve(process.env.SAPPER_SOURCE ?? 'D:/demo/sapper-v2-18-champion/sapper-v2-18-champion')

/**
 * Rewrite one preset patch file for an installed bundle.
 * @param source - preset YAML as written in web-app.
 * @returns the patch text with install-relative plugin names and no absolute paths.
 */
function rewritePreset(source) {
  let text = source.replace(/\r\n/g, '\n')
  text = text.replace("name: '@deepseek-ai/dsh-tool-sapper'", 'name: dsh-sapper/tool')
  text = text.replace(
    /( {12}name: dsh-sapper\/tool\n) {12}config:\n(?: {14}[A-Za-z]+: .*\n)+/,
    '$1',
  )
  text = text.replace(/ {14}customSkillDirs:\n(?: {16}- .*\n)+/, '')
  return text
}

/**
 * Copy one directory tree, replacing the destination.
 * @param from - absolute source directory.
 * @param to - absolute destination directory.
 */
function mirror(from, to) {
  if (!existsSync(from)) throw new Error(`sync-assets: missing source ${from}`)
  rmSync(to, { recursive: true, force: true })
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to, { recursive: true })
}

const presetsDir = join(PACKAGE, 'presets')
mkdirSync(presetsDir, { recursive: true })

for (const file of ['sapper.patch.yml', 'sapper-worker.patch.yml']) {
  const text = rewritePreset(readFileSync(join(WEB_APP_PRESETS, file), 'utf8'))
  writeFileSync(join(presetsDir, file), text, 'utf8')
  console.log(`preset ${file}: ${text.split('\n').length} lines`)
}

mirror(join(WEB_APP_PRESETS, 'sapper-skills'), join(presetsDir, 'sapper-skills'))
mirror(join(WEB_APP_PRESETS, 'sapper-lanes'), join(presetsDir, 'sapper-lanes'))
console.log(`skills: ${readdirSync(join(presetsDir, 'sapper-skills')).length} entries`)
console.log(`lanes: ${readdirSync(join(presetsDir, 'sapper-lanes')).length} entries`)

mirror(BOARD_CLIENT, join(PACKAGE, 'src/client'))
// The board's shared wire types live one level up from its client directory.
cpSync(resolve(BOARD_CLIENT, '../types.ts'), join(PACKAGE, 'src/types.ts'))
console.log(`client sources: ${readdirSync(join(PACKAGE, 'src/client')).join(', ')}`)

const cliLib = join(SAVER_CLI, 'lib')
const targetLib = join(PACKAGE, 'sapper/lib')
rmSync(targetLib, { recursive: true, force: true })
mkdirSync(targetLib, { recursive: true })
for (const entry of readdirSync(cliLib)) {
  if (entry === '__pycache__' || entry.endsWith('.bak-prewin')) continue
  cpSync(join(cliLib, entry), join(targetLib, entry), { recursive: true })
}
console.log(`python cli: ${readdirSync(targetLib).join(', ')}`)
