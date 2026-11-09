import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * The sapper preset ships two skill libraries as flat directories: `sapper-skills`
 * (methodology + the lanes' tool manuals) and `sapper-lanes` (one spec per lane).
 * The loader only registers `<dir>/SKILL.md` entries one level deep, so these
 * tests pin the on-disk contract the loader depends on, plus the naming rules
 * and lane↔skill bindings documented in SAPPER-SKILLS-SPEC.md.
 */

const PRESETS = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'presets')
const SKILLS = join(PRESETS, 'sapper-skills')
const LANES = join(PRESETS, 'sapper-lanes')

const TOOL_NAME = /[a-z0-9][a-z0-9-]*/

/** Minimal frontmatter reader: the loader's real one lives in skill-filesystem. */
function frontmatter(file: string): { name?: string; description?: string } {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (!match) return {}
  const body = match[1]!
  const name = scalar(body, 'name')
  const description = scalar(body, 'description') ?? blockScalar(body, 'description')
  return {
    ...name === undefined ? {} : { name },
    ...description === undefined ? {} : { description },
  }
}

/** One inline `key: value` pair, or undefined when the key is absent or block-style. */
function scalar(body: string, key: string): string | undefined {
  const line = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(body)
  if (!line) return undefined
  const raw = line[1]!.trim()
  if (raw.startsWith('>') || raw.startsWith('|')) return undefined
  return raw.replace(/^['"]|['"]$/g, '')
}

/** A `key: >-` block scalar, folded into one line so length checks are meaningful. */
function blockScalar(body: string, key: string): string | undefined {
  const start = body.search(new RegExp(`^${key}:\\s*[>|]`, 'm'))
  if (start < 0) return undefined
  const folded = body.slice(start).split('\n').slice(1)
    .filter(line => line.trim() !== '')
    .map(line => line.trim())
    .join(' ')
  return folded === '' ? undefined : folded
}

function skillDirs(): string[] {
  return readdirSync(SKILLS)
    .filter(entry => statSync(join(SKILLS, entry)).isDirectory())
    .sort()
}

function laneFiles(): string[] {
  return readdirSync(LANES).filter(entry => entry.endsWith('.md')).sort()
}

describe('sapper skill library', () => {
  it('registers every skill as a directory with a matching SKILL.md', () => {
    const dirs = skillDirs()
    expect(dirs.length).toBeGreaterThanOrEqual(40)
    for (const dir of dirs) {
      expect(statSync(join(SKILLS, dir, 'SKILL.md')).isFile()).toBe(true)
    }
  })

  it('names every skill after its directory and keeps descriptions short', () => {
    for (const dir of skillDirs()) {
      const meta = frontmatter(join(SKILLS, dir, 'SKILL.md'))
      expect(meta.name, `${dir}: frontmatter name`).toBe(dir)
      expect(meta.description, `${dir}: frontmatter description`).toBeTruthy()
      expect(meta.description!.length, `${dir}: description length`).toBeLessThanOrEqual(160)
    }
  })

  it('shares one namespace across taxonomy prefixes', () => {
    const dirs = skillDirs()
    expect(dirs).toEqual([...new Set(dirs)])
    for (const dir of dirs) expect(dir, `illegal skill name ${dir}`).toMatch(TOOL_NAME)
  })

  it('keeps the lane library to seven specs with short descriptions', () => {
    const files = laneFiles()
    expect(files).toEqual([
      'lane-auditor.md',
      'lane-authz.md',
      'lane-intranet.md',
      'lane-rce.md',
      'lane-recon.md',
      'lane-verify.md',
      'lane-web.md',
    ])
    for (const file of files) {
      const meta = frontmatter(join(LANES, file))
      expect(meta.name, `${file}: frontmatter name`).toBe(file.replace(/\.md$/, ''))
      expect(meta.description!.length, `${file}: description length`).toBeLessThanOrEqual(160)
      /* A lane spec that is too thin cannot carry a playbook; too fat and it
         duplicates the methodology it should only point at. */
      const size = statSync(join(LANES, file)).size
      expect(size, `${file}: size`).toBeGreaterThan(3000)
      expect(size, `${file}: size`).toBeLessThan(8000)
    }
  })

  it('binds only skills that exist on disk', () => {
    const known = new Set(skillDirs())
    const referenced = /(?<![A-Za-z0-9_-])([a-z][a-z0-9]*(?:-[a-z0-9]+)+)(?![A-Za-z0-9_-])/g
    for (const file of laneFiles()) {
      const text = readFileSync(join(LANES, file), 'utf8')
      for (const match of text.matchAll(referenced)) {
        const name = match[1]!
        /* Only flag names that look like our own skills (they carry a prefix we ship). */
        if (!/^(pentest|ext|report|sapper|lane)-/.test(name)) continue
        if (name.startsWith('lane-')) continue
        expect(known.has(name), `${file}: unknown skill ${name}`).toBe(true)
      }
    }
  })

  it('has no reference to the retired taxonomies', () => {
    const retired = [/pentest-2d-short-table/, /pentest-2[abcd]-/, /\brt-\d\d\b/, /打穿短表/]
    const scan = (dir: string, depth: number): string[] => {
      const out: string[] = []
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          if (depth > 0) out.push(...scan(full, depth - 1))
          continue
        }
        if (entry.endsWith('.md')) out.push(full)
      }
      return out
    }
    for (const file of [...scan(SKILLS, 1), ...scan(LANES, 0)]) {
      const text = readFileSync(file, 'utf8')
      for (const pattern of retired) {
        expect(pattern.test(text), `${file}: matches ${String(pattern)}`).toBe(false)
      }
    }
  })

  it('keeps the always-on skill catalog small enough to pay for itself', () => {
    let total = 0
    for (const dir of skillDirs()) {
      const meta = frontmatter(join(SKILLS, dir, 'SKILL.md'))
      total += dir.length + (meta.description?.length ?? 0) + 60
    }
    for (const file of laneFiles()) {
      const meta = frontmatter(join(LANES, file))
      total += file.length + (meta.description?.length ?? 0) + 60
    }
    /* The catalog is re-sent with every request; 20k characters is ~5k tokens,
       which would be a real tax on a session that never loads a methodology. */
    expect(total).toBeLessThan(20_000)
  })
})
