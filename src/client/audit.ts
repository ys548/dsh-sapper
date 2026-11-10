/**
 * Supervisor audit notes folded onto the vulnerabilities they judge.
 *
 * A note is an audit when its title starts with 审计： and its data names the
 * vulnerability in `target`. A later note for the same vulnerability wins.
 */

import type { FactNode } from '../types.ts'

/** One vulnerability that already has an audit conclusion. */
export interface AuditedVuln {
  id: string
  title: string
  description: string
  verdict: 'pass' | 'reject'
  level: string
  reason: string
  missing: string
}

function compareId(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true })
}

/**
 * Collect vulnerabilities whose audit note is already recorded.
 * @param facts - engagement facts, including the audit notes.
 * @returns audited vulnerabilities, passing ones first.
 */
export function auditedFindings(facts: FactNode[]): AuditedVuln[] {
  const ledger = new Map<string, Omit<AuditedVuln, 'id' | 'title' | 'description'>>()
  for (const note of facts) {
    if (note.kind !== 'note' || !(note.title ?? '').startsWith('审计：')) continue
    const target = typeof note.data?.target === 'string' ? note.data.target : ''
    if (target === '') continue
    const raw = String(note.data?.verdict ?? '').trim().toLowerCase()
    const verdict = raw === 'pass' || raw === '通过' || raw === '审计通过' ? 'pass' : 'reject'
    ledger.set(target, {
      verdict,
      level: String(note.data?.level ?? '').trim(),
      reason: note.description?.trim() ?? '',
      missing: String(note.data?.missing ?? '').trim(),
    })
  }
  const rows: AuditedVuln[] = []
  for (const fact of facts) {
    if (fact.kind !== 'vuln') continue
    const audit = ledger.get(fact.id)
    if (!audit) continue
    rows.push({
      id: fact.id,
      title: fact.title?.trim() || fact.description?.trim() || fact.id,
      description: fact.description?.trim() ?? '',
      ...audit,
    })
  }
  rows.sort((a, b) => (a.verdict === b.verdict ? 0 : a.verdict === 'pass' ? -1 : 1) || compareId(a.id, b.id))
  return rows
}
