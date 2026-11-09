// Verify the skills shipped *inside* the installable dsh-sapper bundle are
// discovered exactly like the dev copy under packages/bundle/web-app/presets.
// Run from the repository root: node packages/bundle/dsh-sapper/scripts/check-skills.mjs
import { FileSystemSkillProvider } from '../../../skill/skill-filesystem/lib/index.js'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', 'presets')
const warnings = []

const ctx = {
  logger: {
    warn: (...a) => warnings.push(a.map(String).join(' ')),
    info: () => {},
    debug: () => {},
    error: (...a) => warnings.push('ERROR ' + a.map(String).join(' ')),
  },
  on: () => () => {},
  effect: () => {},
  get: () => undefined,
}

const controller = new AbortController()
const provider = new FileSystemSkillProvider(
  ctx,
  { invalidate: () => {}, signal: controller.signal },
  { watch: false, includeDefaultRoots: false, customSkillDirs: [ROOT + '/sapper-skills', ROOT + '/sapper-lanes'] },
)

const started = Date.now()
const listed = await provider.list({ cwd: process.cwd() })
const candidates = Array.isArray(listed) ? listed : listed.candidates
console.log('root:', ROOT)
console.log('discovered:', candidates.length, 'in', Date.now() - started, 'ms', Array.isArray(listed) ? '' : '(incomplete observation)')
console.log('warnings:', warnings.length)
for (const w of warnings) console.log('  !', w)
const names = candidates.map((c) => c.name ?? c.definition?.name ?? c.summary?.name).sort()
console.log('names:', names.join(', '))
const expected = ['lane-recon', 'lane-web', 'lane-authz', 'lane-rce', 'lane-intranet', 'lane-verify', 'lane-auditor', 'sapper-scoring', 'sapper-thinking', 'sapper-explore', 'report-00-report', 'pentest-02-quick-win', 'ext-00-binary-analysis', 'fofa-api', 'quake', 'infogather']
const missing = expected.filter((n) => !names.includes(n))
console.log('missing expected:', missing.length ? missing.join(', ') : 'none')
await provider.dispose?.()
