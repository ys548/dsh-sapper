import { describe, expect, it } from 'vitest'

import { auditLedger, findingTemplate, summaryTemplate, type GraphNode } from '../src/index.ts'

/**
 * The report gate is a pure fold over the fact graph: audit notes decide which
 * findings may become deliverable files. These tests pin the fold rules and the
 * rendered artefacts, which is what keeps an un-audited finding out of delivery.
 */

function note(id: string, target: string, verdict: string, extra: Record<string, string> = {}): GraphNode {
  return {
    id,
    kind: 'note',
    title: `审计：${target}`,
    description: `审计 ${target}：${verdict}`,
    data: { target, verdict, ...extra },
  }
}

function vuln(id: string, title: string, description = '证据见 doc'): GraphNode {
  return { id, kind: 'vuln', title, description, data: { url: 'http://target/x' } }
}

type Graph = { project: { goal?: string | null; status?: string | null }; facts: GraphNode[]; intents: GraphNode[] }

function graphOf(facts: GraphNode[]): Graph {
  return { project: { goal: 'czdqyy.com 授权测试', status: 'active' }, facts, intents: [] }
}

describe('auditLedger', () => {
  it('keeps only 审计： notes and reads target / verdict / level / missing', () => {
    const ledger = auditLedger([
      vuln('f001', 'SQL 注入'),
      note('f010', 'f001', 'pass', { level: '高危', reason: '请求与响应齐备' }),
      { id: 'f011', kind: 'note', title: '复核：SQL 注入', data: { target: 'f001', verdict: 'verified' } },
    ])

    expect(ledger.size).toBe(1)
    expect(ledger.get('f001')).toMatchObject({ verdict: 'pass', level: '高危' })
  })

  it('normalizes localized pass verdicts and treats anything else as reject', () => {
    const ledger = auditLedger([
      note('f010', 'f001', 'pass'),
      note('f011', 'f002', '通过'),
      note('f012', 'f003', '审计通过'),
      note('f013', 'f004', 'insufficient'),
      note('f014', 'f005', ''),
    ])

    expect(ledger.get('f001')?.verdict).toBe('pass')
    expect(ledger.get('f002')?.verdict).toBe('pass')
    expect(ledger.get('f003')?.verdict).toBe('pass')
    expect(ledger.get('f004')?.verdict).toBe('reject')
    expect(ledger.get('f005')?.verdict).toBe('reject')
  })

  it('lets a later audit overturn an earlier rejection', () => {
    const ledger = auditLedger([
      note('f010', 'f001', 'reject', { missing: '缺原始请求' }),
      note('f011', 'f001', 'pass', { level: '中危' }),
    ])

    expect(ledger.get('f001')).toEqual({ verdict: 'pass', level: '中危', reason: '审计 f001：pass' })
  })
})

describe('findingTemplate', () => {
  it('states the supervisor verdict, level and gaps in a dedicated section', () => {
    const text = findingTemplate('czdqyy.com', vuln('f001', 'SQL 注入'), {
      verdict: 'reject',
      level: '中危',
      reason: '缺原始请求',
      missing: '缺完整 HTTP 请求原文',
    })

    expect(text).toContain('# SQL 注入')
    expect(text).toContain('- 目标：czdqyy.com')
    expect(text).toContain('## Supervisor 审计')
    expect(text).toContain('- 判定：reject（打回）')
    expect(text).toContain('- 定级：中危')
    expect(text).toContain('- 缺项：缺完整 HTTP 请求原文')
    expect(text).toContain('- 等级（高/中/低）：中危')
    expect(text).toContain('- url: http://target/x')
  })

  it('marks an un-audited draft and leaves the level for the operator to fill', () => {
    const text = findingTemplate('czdqyy.com', vuln('f002', '弱口令'))

    expect(text).toContain('（未审计：本文件仅为草稿，交付前必须过 lane-auditor）')
    expect(text).toContain('- 等级（高/中/低）：\n')
  })
})

describe('summaryTemplate', () => {
  const passed = vuln('f001', 'SQL 注入')
  const rejected = vuln('f002', 'XSS')
  const unaudited = vuln('f003', '文件上传')

  const audits = auditLedger([
    note('f010', 'f001', 'pass', { level: '高危' }),
    note('f011', 'f002', 'reject', { level: '低危', missing: '缺证据' }),
  ])

  it('lists only audited findings in the summary table and points at the finding file', () => {
    const text = summaryTemplate('czdqyy.com', graphOf([passed, rejected, unaudited]), [passed], [rejected], [unaudited], audits)

    expect(text).toContain('- 交付范围：仅含 Supervisor 审计通过的 1 条')
    expect(text).toContain('| f001 | SQL 注入 | 高危 | 审计通过 | findings/SQL-注入.md |')
    expect(text).not.toContain('| f002 |')
    expect(text).not.toContain('| f003 |')
  })

  it('collects rejected and un-audited findings into a non-deliverable section', () => {
    const text = summaryTemplate('czdqyy.com', graphOf([passed, rejected, unaudited]), [passed], [rejected], [unaudited], audits)

    expect(text).toContain('## 待补证（未过 Supervisor 审计，不入交付）')
    expect(text).toContain('- f002 XSS — **已打回**（初审 低危）；缺：缺证据')
    expect(text).toContain('- f003 文件上传 — **未审计**，先派 lane-auditor 过五关')
  })

  it('omits the pending section when every finding passed', () => {
    const text = summaryTemplate('czdqyy.com', graphOf([passed]), [passed], [], [], audits)

    expect(text).toContain('| f001 | SQL 注入 |')
    expect(text).not.toContain('## 待补证')
  })

  it('says so when nothing passed the gate', () => {
    const text = summaryTemplate('czdqyy.com', graphOf([rejected]), [], [rejected], [], audits)

    expect(text).toContain('（暂无通过审计的漏洞）')
    expect(text).toContain('0 条')
  })
})
