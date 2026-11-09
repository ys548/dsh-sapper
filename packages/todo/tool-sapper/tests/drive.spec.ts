import { describe, expect, it } from 'vitest'

import { runDrive, type DriveDeps, type DriveGraph } from '../src/drive.ts'

/**
 * The drive loop is pure orchestration: it reads the graph through `deps`, writes
 * through the sapper CLI (`deps.run`), and asks child agents for decisions
 * through a `subagents` seam. Both are faked here so the loop's own rules —
 * proposal cap, intent dedup, driver-recorded verify/audit verdicts — are covered
 * without a model, a Python CLI, or a Cordis context.
 */

interface FakeFact {
  id: string
  title?: string | undefined
  description?: string | undefined
  kind?: string | undefined
  data?: Record<string, string> | undefined
  doc?: string | undefined
}

interface FakeIntent {
  id: string
  title?: string | undefined
  description?: string | undefined
  status?: string | undefined
  from?: string[] | undefined
}

function flags(argv: string[]): { values: Map<string, string>; data: string[] } {
  const values = new Map<string, string>()
  const data: string[] = []
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index]!
    if (!token.startsWith('--')) continue
    const next = argv[index + 1]
    if (next === undefined) continue
    if (token === '--data') data.push(next)
    else values.set(token, next)
    index += 1
  }
  return { values, data }
}

function dataMap(pairs: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of pairs) {
    const cut = pair.indexOf('=')
    if (cut > 0) out[pair.slice(0, cut)] = pair.slice(cut + 1)
  }
  return out
}

class FakeStore {
  readonly facts: FakeFact[]
  readonly intents: FakeIntent[]
  readonly calls: string[][] = []
  private factSeq: number
  private intentSeq: number

  constructor(seed: { facts?: FakeFact[]; intents?: FakeIntent[] } = {}) {
    this.facts = seed.facts ?? []
    this.intents = seed.intents ?? []
    this.factSeq = this.facts.length
    this.intentSeq = this.intents.length
  }

  private nextFactId(): string {
    this.factSeq += 1
    return `f${String(this.factSeq).padStart(3, '0')}`
  }

  private nextIntentId(): string {
    this.intentSeq += 1
    return `i${String(this.intentSeq).padStart(3, '0')}`
  }

  readonly run = async (argv: string[]): Promise<string> => {
    this.calls.push(argv)
    const command = argv[0]
    const { values, data } = flags(argv)
    if (command === 'intent') {
      const id = this.nextIntentId()
      this.intents.push({
        id,
        title: values.get('--title'),
        description: argv[1] ?? '',
        status: 'open',
        from: (values.get('--from') ?? '').split(',').filter(Boolean),
      })
      return id
    }
    if (command === 'frontier') {
      return this.intents
        .filter(intent => intent.status === 'open')
        .map(intent => `${intent.id}\tfrom=${(intent.from ?? []).join(',')}\t${intent.description ?? ''}`)
        .join('\n')
    }
    if (command === 'claim') {
      const intent = this.intents.find(item => item.id === argv[argv.length - 1])
      if (!intent) throw new Error('no such intent')
      intent.status = 'claimed'
      return ''
    }
    if (command === 'release') {
      const intent = this.intents.find(item => item.id === argv[argv.length - 1])
      if (intent) intent.status = 'open'
      return ''
    }
    if (command === 'done') {
      const intent = this.intents.find(item => item.id === argv[1])
      if (!intent) throw new Error('no such intent')
      if (values.get('--worker') !== 'sapper_drive') throw new Error('worker mismatch')
      intent.status = 'done'
      const fact: FakeFact = {
        id: this.nextFactId(),
        title: values.get('--title'),
        description: values.get('--fact'),
        kind: values.get('--kind') ?? 'note',
        data: dataMap(data),
      }
      const doc = values.get('--doc')
      if (doc !== undefined) fact.doc = doc
      this.facts.push(fact)
      return `${intent.id} -> ${fact.id}  (done)`
    }
    if (command === 'complete') {
      return 'goal marked complete'
    }
    if (command === 'fact') {
      this.facts.push({
        id: this.nextFactId(),
        title: values.get('--title'),
        description: argv[1] ?? '',
        kind: values.get('--kind') ?? 'note',
        data: dataMap(data),
      })
      return this.facts[this.facts.length - 1]!.id
    }
    throw new Error(`unexpected sapper command: ${argv.join(' ')}`)
  }

  readonly readGraph = async (_storeDir: string): Promise<DriveGraph | null> => ({
    project: { goal: 'test engagement', status: 'active' },
    facts: this.facts.map(fact => ({ ...fact })) as DriveGraph['facts'],
    intents: this.intents.map(intent => ({ ...intent })) as DriveGraph['intents'],
  })

  deps(store = '.sapper'): DriveDeps {
    return {
      run: this.run,
      readGraph: this.readGraph,
      workdirFor: () => 'D:\\fake-workdir',
      store,
    }
  }
}

type Decision = Record<string, unknown>

/** Scripted child-agent seam: labels are matched by prefix, in call order. */
function seam(script: Array<[prefix: string, ...decisions: Decision[]]>) {
  const seen: Array<{ label: string; preset: string | undefined; maxDepth: number | undefined }> = []
  const used = new Map<string, number>()
  const startActivation = async (spec: {
    label: string
    request: { agentPreset?: string; maxDepth?: number; prompt: readonly { type: string; text?: string }[] }
  }) => {
    seen.push({ label: spec.label, preset: spec.request.agentPreset, maxDepth: spec.request.maxDepth })
    const entry = script.find(([prefix]) => spec.label.startsWith(prefix))
    if (!entry) throw new Error(`no scripted decision for ${spec.label}`)
    const index = used.get(entry[0]) ?? 0
    used.set(entry[0], index + 1)
    const decision = entry[Math.min(index + 1, entry.length - 1)]!
    return { result: Promise.resolve({ structured: decision, output: [] }) }
  }
  return { seam: { startActivation }, seen }
}

function logOf(value: Record<string, unknown>): string {
  const log = value.log as string[] | undefined
  return (log ?? []).join('\n')
}

describe('sapper_drive loop', () => {
  it('runs reason → explore → verify → audit and lets the driver record the verdicts', async () => {
    const store = new FakeStore({
      facts: [{ id: 'f001', title: '目标', description: 'czdqyy.com', kind: 'service' }],
    })
    const { seam: subagents } = seam([
      ['drive-reason', { complete: false, intents: [{ title: '端口测绘', description: '扫 22 端口', from: ['f001'] }], reasoning: '先便宜路径' }],
      ['drive-explore', { status: 'done', summary: 'ssh 22 开放，root/root 可登录', title: 'SSH 弱口令', kind: 'vuln', data: ['port=22'], doc: 'ssh root@host\nPermission granted' }],
      ['drive-verify', { verdict: 'verified', method: '换独立客户端重现', reason: '可复现' }],
      ['drive-audit', { verdict: 'pass', level: '高危', reason: '命令与响应齐备' }],
    ])

    const result = await runDrive({ rounds: 1, maxIntentsPerRound: 1 }, store.deps(), subagents, {})

    expect(result.roundsRun).toBe(1)
    const log = logOf(result)
    expect(log).toContain('+ 意图 i001：端口测绘')
    expect(log).toContain('R1 explore i001: done i001 -> f002')
    expect(log).toContain('R1 verify f002: verified')
    expect(log).toContain('R1 audit f002: pass（高危）')

    const verdictNote = store.facts.find(fact => (fact.title ?? '').startsWith('复核：'))
    expect(verdictNote?.data).toMatchObject({ target: 'f002', verdict: 'verified' })
    const auditNote = store.facts.find(fact => (fact.title ?? '').startsWith('审计：'))
    expect(auditNote?.data).toMatchObject({ target: 'f002', verdict: 'pass', level: '高危' })
  })

  it('dispatches children with the worker preset and depth 1 so they cannot fan out again', async () => {
    const store = new FakeStore({ facts: [{ id: 'f001', title: '目标', kind: 'service' }] })
    const { seam: subagents, seen } = seam([
      ['drive-reason', { complete: false, intents: [{ title: '探测', description: 'x', from: ['f001'] }], reasoning: 'r' }],
      ['drive-explore', { status: 'done', summary: '结论', title: 't', kind: 'note' }],
      ['drive-verify', { verdict: 'verified', reason: 'ok' }],
      ['drive-audit', { verdict: 'pass', reason: 'ok' }],
    ])

    await runDrive({ rounds: 1, maxIntentsPerRound: 1 }, store.deps(), subagents, {})

    expect(seen.length).toBeGreaterThan(0)
    for (const call of seen) {
      expect(call.preset).toBe('sapper-worker')
      expect(call.maxDepth).toBe(1)
    }
  })

  it('dryRun reports the proposals without writing anything', async () => {
    const store = new FakeStore({ facts: [{ id: 'f001', title: '目标', kind: 'service' }] })
    const { seam: subagents } = seam([
      ['drive-reason', { complete: false, intents: [{ title: '注入验证', description: 'x', from: ['f001'] }], reasoning: 'r' }],
    ])

    const result = await runDrive({ rounds: 1, dryRun: true }, store.deps(), subagents, {})

    expect(logOf(result)).toContain('[dry-run] 意图：注入验证 ← f001')
    expect(store.intents).toHaveLength(0)
    expect(store.facts).toHaveLength(1)
    expect(store.calls.some(argv => argv[0] === 'intent')).toBe(false)
  })

  it('skips a title that is already on the graph and caps one reason step at eight new intents', async () => {
    const store = new FakeStore({
      facts: [{ id: 'f001', title: '目标', kind: 'service' }],
      intents: [{ id: 'i001', title: '端口测绘', status: 'done', from: ['f001'] }],
    })
    const proposals = [
      { title: '端口测绘', description: 'duplicate', from: ['f001'] },
      ...Array.from({ length: 10 }, (_, index) => ({ title: `新意图${index}`, description: 'x', from: ['f001'] })),
    ]
    const { seam: subagents } = seam([['drive-reason', { complete: false, intents: proposals, reasoning: 'r' }]])

    const result = await runDrive({ rounds: 1, dryRun: true }, store.deps(), subagents, {})

    const log = logOf(result)
    expect(log).toContain('= 跳过重复意图：端口测绘（图中已有同名）')
    expect(log).toContain('! 提案 11 条，超过单轮上限 8 条，只取前 8 条')
  })

  it('does not re-verify or re-audit on a later round', async () => {
    const store = new FakeStore({ facts: [{ id: 'f001', title: '目标', kind: 'service' }] })
    const { seam: subagents } = seam([
      ['drive-reason', { complete: false, intents: [{ title: '端口测绘', description: 'x', from: ['f001'] }], reasoning: 'r' }],
      ['drive-explore', { status: 'done', summary: '漏洞证据', title: '注入', kind: 'vuln' }],
      ['drive-verify', { verdict: 'verified', reason: 'ok' }],
      ['drive-audit', { verdict: 'pass', reason: 'ok' }],
    ])

    const result = await runDrive({ rounds: 2, maxIntentsPerRound: 1 }, store.deps(), subagents, {})
    const log = logOf(result)

    expect(log.match(/R\d verify f002/g) ?? []).toHaveLength(1)
    expect(log.match(/R\d audit f002/g) ?? []).toHaveLength(1)
    expect(log).toContain('R2 explore: 待办队列为空')
  })

  it('records a rejected audit together with the missing evidence', async () => {
    const store = new FakeStore({ facts: [{ id: 'f001', title: '目标', kind: 'service' }] })
    const { seam: subagents } = seam([
      ['drive-reason', { complete: false, intents: [{ title: '端口测绘', description: 'x', from: ['f001'] }], reasoning: 'r' }],
      ['drive-explore', { status: 'done', summary: '疑似注入', title: 'SQL 注入', kind: 'vuln' }],
      ['drive-verify', { verdict: 'verified', reason: 'ok' }],
      ['drive-audit', { verdict: 'reject', level: '中危', reason: '无原始请求', missing: ['缺完整 HTTP 请求原文', '缺撤场清单'] }],
    ])

    const result = await runDrive({ rounds: 1, maxIntentsPerRound: 1 }, store.deps(), subagents, {})

    expect(logOf(result)).toContain('R1 audit f002: reject（中危）')
    const auditNote = store.facts.find(fact => (fact.title ?? '').startsWith('审计：'))
    expect(auditNote?.data).toMatchObject({
      target: 'f002',
      verdict: 'reject',
      missing: '缺完整 HTTP 请求原文；缺撤场清单',
    })
  })

  it('releases the intent when the explore child reports blocked', async () => {
    const store = new FakeStore({ facts: [{ id: 'f001', title: '目标', kind: 'service' }] })
    const { seam: subagents } = seam([
      ['drive-reason', { complete: false, intents: [{ title: '端口测绘', description: 'x', from: ['f001'] }], reasoning: 'r' }],
      ['drive-explore', { status: 'blocked', summary: '目标不可达' }],
    ])

    const result = await runDrive({ rounds: 1, maxIntentsPerRound: 1 }, store.deps(), subagents, {})

    expect(logOf(result)).toContain('R1 explore i001: blocked｜目标不可达')
    expect(store.intents[0]?.status).toBe('open')
  })

  it('marks the goal complete and stops without exploring', async () => {
    const store = new FakeStore({ facts: [{ id: 'f001', title: '目标', kind: 'service' }] })
    const { seam: subagents } = seam([
      ['drive-reason', { complete: true, completeFrom: ['f001'], completeNote: '报告已交付', intents: [], reasoning: 'r' }],
    ])

    const result = await runDrive({ rounds: 2, maxIntentsPerRound: 1 }, store.deps(), subagents, {})

    expect(logOf(result)).toContain('R1 complete: goal marked complete')
    expect(result.roundsRun).toBe(1)
    expect(store.calls.some(argv => argv[0] === 'complete')).toBe(true)
  })
})
