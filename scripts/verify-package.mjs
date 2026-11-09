// Standalone package check — needs nothing from a DSH checkout.
//
// Verifies the three things a broken bundle fails at runtime:
// 1. `lib/` imports under plain Node (a leftover TS decorator makes it a SyntaxError);
// 2. the vendored CLI root and Python default are install-relative, not a source-machine path;
// 3. every skill is `<name>/SKILL.md` whose frontmatter `name` equals its directory, and the
//    preset rows point at package-internal specifiers.
//
// Usage: node scripts/verify-package.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const failures = []
const note = (ok, message) => {
  if (!ok) failures.push(message)
}

// 1. lib imports
for (const entry of ['lib/index.js', 'lib/tool.js']) {
  const path = join(ROOT, entry)
  note(existsSync(path), `${entry} is missing (run the bundled build)`)
  if (existsSync(path)) {
    note(!/^\s*@[A-Za-z_$][\w$]*/m.test(readFileSync(path, 'utf8')), `${entry} still carries decorator syntax`)
  }
}
const tool = existsSync(join(ROOT, 'lib/tool.js'))
  ? await import(pathToFileURL(join(ROOT, 'lib/tool.js')).href).catch((error) => {
    failures.push(`lib/tool.js does not import: ${error.message}`)
    return undefined
  })
  : undefined

// 2. install-relative defaults
if (tool !== undefined) {
  const defaults = tool.Config({})
  note(defaults.sapperRoot === join(ROOT, 'sapper'), `Config({}).sapperRoot is ${defaults.sapperRoot}, expected ${join(ROOT, 'sapper')}`)
  note(existsSync(join(defaults.sapperRoot, 'lib/sapper.py')), `vendored CLI missing: ${join(defaults.sapperRoot, 'lib/sapper.py')}`)
}

// 3. skills and lanes
const skillsDir = join(ROOT, 'presets/sapper-skills')
const skills = readdirSync(skillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
for (const skill of skills) {
  const file = join(skillsDir, skill.name, 'SKILL.md')
  if (!existsSync(file)) {
    failures.push(`skill ${skill.name} has no SKILL.md`)
    continue
  }
  const text = readFileSync(file, 'utf8')
  const name = /^name:\s*['"]?([^'"\n]+)['"]?\s*$/m.exec(text.split('\n---')[0] ?? '')?.[1]
  note(name === skill.name, `skill ${skill.name} declares name ${String(name)}`)
}
const lanes = readdirSync(join(ROOT, 'presets/sapper-lanes')).filter((file) => file.endsWith('.md'))
note(skills.length === 43, `expected 43 skills, found ${skills.length}`)
note(lanes.length === 7, `expected 7 lane specs, found ${lanes.length}`)

// 4. preset rows stay package-internal
for (const preset of ['presets/sapper.patch.yml', 'presets/sapper-worker.patch.yml']) {
  const text = readFileSync(join(ROOT, preset), 'utf8')
  note(text.includes('name: dsh-sapper/tool'), `${preset} does not mount dsh-sapper/tool`)
  note(!/sapperRoot|pythonPath|customSkillDirs/.test(text), `${preset} still pins a source-machine path`)
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`)
  process.exitCode = 1
} else {
  console.log(`verify: ok — ${skills.length} skills, ${lanes.length} lanes, lib imports, install-relative defaults`)
}
