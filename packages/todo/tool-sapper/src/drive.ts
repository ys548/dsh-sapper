/**
 * `sapper_drive` — the autonomous round driver.
 *
 * sapper's own `auto` command runs reason → explore → verify in a loop, calling
 * (this port adds a fourth step, the supervisor audit, so verified findings are
 * gated for delivery without waiting for the commander)
 * an LLM through a subprocess. This module reproduces that loop on DSH's native
 * delegation seam: each step spawns a short-lived child agent with a
 * self-contained prompt and a JSON output schema, awaits its structured result,
 * and applies the resulting state transition through the sapper CLI.
 *
 * The graph stays the single source of truth — children read and write it with
 * their own sapper tools, so a lost child never loses evidence.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** Fact row as read from the store. */
interface DriveFact {
  id: string
  kind?: string
  title?: string
  description?: string
  doc?: string | null
  data?: Record<string, unknown> | null
}

/** Intent row as read from the store. */
interface DriveIntent {
  id: string
  title?: string
  description?: string
  from?: string[]
  to?: string | null
  status?: string
  worker?: string | null
  doc?: string | null
}

/** One parsed store. */
export interface DriveGraph {
  project: { goal?: string | null; status?: string | null }
  facts: DriveFact[]
  intents: DriveIntent[]
}

/** The subagent activation surface this driver needs. */
interface SubagentsSeam {
  startActivation: (spec: {
    provider: string
    label: string
    request: {
      cwd?: string
      agentPreset?: string
      prompt: ContentBlock[]
      parent: unknown
      signal: AbortSignal
      outputSchema?: Record<string, unknown>
      maxDepth?: number
    }
    signal: AbortSignal
    delivery: 'parent' | 'caller'
  }) => Promise<{
    result: Promise<{ output?: readonly ContentBlock[]; structured?: unknown; diagnostic?: string; stopReason?: string }>
    dispose?: () => Promise<void>
  }>
}

/** Collaborators injected by the host plugin. */
export interface DriveDeps {
  /** Run one sapper subcommand; resolves to stdout. */
  run: (args: string[], workdir: string) => Promise<string>
  /** Read the store off disk. */
  readGraph: (storeDir: string) => Promise<DriveGraph | null>
  /** Resolve the working directory for one call. */
  workdirFor: (args?: { cwd?: string }) => string
  /** Configured store directory name. */
  store: string
}

/** Arguments of one `sapper_drive` call, as the tool schema accepts them. */
export interface DriveArgs {
  rounds?: number
  minutes?: number
  maxIntentsPerRound?: number
  agentPreset?: string
  dryRun?: boolean
  cwd?: string
}

/** Worker identity this driver claims intents under; `done` must match it. */
const WORKER = 'sapper_drive'

/**
 * Ceiling on intents one reason step may add to the graph. Creating an intent is
 * a local write, not a model call, so this is a flood guard rather than a budget:
 * a reason step that splits one wide intent into five minimal units is doing its
 * job, and `maxIntentsPerRound` — which bounds dispatch, the expensive part —
 * must not silently delete that work.
 */
const MAX_NEW_INTENTS = 8

/* ── JSON schemas the children must satisfy ────────────────────────────────── */

const REASON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    complete: { type: 'boolean', description: 'True when the facts already prove the goal is met.' },
    completeFrom: {
      type: 'array',
      items: { type: 'string' },
      description: 'Fact ids proving completion. Empty when not complete.',
    },
    completeNote: { type: 'string', description: 'One-line justification when complete.' },
    intents: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: 'Short 2-10 character label.' },
          description: { type: 'string', description: 'One-sentence gist.' },
          from: { type: 'array', items: { type: 'string' }, description: 'Existing fact ids this builds on.' },
          doc: { type: 'string', description: 'Optional playbook: commands, fallbacks, expected evidence.' },
        },
        required: ['title', 'description', 'from'],
      },
      description: 'New intents to create. Empty when the frontier already covers the work.',
    },
    reasoning: { type: 'string', description: 'One sentence on why this is the best next move.' },
  },
  required: ['complete', 'intents'],
} as const

const EXPLORE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: {
      type: 'string',
      enum: ['done', 'blocked'],
      description: 'done when the intent produced a confirmed result; blocked when it could not.',
    },
    summary: {
      type: 'string',
      description: 'The confirmed result in one sentence. This becomes the produced fact\'s description.',
    },
    title: { type: 'string', description: 'Short 2-10 character label for the produced fact.' },
    kind: {
      type: 'string',
      enum: ['host', 'service', 'cred', 'vuln', 'loot', 'note'],
      description: 'Typed kind for the produced fact.',
    },
    data: {
      type: 'array',
      items: { type: 'string' },
      description: 'Structured KEY=VALUE pairs, e.g. ["host=10.0.0.1", "port=22"].',
    },
    doc: {
      type: 'string',
      description: 'Evidence markdown for the produced fact: commands run and raw response excerpts.',
    },
  },
  required: ['status', 'summary'],
} as const

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: {
      type: 'string',
      enum: ['verified', 'refuted', 'insufficient'],
      description: 'verified when independently reproduced; refuted when it does not hold; insufficient when evidence is missing.',
    },
    method: { type: 'string', description: 'The independent method used, different from the producer\'s.' },
    reason: { type: 'string', description: 'One-sentence justification.' },
  },
  required: ['verdict', 'reason'],
} as const

const AUDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: {
      type: 'string',
      enum: ['pass', 'reject'],
      description: 'pass when the finding may be counted as a deliverable; reject when any audit item fails.',
    },
    level: { type: 'string', description: 'Severity tier per sapper-scoring, e.g. 高危 / 中危 / 低危.' },
    missing: {
      type: 'array',
      items: { type: 'string' },
      description: 'Deliverable-blocking gaps (which audit item failed and what must be added); empty when pass.',
    },
    reason: { type: 'string', description: 'One-sentence justification.' },
  },
  required: ['verdict', 'reason'],
} as const

/** Structured reply of the reason step. */
interface ReasonDecision {
  complete?: boolean
  completeFrom?: string[]
  completeNote?: string
  intents?: Array<{ title: string; description: string; from: string[]; doc?: string }>
  reasoning?: string
}

/**
 * Render the graph as the plain-text block children reason over.
 * @param graph - the parsed store.
 * @returns a compact text rendering.
 */
function renderGraph(graph: DriveGraph): string {
  const facts = graph.facts
    .map(fact => `- ${fact.id} [${fact.kind ?? 'note'}] ${fact.title ?? ''} :: ${(fact.description ?? '').slice(0, 160)}`)
    .join('\n')
  const intents = graph.intents
    .map((intent) => {
      const from = (intent.from ?? []).join(',') || '—'
      return `- ${intent.id} [${intent.status ?? 'open'}] ${intent.title ?? ''} from=[${from}] to=${intent.to ?? '(无产出)'} :: ${(intent.description ?? '').slice(0, 160)}`
    })
    .join('\n')
  return [
    `## 项目目标\n${graph.project.goal ?? '(未设置)'}`,
    `## 已确认事实（${graph.facts.length}）\n${facts || '(空)'}`,
    `## 意图（${graph.intents.length}）\n${intents || '(空)'}`,
  ].join('\n\n')
}

/** Time-slice one child call, aborting when the slice expires. */
function sliceController(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('sapper_drive: step timeout')), ms)
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer)
      controller.abort(new Error('sapper_drive: step finished'))
    },
  }
}

/**
 * Register the `sapper_drive` tool.
 * @param ctx - registrant context.
 * @param deps - CLI, store and workdir collaborators.
 */
export function registerDriveTool(ctx: Context, deps: DriveDeps): void {
  ctx.tools.register(defineTool({
    name: 'sapper_drive',
    description:
      'Advance the engagement autonomously for N rounds: each round asks a child agent to reason over '
      + 'the fact graph and propose intents, dispatches the ready intents to executor children, '
      + 'independently verifies newly confirmed findings, then runs a supervisor audit that gates each '
      + 'verified finding for delivery (evidence reproducible, real impact, severity justified, report-ready, '
      + 'clean teardown). Every state change still goes through the sapper CLI, so the '
      + 'graph remains the single source of truth and the drive can be stopped and resumed at any time. '
      + 'Prefer calling it with a small `rounds` first; each round costs several model calls.',
    parameters: {
      rounds: {
        type: 'integer',
        description: 'Maximum number of reason→explore→verify→audit rounds. Defaults to 2, capped at 10.',
      },
      minutes: {
        type: 'number',
        description: 'Total wall-clock budget for the whole drive. Defaults to 20.',
      },
      maxIntentsPerRound: {
        type: 'integer',
        description: 'How many ready intents to dispatch per round. Defaults to 2, capped at 4. '
          + 'This bounds the model calls spent exploring; it does not limit how many intents the reason '
          + `step may add to the graph (up to ${MAX_NEW_INTENTS}, which costs nothing).`,
      },
      agentPreset: {
        type: 'string',
        description: 'Preset the child agents run with. Defaults to "sapper-worker" (the executor half, with the '
          + 'sapper graph tools and no Agent Teams tools). Use "sapper" only if you deliberately want a '
          + 'child that plans instead of acting.',
      },
      dryRun: {
        type: 'boolean',
        description: 'Run the reason step only and report the proposed intents without creating them.',
      },
      cwd: { type: 'string', description: 'Target directory holding the .sapper store.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const v = value as { log?: string[]; roundsRun?: number; stopped?: string }
        return [{ type: 'text', text: String((v.log ?? []).join('\n')) || 'sapper_drive: no rounds completed' }]
      },
    },
    presentCall: args => ({
      card: 'generic',
      title: `sapper drive ×${args.rounds ?? 2}`,
      rawInput: { rounds: args.rounds, dryRun: args.dryRun },
    }),
    async execute(args, exec): Promise<Record<string, JsonValue>> {
      const subagents = ctx.get('subagents') as SubagentsSeam | undefined
      if (!subagents) return { error: 'sapper_drive needs the subagents service, which this host does not provide.' }
      const parent = (exec as { agent?: unknown }).agent
      if (!parent) return { error: 'sapper_drive must be called by a live agent.' }

      return runDrive(args as DriveArgs, deps, subagents, parent)
    },
  }))
}


/**
 * Runs the drive loop without a Cordis context. `sapper_drive` executes it with
 * the live `subagents` service and the calling agent; tests execute it with a
 * stub seam, so the loop logic (dedup, proposal cap, verify/audit gating) is
 * covered without a model in the loop.
 */
export async function runDrive(
  args: DriveArgs,
  deps: DriveDeps,
  subagents: SubagentsSeam,
  parent: unknown,
): Promise<Record<string, JsonValue>> {
  const workdir = deps.workdirFor(args)
  const storeDir = `${workdir}\\${deps.store}`
  const rounds = Math.min(10, Math.max(1, args.rounds ?? 2))
  const perRound = Math.min(4, Math.max(1, args.maxIntentsPerRound ?? 2))
  const stepMs = Math.max(60_000, Math.floor(((args.minutes ?? 20) * 60_000) / (rounds * 3)))
  const preset = args.agentPreset ?? 'sapper-worker'
  const log: string[] = []
  let roundsRun = 0
  let stopped = ''

  const runChild = async (label: string, prompt: string, schema: unknown): Promise<unknown> => {
    const slice = sliceController(stepMs)
    try {
      const activation = await subagents.startActivation({
        provider: 'spawn',
        label,
        request: {
          cwd: workdir,
          agentPreset: preset,
          parent,
          prompt: [{ type: 'text', text: prompt }],
          signal: slice.signal,
          // Children must not spawn their own children: the driver owns fan-out.
          maxDepth: 1,
          outputSchema: schema as Record<string, unknown>,
        },
        signal: slice.signal,
        delivery: 'caller',
      })
      const result = await activation.result
      await activation.dispose?.().catch(() => undefined)
      if (result.structured !== undefined) return result.structured
      const text = (result.output ?? [])
        .filter((block): block is { type: 'text'; text: string } => (block as { type?: string }).type === 'text')
        .map(block => block.text)
        .join('')
      const match = /\{[\s\S]*\}/.exec(text)
      return match ? JSON.parse(match[0]) : undefined
    } finally {
      slice.cancel()
    }
  }

  for (let round = 1; round <= rounds; round += 1) {
    const graph = await deps.readGraph(storeDir)
    if (!graph) return { error: `no .sapper store at ${storeDir}`, log, roundsRun }
    if (graph.project.status === 'completed') {
      stopped = 'goal already complete'
      break
    }

    /* ── 1. reason ─────────────────────────────────────────────────── */
    const reasonPrompt = [
      '你是这次授权渗透的作战参谋。基于下面的事实图，判断目标是否已达成，并决定下一步要做什么。你只做判断与提案，不执行任何触达目标的命令。',
      '',
      renderGraph(graph),
      '',
      '要求：',
      '- 只引用上面已存在的事实 id，不要编造。',
      '- 若已有意图覆盖了下一步，intents 返回空数组即可。',
      '- 最多提 3 条高价值、互不重叠的意图；每条的 from 必须是非空的事实 id 数组。',
      '- title 是 2-10 字短标签；description 一句话；doc 可放具体命令与期望证据。',
      '- 先拿便宜的战果；能复用已有 cred/vuln 的路线优先。',
      '',
      '输出方式：先用 3-5 行中文写下你的判断（这段会显示给指挥官看），再调用结构化输出工具提交。',
      '（结构化输出的提示只要求「结果以工具调用为准」，并不禁止你写正文；正文里把话说清楚，别只发工具调用。）',
    ].join('\n')

    const decision = await runChild(`drive-reason-${round}`, reasonPrompt, REASON_SCHEMA) as
      | ReasonDecision
      | undefined

    if (!decision) {
      log.push(`R${round} reason: 子 Agent 未返回可解析结果，停止。`)
      stopped = 'reason step returned nothing'
      break
    }

    log.push(`R${round} reason: ${decision.reasoning ?? '(no reasoning)'}｜提案 ${decision.intents?.length ?? 0} 条`)

    if (decision.complete === true && (decision.completeFrom ?? []).length > 0) {
      try {
        const out = await deps.run(['complete', '--from', (decision.completeFrom ?? []).join(','), '--note', decision.completeNote ?? 'sapper_drive'], workdir)
        log.push(`R${round} complete: ${out}`)
        stopped = 'goal complete'
        roundsRun = round
        break
      } catch (error) {
        log.push(`R${round} complete 失败：${String((error as Error).message).slice(0, 120)}（继续下一轮）`)
      }
    }

    if (args.dryRun) {
      const proposed = decision.intents ?? []
      if (proposed.length > MAX_NEW_INTENTS) {
        log.push(`  ! 提案 ${proposed.length} 条，超过单轮上限 ${MAX_NEW_INTENTS} 条，只取前 ${MAX_NEW_INTENTS} 条`)
      }
      /* Report exactly the set a real round would create, duplicates included. */
      const previewed = new Set<string>()
      for (const intent of proposed.slice(0, MAX_NEW_INTENTS)) {
        const title = (intent.title ?? '').trim()
        if (title !== '' && graph.intents.some(existing => (existing.title ?? '').trim() === title)) {
          log.push(`  = 跳过重复意图：${title}（图中已有同名）`)
          continue
        }
        if (title !== '' && previewed.has(title)) {
          log.push(`  = 跳过本轮重复：${title}`)
          continue
        }
        if (title !== '') previewed.add(title)
        log.push(`  [dry-run] 意图：${title} ← ${(intent.from ?? []).join(',')}`)
      }
      stopped = 'dry run'
      roundsRun = round
      break
    }

    /* Model proposals drift; refuse a title that is already on the graph so a
       repeated round cannot seed duplicate work. */
    const proposedTitles = new Set<string>()
    const proposals = decision.intents ?? []
    if (proposals.length > MAX_NEW_INTENTS) {
      log.push(`  ! 提案 ${proposals.length} 条，超过单轮上限 ${MAX_NEW_INTENTS} 条，只取前 ${MAX_NEW_INTENTS} 条`)
    }

    for (const intent of proposals.slice(0, MAX_NEW_INTENTS)) {
      if ((intent.from ?? []).length === 0) continue
      const title = (intent.title ?? '').trim()
      if (title !== '' && graph.intents.some(existing => (existing.title ?? '').trim() === title)) {
        log.push(`  = 跳过重复意图：${title}（图中已有同名）`)
        continue
      }
      if (title !== '' && proposedTitles.has(title)) {
        log.push(`  = 跳过本轮重复：${title}`)
        continue
      }
      const argv = ['intent', intent.description, '--from', (intent.from ?? []).join(','), '--title', intent.title]
      if (intent.doc) argv.push('--doc', intent.doc)
      /* One malformed proposal must not abort the whole drive. */
      try {
        const id = (await deps.run(argv, workdir)).trim()
        if (title !== '') proposedTitles.add(title)
        log.push(`  + 意图 ${id}：${intent.title}`)
      } catch (error) {
        log.push(`  ! 意图创建失败（${intent.title}）：${String((error as Error).message).slice(0, 100)}`)
      }
    }

    /* ── 2. explore the ready frontier ─────────────────────────────── */
    const frontierText = await deps.run(['frontier'], workdir)
    const ready = frontierText
      .split('\n')
      .map(line => line.trim().split(/\s+/)[0])
      .filter((id): id is string => typeof id === 'string' && /^i\d+$/.test(id))

    if (ready.length === 0) {
      log.push(`R${round} explore: 待办队列为空`)
    }

    for (const intentId of ready.slice(0, perRound)) {
      const fresh = await deps.readGraph(storeDir)
      const intent = fresh?.intents.find(item => item.id === intentId)
      if (!intent) continue
      const sourceFacts = (intent.from ?? [])
        .map(factId => fresh?.facts.find(fact => fact.id === factId))
        .filter((fact): fact is DriveFact => fact !== undefined)
        .map(fact => `- ${fact.id} [${fact.kind ?? 'note'}] ${fact.title ?? ''} :: ${fact.description ?? ''}${fact.doc ? `\n  证据：${fact.doc.slice(0, 400)}` : ''}`)
        .join('\n')

      try {
        await deps.run(['claim', '--worker', WORKER, intentId], workdir)
      } catch {
        continue
      }

      const explorePrompt = [
        '你是授权渗透项目的执行者。推进下面这一条意图，并把确证证据落图。',
        '',
        `## 当前意图 ${intent.id}`,
        `${intent.title ?? ''}：${intent.description ?? ''}`,
        intent.doc ? `\n作战手册：\n${intent.doc}` : '',
        '',
        '## 来源事实',
        sourceFacts || '(无)',
        '',
        '要求：',
        '- **只推进这一条意图**，不要顺手展开别的线索。',
        '- **边说边做**：每次动手前用一行中文说明你要验证什么（不超过 40 字），看到关键响应后补一句结论。不要只发命令不吭声。',
        '- 先用 sapper_recall 查历史同类打法；指纹确定后可用 sapper_kb 查离线知识库。',
        '- 一次一发：改一个变量、看一次响应、再决定下一步。',
        '- 中间的过程性观察用 sapper_fact 落图（含命令与原始响应片段）。',
        '- **不要为最终结果建 fact**：把最终产出写进返回值的 summary/title/kind/data/doc，'
          + '由驱动者用 sapper_done 统一收尾。',
        '- 只做授权范围内的动作；不做破坏性验证、不拖库、不越界横向。',
        '',
        '- **收尾先说话**：最后先写 3-6 行中文小结（做了什么、看到什么、结论是什么），'
          + '再调用结构化输出工具按给定 JSON schema 提交。status=blocked 时 summary 写清卡在哪、试过什么。',
        '- 结构化输出的提示只要求「结果以工具调用为准」，**并不禁止你写正文**；'
          + '指挥官和审计都靠你的正文判断你在干什么，只发工具调用等于不说话。',
      ].join('\n')

      try {
        const outcome = await runChild(`drive-explore-${intentId}`, explorePrompt, EXPLORE_SCHEMA) as
          | { status?: string; summary?: string; title?: string; kind?: string; data?: string[]; doc?: string }
          | undefined

        if (outcome?.status === 'done' && outcome.summary) {
          /* `done --fact` takes the RESULT TEXT and creates the produced fact. */
          const argv = ['done', intentId, '--fact', outcome.summary, '--worker', WORKER]
          if (outcome.title) argv.push('--title', outcome.title)
          if (outcome.kind) argv.push('--kind', outcome.kind)
          for (const pair of outcome.data ?? []) argv.push('--data', pair)
          if (outcome.doc) argv.push('--doc', outcome.doc)
          const done = (await deps.run(argv, workdir)).trim()
          log.push(`R${round} explore ${intentId}: done ${done}`)
        } else {
          await deps.run(['release', '--worker', WORKER, intentId], workdir).catch(() => undefined)
          log.push(`R${round} explore ${intentId}: blocked｜${outcome?.summary ?? '(no summary)'}`)
        }
      } catch (error) {
        await deps.run(['release', '--worker', WORKER, intentId], workdir).catch(() => undefined)
        log.push(`R${round} explore ${intentId}: 失败 ${String((error as Error).message).slice(0, 120)}`)
      }
    }

    /* ── 3. verify newly confirmed findings ────────────────────────── */
    const afterExplore = await deps.readGraph(storeDir)
    const findings = (afterExplore?.facts ?? []).filter(fact => fact.kind === 'vuln')
    const verified = new Set(
      (afterExplore?.facts ?? [])
        .filter(fact => (fact.title ?? '').startsWith('复核：'))
        .map(fact => String(fact.data?.target ?? '')),
    )
    for (const finding of findings) {
      if (verified.has(finding.id)) continue
      const verifyPrompt = [
        '你是独立复核者。你的唯一职责是**怀疑**：想办法推翻下面的结论；推不翻它才算成立。',
        '',
        `## 被复核结论 ${finding.id}`,
        `${finding.title ?? ''}：${finding.description ?? ''}`,
        finding.doc ? `\n产出方证据：\n${finding.doc.slice(0, 1200)}` : '\n（产出方没有提供证据文档）',
        '',
        '要求：',
        '- **只读复核**：不改目标状态、不扩大攻击面、不尝试新的利用。',
        '- 换一个独立于产出方的方法重新证明（同一路径再跑一遍没有复核价值）。',
        '- 排除假象：缓存、前端校验、统一错误页、代理回显。',
        '- 证据不足就判 insufficient 并说明缺什么，不要硬判。',
        '- **不要自己落图**：把判定写在返回值里，驱动者会统一记录。',
        '',
        '输出方式：先用 3-5 行中文写清你的判定与理由（这段会显示给指挥官看），再调用结构化输出工具提交。',
        '（结构化输出的提示只要求「结果以工具调用为准」，并不禁止你写正文。只发工具调用等于不说话。）',
      ].join('\n')

      try {
        const verdict = await runChild(`drive-verify-${finding.id}`, verifyPrompt, VERIFY_SCHEMA) as
          | { verdict?: string; method?: string; reason?: string }
          | undefined
        const judged = verdict?.verdict ?? 'insufficient'
        /* The driver records the verdict, so dedup never depends on the child
           remembering to write it. */
        try {
          const argv = [
            'fact',
            `复核 ${finding.id}：${judged}，${verdict?.reason ?? '无说明'}`,
            '--title', `复核：${(finding.title ?? finding.id).slice(0, 24)}`,
            '--kind', 'note',
            '--data', `target=${finding.id}`,
            '--data', `verdict=${judged}`,
          ]
          if (verdict?.method) argv.push('--data', `method=${verdict.method}`)
          await deps.run(argv, workdir)
        } catch (error) {
          log.push(`R${round} verify ${finding.id}: 记录失败 ${String((error as Error).message).slice(0, 80)}`)
        }
        log.push(`R${round} verify ${finding.id}: ${judged}｜${verdict?.reason ?? ''}`)
      } catch (error) {
        log.push(`R${round} verify ${finding.id}: 失败 ${String((error as Error).message).slice(0, 100)}`)
      }
    }

    /* ── 4. supervisor audit: gate verified findings for delivery ──── */
    const afterVerify = await deps.readGraph(storeDir)
    const allFacts = afterVerify?.facts ?? []
    const verdictOf = new Map<string, string>()
    for (const note of allFacts) {
      if (!(note.title ?? '').startsWith('复核：')) continue
      const target = String(note.data?.target ?? '')
      if (target !== '') verdictOf.set(target, String(note.data?.verdict ?? ''))
    }
    const audited = new Set(
      allFacts
        .filter(note => (note.title ?? '').startsWith('审计：'))
        .map(note => String(note.data?.target ?? '')),
    )

    for (const finding of allFacts) {
      if (finding.kind !== 'vuln') continue
      if (verdictOf.get(finding.id) !== 'verified') continue
      if (audited.has(finding.id)) continue
      const verifyNote = allFacts.find(note => (note.title ?? '').startsWith('复核：') && String(note.data?.target ?? '') === finding.id)
      const auditPrompt = [
        '你是成果审计者（Supervisor）。你不管这个漏洞真不真（复核车道已经做过），只管**这份东西能不能交到甲方手里**。',
        '',
        `## 被审计结论 ${finding.id}`,
        `${finding.title ?? ''}：${finding.description ?? ''}`,
        finding.data && Object.keys(finding.data).length > 0
          ? `结构化字段：${Object.entries(finding.data).map(([key, value]) => `${key}=${String(value)}`).join(', ')}`
          : '结构化字段：(无)',
        finding.doc ? `\n产出方证据：\n${finding.doc.slice(0, 1500)}` : '\n（产出方没有提供证据文档）',
        '',
        '## 独立复核结论',
        verifyNote ? `${verifyNote.description ?? ''}（复核方法：${String(verifyNote.data?.method ?? '未注明')}）` : '(尚无复核结论)',
        '',
        '## 五条审计项（逐条判，任一条不过即 reject）',
        '1. 证据可复现：完整命令或 HTTP 请求、原始响应片段、时间；转述与扫描器输出不算。',
        '2. 危害有实据：实权（会话/shell/管理员/密钥实值）或实害（他人数据/破坏能力），不做「看起来能打」的推断。',
        '3. 定级有依据：档位与官方类型对得上，按 sapper-scoring 的定级细则与 CVSS 映射。',
        '4. 报告口径齐：截图含地址栏与完整页面、完整数据包三铁律、复现步骤、证据链。',
        '5. 撤场干净：webshell/上传文件/新增账号/配置改动有清理清单且已执行。',
        '',
        '要求：',
        '- **只读审计**：不重测目标、不改目标状态、不发起新请求。需要看全文时用 sapper_show / sapper_doc 读。',
        '- 先加载 `skill(\'lane-auditor\')` 与 `skill(\'sapper-scoring\')` 再判。',
        '- 证据缺项就 reject 并逐条写明缺什么；不要为了放过而放宽标准。',
        '- **不要自己落图**：把判定写在返回值里，驱动者会统一记录。',
        '',
        '输出方式：先用 3-5 行中文写清你的判定与理由（这段会显示给指挥官看），再调用结构化输出工具提交。',
        '（结构化输出的提示只要求「结果以工具调用为准」，并不禁止你写正文。只发工具调用等于不说话。）',
      ].join('\n')

      try {
        const judged = await runChild(`drive-audit-${finding.id}`, auditPrompt, AUDIT_SCHEMA) as
          | { verdict?: string; level?: string; missing?: string[]; reason?: string }
          | undefined
        const gate = judged?.verdict === 'pass' ? 'pass' : 'reject'
        try {
          const argv = [
            'fact',
            `审计 ${finding.id}：${gate}，${judged?.reason ?? '无说明'}`,
            '--title', `审计：${(finding.title ?? finding.id).slice(0, 24)}`,
            '--kind', 'note',
            '--data', `target=${finding.id}`,
            '--data', `verdict=${gate}`,
          ]
          if (judged?.level) argv.push('--data', `level=${judged.level}`)
          const gaps = (judged?.missing ?? []).filter(item => typeof item === 'string' && item.trim() !== '')
          if (gaps.length > 0) argv.push('--data', `missing=${gaps.join('；').slice(0, 200)}`)
          await deps.run(argv, workdir)
        } catch (error) {
          log.push(`R${round} audit ${finding.id}: 记录失败 ${String((error as Error).message).slice(0, 80)}`)
        }
        log.push(`R${round} audit ${finding.id}: ${gate}${judged?.level ? `（${judged.level}）` : ''}｜${judged?.reason ?? ''}`)
      } catch (error) {
        log.push(`R${round} audit ${finding.id}: 失败 ${String((error as Error).message).slice(0, 100)}`)
      }
    }

    roundsRun = round
  }

  const finalGraph = await deps.readGraph(storeDir)
  log.push('')
  log.push(`完成 ${roundsRun} 轮${stopped ? `（${stopped}）` : ''}。当前：${finalGraph?.facts.length ?? 0} 事实 / ${finalGraph?.intents.length ?? 0} 意图。`)
  return { roundsRun, stopped, log }
}
