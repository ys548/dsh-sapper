/**
 * sapper fact-graph tools for DeepSeek Harness.
 *
 * Bridges the sapper engagement graph — typed facts, work intents, a flag
 * ledger and per-node documents — into the Harness as model-facing tools.
 *
 * sapper runs on the host Python directly. Upstream imports `fcntl` at module
 * scope, which Windows lacks; a small cross-platform lock patch (guarded import
 * with an msvcrt fallback in lib/sapper.py) lets the CLI run natively, so no WSL
 * indirection is needed and POSIX behaviour is unchanged.
 *
 * Verified against `sapper <cmd> --help` and live runs:
 *   fact <description> [-t title] [-k kind] [-d KEY=VAL]... [--doc TEXT]
 *   intent <description> --from ids [--title] [--doc TEXT] [--confirm]
 *   flag <value> [-c challenge] [--submit]
 *   doc <id> [--set TEXT | --set-file PATH]
 *   claim <id> --worker NAME | release <id> | done <id> --fact ID
 *   frontier | pick | show <kind> <id> | recall <query> | validate | kb search
 * @module @deepseek-ai/dsh-tool-sapper
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { registerDriveTool, type DriveGraph } from './drive.ts'
import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'

export const name = 'tool-sapper'
export const inject = ['tools', 'subagents']

/** Deployment choices for the sapper bridge. */
export interface Config {
  /** Absolute path to the sapper checkout that holds `lib/sapper.py`. */
  sapperRoot: string
  /** Host Python interpreter used to run the CLI. */
  pythonPath: string
  /** Store directory, resolved against the target working directory. */
  store: string
  /** Hard ceiling for one CLI invocation, in milliseconds. */
  timeoutMs: number
}

/** Schemastery configuration for the sapper bridge. */
export const Config: z<Config> = z.object({
  sapperRoot: z.string().default('D:\\demo\\sapper-v2-18-champion\\sapper-v2-18-champion'),
  pythonPath: z.string().default('D:\\Compiler\\python3\\python.exe'),
  store: z.string().default('.sapper'),
  timeoutMs: z.number().default(60000),
})

/** One node shape shared by facts and intents; both are flat JSON documents. */
export interface GraphNode {
  id?: string
  title?: string
  description?: string
  doc?: string | null
  kind?: string
  status?: string
  from?: string[]
  to?: string | null
  worker?: string | null
  claimed_at?: string | null
  requires_confirmation?: boolean
  confirmed_at?: string | null
  created_at?: string
  concluded_at?: string | null
  data?: Record<string, unknown> | null
}

interface GraphProject {
  goal?: string | null
  status?: string | null
}

/** Board summary returned to the model. */
interface Board {
  goal: string | null
  status: string | null
  facts: number
  factsByKind: Record<string, number>
  intents: number
  open: number
  claimed: number
  flags: number
  flagsSubmitted: number
  openIntents?: Array<{
    id: string
    title: string
    description: string
    from: string[]
    worker: string | null
    requiresConfirmation: boolean
  }>
  factList?: Array<{
    id: string
    kind: string
    title: string
    description: string
  }>
}

/**
 * Run one sapper subcommand against a store.
 * @param config - resolved deployment configuration.
 * @param args - argv after the program name.
 * @param workdir - host directory whose `store` is targeted.
 * @returns trimmed stdout.
 */
function runSapper(config: Config, args: string[], workdir: string): Promise<string> {
  const cli = join(resolve(config.sapperRoot), 'lib', 'sapper.py')
  const store = resolve(workdir, config.store)
  const argv = [cli, '--store', store, ...args]

  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      config.pythonPath,
      argv,
      {
        timeout: config.timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        // The CLI reads and writes UTF-8; keep Python off the legacy console code page.
        env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
      },
      (error, stdout, stderr) => {
        const out = String(stdout ?? '').trim()
        const err = String(stderr ?? '').trim()
        if (error) {
          rejectPromise(new Error(`sapper ${args[0]} failed: ${err || out || error.message}`))
          return
        }
        resolvePromise(out)
      },
    )
  })
}

/**
 * Read a graph straight off disk so the board costs no process spawn.
 * @param storeDir - absolute host path of the `.sapper` store.
 * @returns the parsed graph, or null when no store exists there.
 */
async function readGraph(storeDir: string): Promise<{ project: GraphProject; facts: GraphNode[]; intents: GraphNode[] } | null> {
  let project: GraphProject
  try {
    project = JSON.parse(await readFile(join(storeDir, 'project.json'), 'utf8')) as GraphProject
  } catch {
    return null
  }

  const readNodes = async (kind: 'facts' | 'intents'): Promise<GraphNode[]> => {
    let names: string[]
    try {
      names = await readdir(join(storeDir, kind))
    } catch {
      return []
    }
    const nodes: GraphNode[] = []
    for (const file of names) {
      if (!file.endsWith('.json')) continue
      try {
        nodes.push(JSON.parse(await readFile(join(storeDir, kind, file), 'utf8')) as GraphNode)
      } catch {
        // A half-written node must not blank the whole board.
      }
    }
    return nodes
  }

  const [facts, intents] = await Promise.all([readNodes('facts'), readNodes('intents')])
  return { project, facts, intents }
}

/**
 * Reduce a graph to the counts a scheduling decision needs.
 * @param graph - parsed store.
 * @returns the board summary.
 */
function summarize(graph: { project: GraphProject; facts: GraphNode[]; intents: GraphNode[] }): Board {
  const open = graph.intents.filter(i => i.status !== 'done' && i.status !== 'abandoned')
  const factsByKind: Record<string, number> = {}
  for (const fact of graph.facts) {
    const kind = fact.kind || 'note'
    factsByKind[kind] = (factsByKind[kind] ?? 0) + 1
  }
  const flags = graph.facts.filter(f => f.kind === 'flag')
  return {
    goal: graph.project.goal ?? null,
    status: graph.project.status ?? null,
    facts: graph.facts.length,
    factsByKind,
    intents: graph.intents.length,
    open: open.length,
    claimed: open.filter(i => i.worker || i.claimed_at).length,
    flags: flags.length,
    flagsSubmitted: flags.filter(f => f.data?.submitted === true || f.data?.status === 'submitted').length,
  }
}

/**
 * Flatten a board into the JSON-safe record the tool contract requires.
 * @param board - the summarised graph.
 * @returns a JSON-safe record.
 */
function boardToValue(board: Board): Record<string, JsonValue> {
  const value: Record<string, JsonValue> = {
    goal: board.goal,
    status: board.status,
    facts: board.facts,
    factsByKind: board.factsByKind,
    intents: board.intents,
    open: board.open,
    claimed: board.claimed,
    flags: board.flags,
    flagsSubmitted: board.flagsSubmitted,
  }
  if (board.openIntents) value.openIntents = board.openIntents
  if (board.factList) value.factList = board.factList
  return value
}

/**
 * Render a board result as the compact text the model reads.
 * @param value - the `sapper_board` return value.
 * @returns plain-text board lines.
 */
function renderBoard(value: Record<string, unknown>): string {
  if (value.found !== true) return String(value.hint ?? 'No sapper graph.')
  const factsByKind = (value.factsByKind ?? {}) as Record<string, number>
  const kinds = Object.entries(factsByKind).map(([k, v]) => `${k}=${v}`).join(', ') || 'empty'
  return [
    `goal: ${(value.goal as string | null) ?? '(none)'}`,
    `facts: ${String(value.facts)} (${kinds})`,
    `intents: ${String(value.intents)} total · ${String(value.open)} open · ${String(value.claimed)} claimed`,
    `flags: ${String(value.flags)} captured · ${String(value.flagsSubmitted)} submitted`,
  ].join('\n')
}

/**
 * Register the sapper tools on `ctx.tools`.
 * @param ctx - registrant context carrying the tool registry.
 * @param config - deployment's sapper bridge configuration.
 */
export function apply(ctx: Context, config: Config): void {
  /** The directory a call operates on; every tool accepts an explicit override. */
  const workdirFor = (args?: { cwd?: string }): string =>
    typeof args?.cwd === 'string' && args.cwd.length > 0 ? resolve(args.cwd) : process.cwd()

  const passthroughOutput = {
    schema: { type: 'object', additionalProperties: true } as const,
    render: (_args: unknown, value: JsonValue): ContentBlock[] => [
      { type: 'text', text: String((value as { output?: string }).output ?? '') },
    ],
  }

  ctx.tools.register(defineTool({
    name: 'sapper_board',
    description:
      'Read the sapper engagement fact graph as a compact board: goal, fact counts by kind, and '
      + 'open/claimed intents. Call this before every scheduling decision instead of dumping the '
      + 'whole graph, and to see which confirmed findings still lack evidence.',
    parameters: {
      cwd: {
        type: 'string',
        description: 'Target directory holding the .sapper store. Defaults to the process working directory.',
      },
      detail: {
        type: 'string',
        enum: ['summary', 'intents', 'facts'],
        description: 'summary (default) returns counts; intents lists open work; facts lists confirmed observations.',
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: renderBoard(value as Record<string, unknown>) }],
    },
    presentCall: args => ({ card: 'generic', title: 'sapper board', kind: 'read', rawInput: args }),
    async execute(args): Promise<Record<string, JsonValue>> {
      const storeDir = resolve(workdirFor(args), config.store)
      const graph = await readGraph(storeDir)
      if (!graph) {
        return {
          found: false,
          store: storeDir,
          hint: 'No .sapper store here. Create one with sapper_init.',
        }
      }
      const board = summarize(graph)
      if (args.detail === 'intents') {
        board.openIntents = graph.intents
          .filter(i => i.status !== 'done' && i.status !== 'abandoned')
          .map(i => ({
            id: i.id ?? '',
            title: i.title ?? '',
            description: i.description ?? '',
            from: i.from ?? [],
            worker: i.worker ?? null,
            requiresConfirmation: i.requires_confirmation === true,
          }))
      }
      if (args.detail === 'facts') {
        board.factList = graph.facts.map(f => ({
          id: f.id ?? '',
          kind: f.kind || 'note',
          title: f.title ?? '',
          description: f.description ?? '',
        }))
      }
      return { found: true, store: storeDir, ...boardToValue(board) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'sapper_init',
    description:
      'Create the sapper fact graph for a target directory. Run once per engagement. A graph from a '
      + 'FINISHED engagement is archived automatically and a fresh one initialized; an ACTIVE graph is '
      + 'kept and reported so you can continue it with sapper_board — re-run with force only when the '
      + 'active goal is not yours.',
    parameters: {
      goal: { type: 'string', required: true, description: 'Engagement goal, one sentence.' },
      origin: { type: 'string', description: 'Optional origin or authorization reference (ticket id, SOW, scope doc).' },
      force: {
        type: 'boolean',
        description: 'Replace an ACTIVE graph that belongs to a different engagement. The old graph is '
          + 'archived, never deleted; a symlinked/junction store is re-pointed, its target untouched.',
      },
      cwd: { type: 'string', description: 'Target directory that will hold the .sapper store.' },
    },
    output: passthroughOutput,
    presentCall: args => ({ card: 'generic', title: 'sapper init', rawInput: args }),
    async execute(args) {
      const argv = ['init']
      if (args.force) argv.push('--force')
      argv.push('--goal', args.goal)
      if (args.origin) argv.push('--origin', args.origin)
      const out = await runSapper(config, argv, workdirFor(args))
      return { ok: true, output: out }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'sapper_fact',
    description:
      'Record one CONFIRMED observation in the sapper fact graph (host/service/cred/vuln/loot/flag/note). '
      + 'Only facts backed by real evidence belong here; this graph is the engagement memory that '
      + 'survives every agent restart. Attach commands, raw responses and artifact paths in the doc.',
    parameters: {
      description: { type: 'string', required: true, description: 'One-sentence gist of the observation.' },
      title: { type: 'string', description: 'Short human-readable label shown in the graph view.' },
      kind: {
        type: 'string',
        enum: ['host', 'service', 'cred', 'vuln', 'loot', 'flag', 'note'],
        description: 'Observation type. Defaults to note. sapper has no report kind: record a confirmed finding as vuln and put the report path and its evidence in doc.',
      },
      data: {
        type: 'array',
        items: { type: 'string' },
        description: 'Repeatable KEY=VALUE pairs, e.g. ["host=10.0.2.15","port=80"].',
      },
      doc: {
        type: 'string',
        description: 'Optional markdown evidence: exact commands, raw responses, artifact paths.',
      },
      fromIntent: { type: 'string', description: 'Intent id that produced this fact, e.g. "i001".' },
      cwd: { type: 'string', description: 'Target directory holding the .sapper store.' },
    },
    output: passthroughOutput,
    presentCall: args => ({ card: 'generic', title: `sapper fact: ${args.kind ?? 'note'}`, rawInput: args }),
    async execute(args) {
      const argv = ['fact', args.description]
      if (args.title) argv.push('-t', args.title)
      if (args.kind) argv.push('-k', args.kind)
      for (const pair of args.data ?? []) argv.push('-d', pair)
      if (args.doc) argv.push('--doc', args.doc)
      if (args.fromIntent) argv.push('--from-intent', args.fromIntent)
      const out = await runSapper(config, argv, workdirFor(args))
      return { ok: true, id: out.split(/\s+/).pop() ?? '', output: out }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'sapper_intent',
    description:
      'Propose one unit of offensive work (an intent) in the sapper graph, linked to the facts it '
      + 'depends on. An intent is the edge from known facts toward the fact it will produce.',
    parameters: {
      description: { type: 'string', required: true, description: 'One concrete next step, single sentence.' },
      from: {
        type: 'array',
        required: true,
        items: { type: 'string' },
        description: 'Fact ids this intent builds on, e.g. ["f001","f002"].',
      },
      title: { type: 'string', description: 'Short actionable label, e.g. "端口扫描".' },
      doc: {
        type: 'string',
        description: 'Optional markdown playbook: exact commands, tool fallbacks, expected evidence.',
      },
      requiresConfirmation: {
        type: 'boolean',
        description: 'True only for genuinely destructive or out-of-scope-risk actions.',
      },
      cwd: { type: 'string', description: 'Target directory holding the .sapper store.' },
    },
    output: passthroughOutput,
    presentCall: args => ({ card: 'generic', title: 'sapper intent', rawInput: args }),
    async execute(args) {
      const argv = ['intent', args.description, '--from', args.from.join(',')]
      if (args.title) argv.push('--title', args.title)
      if (args.doc) argv.push('--doc', args.doc)
      if (args.requiresConfirmation) argv.push('--confirm')
      const out = await runSapper(config, argv, workdirFor(args))
      return { ok: true, id: out.split(/\s+/).pop() ?? '', output: out }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'sapper_frontier',
    description:
      'List the intents that are ready to work (open, unclaimed, dependencies satisfied) and the id '
      + '`pick` would choose. Drive the loop with it: frontier → claim → work → done.',
    parameters: {
      cwd: { type: 'string', description: 'Target directory holding the .sapper store.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const v = value as { output?: string }
        return [{ type: 'text', text: String(v.output ?? '') }]
      },
    },
    presentCall: args => ({ card: 'generic', title: 'sapper frontier', kind: 'read', rawInput: args }),
    async execute(args) {
      const workdir = workdirFor(args)
      const frontier = await runSapper(config, ['frontier'], workdir)
      let next = ''
      try {
        next = await runSapper(config, ['pick'], workdir)
      } catch {
        // An empty frontier makes `pick` exit non-zero; that is a normal state.
        next = ''
      }
      const output = frontier.trim() === ''
        ? 'frontier empty — propose intents first'
        : `${frontier}\n--- pick ---\n${next}`
      return { ok: true, frontier, next, output }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'sapper_claim',
    description:
      'Claim an intent for a lane teammate so two lanes never work the same unit. Claim before '
      + 'starting the work; conclude it later with sapper_done.',
    parameters: {
      id: { type: 'string', required: true, description: 'Intent id, e.g. "i003".' },
      worker: { type: 'string', required: true, description: 'Lane name claiming it, e.g. "lane-web".' },
      cwd: { type: 'string', description: 'Target directory holding the .sapper store.' },
    },
    output: passthroughOutput,
    presentCall: args => ({ card: 'generic', title: `sapper claim: ${args.id}`, rawInput: args }),
    async execute(args) {
      const out = await runSapper(config, ['claim', args.id, '--worker', args.worker], workdirFor(args))
      return { ok: true, output: out }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'sapper_release',
    description:
      'Release a claimed intent without concluding it, so another lane can pick it up. Use when the '
      + 'lane gives up, is interrupted, or finds the intent blocked.',
    parameters: {
      id: { type: 'string', required: true, description: 'Intent id, e.g. "i003".' },
      worker: { type: 'string', description: 'Lane name releasing it; omit to release unconditionally.' },
      cwd: { type: 'string', description: 'Target directory holding the .sapper store.' },
    },
    output: passthroughOutput,
    presentCall: args => ({ card: 'generic', title: `sapper release: ${args.id}`, rawInput: args }),
    async execute(args) {
      const argv = ['release', args.id]
      if (args.worker) argv.push('--worker', args.worker)
      const out = await runSapper(config, argv, workdirFor(args))
      return { ok: true, output: out }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'sapper_done',
    description:
      'Conclude an intent with its confirmed result. sapper CREATES the produced fact from `summary` — '
      + 'do not pass a fact id here. This is how an intent leaves the frontier, and it records the '
      + 'linkage that makes the attack chain reconstructable.',
    parameters: {
      id: { type: 'string', required: true, description: 'Intent id being concluded, e.g. "i003".' },
      summary: {
        type: 'string',
        required: true,
        description: 'The confirmed result in one sentence; this becomes the produced fact\'s description.',
      },
      title: { type: 'string', description: 'Short 2-10 character title for the produced fact.' },
      kind: {
        type: 'string',
        enum: ['host', 'service', 'cred', 'vuln', 'loot', 'flag', 'note'],
        description: 'Typed kind for the produced fact.',
      },
      data: {
        type: 'array',
        items: { type: 'string' },
        description: 'Structured KEY=VALUE pairs, e.g. ["host=10.0.0.1", "port=22"].',
      },
      doc: { type: 'string', description: 'Evidence markdown: commands run and raw response excerpts.' },
      worker: { type: 'string', description: 'Worker name; must match whoever claimed the intent.' },
      cwd: { type: 'string', description: 'Target directory holding the .sapper store.' },
    },
    output: passthroughOutput,
    presentCall: args => ({ card: 'generic', title: `sapper done: ${args.id}`, rawInput: { id: args.id, summary: args.summary } }),
    async execute(args) {
      const argv = ['done', args.id, '--fact', args.summary]
      if (args.title) argv.push('--title', args.title)
      if (args.kind) argv.push('--kind', args.kind)
      for (const pair of args.data ?? []) argv.push('--data', pair)
      if (args.doc) argv.push('--doc', args.doc)
      if (args.worker) argv.push('--worker', args.worker)
      const out = await runSapper(config, argv, workdirFor(args))
      return { ok: true, output: out }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'sapper_complete',
    description:
      'Mark the engagement goal satisfied, citing the facts that prove it. This closes the project '
      + 'rather than one intent — use it once the objective is genuinely met, not per finding.',
    parameters: {
      from: {
        type: 'array',
        required: true,
        items: { type: 'string' },
        description: 'Fact ids that together prove the goal is met, e.g. ["f001","f008"].',
      },
      note: { type: 'string', description: 'Optional closing note recorded on the project.' },
      cwd: { type: 'string', description: 'Target directory holding the .sapper store.' },
    },
    output: passthroughOutput,
    presentCall: args => ({ card: 'generic', title: 'sapper complete', rawInput: args }),
    async execute(args) {
      const argv = ['complete', '--from', args.from.join(',')]
      if (args.note) argv.push('--note', args.note)
      const out = await runSapper(config, argv, workdirFor(args))
      return { ok: true, output: out }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'sapper_confirm',
    description:
      'Confirm an intent created with requiresConfirmation, recording that the human approved the '
      + 'risky action. Without this the intent stays pending and must not be executed.',
    parameters: {
      id: { type: 'string', required: true, description: 'Intent id to confirm, e.g. "i004".' },
      cwd: { type: 'string', description: 'Target directory holding the .sapper store.' },
    },
    output: passthroughOutput,
    presentCall: args => ({ card: 'generic', title: `sapper confirm: ${args.id}`, rawInput: args }),
    async execute(args) {
      const out = await runSapper(config, ['confirm', args.id], workdirFor(args))
      return { ok: true, output: out }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'sapper_doc',
    description:
      'Read or write the detailed document of a fact or intent — the third layer: title is the '
      + 'glance, description the one-line gist, doc the full evidence (commands, raw responses, '
      + 'reproduction steps). Keep report-grade material here instead of inflating the gist.',
    parameters: {
      id: { type: 'string', required: true, description: 'Fact or intent id, e.g. "f001" or "i002".' },
      set: { type: 'string', description: 'New markdown body. Omit to read the current doc.' },
      cwd: { type: 'string', description: 'Target directory holding the .sapper store.' },
    },
    output: passthroughOutput,
    presentCall: args => ({
      card: 'generic',
      title: `sapper doc: ${args.id}`,
      rawInput: { id: args.id, write: args.set !== undefined },
    }),
    async execute(args) {
      const argv = ['doc', args.id]
      if (args.set !== undefined) argv.push('--set', args.set)
      const out = await runSapper(config, argv, workdirFor(args))
      return { ok: true, output: out }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'sapper_show',
    description:
      'Show every field of one node: full JSON for a fact (kind, data, doc, provenance) or an intent '
      + '(from/to, status, worker, confirmation state). Use it when the board summary is not enough.',
    parameters: {
      type: { type: 'string', required: true, enum: ['fact', 'intent'], description: 'Node type to show.' },
      id: { type: 'string', required: true, description: 'Node id, e.g. "f001" or "i002".' },
      cwd: { type: 'string', description: 'Target directory holding the .sapper store.' },
    },
    output: passthroughOutput,
    presentCall: args => ({ card: 'generic', title: `sapper: ${args.type} ${args.id}`, kind: 'read', rawInput: args }),
    async execute(args) {
      const out = await runSapper(config, ['show', args.type, args.id], workdirFor(args))
      return { ok: true, output: out }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'sapper_recall',
    description:
      'Search prior facts and intents for nodes similar to a query, so a technique proven once can be '
      + 'reused instead of rediscovered. Read the matching node doc for the full playbook.',
    parameters: {
      query: { type: 'string', required: true, description: 'Free-text query, e.g. "SQL 注入 搜索框" or a CVE id.' },
      cwd: { type: 'string', description: 'Target directory holding the .sapper store.' },
    },
    output: passthroughOutput,
    presentCall: args => ({ card: 'generic', title: `sapper recall: ${args.query}`, kind: 'search', rawInput: args }),
    async execute(args) {
      const out = await runSapper(config, ['recall', args.query], workdirFor(args))
      return { ok: true, output: out }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'sapper_validate',
    description:
      'Audit graph integrity read-only: JSON shape, dangling references between facts and intents, '
      + 'and project status consistency. Run before writing a report so a damaged graph never reaches a client.',
    parameters: {
      cwd: { type: 'string', description: 'Target directory holding the .sapper store.' },
    },
    output: passthroughOutput,
    presentCall: args => ({ card: 'generic', title: 'sapper validate', kind: 'read', rawInput: args }),
    async execute(args) {
      const out = await runSapper(config, ['validate'], workdirFor(args))
      return { ok: true, output: out }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'sapper_hint',
    description:
      'Record a human hint on the graph, or list existing ones. Hints survive restarts and are shown '
      + 'with the graph, so an operator steer is never lost.',
    parameters: {
      text: { type: 'string', description: 'Hint text to record. Omit to list existing hints.' },
      cwd: { type: 'string', description: 'Target directory holding the .sapper store.' },
    },
    output: passthroughOutput,
    presentCall: args => ({ card: 'generic', title: 'sapper hint', rawInput: args }),
    async execute(args) {
      const argv = args.text ? ['hint', args.text] : ['hint']
      const out = await runSapper(config, argv, workdirFor(args))
      return { ok: true, output: out }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'sapper_kb',
    description:
      'Search the bundled offline knowledge base of techniques, CVE notes and writeups. Use it once a '
      + 'service or version is identified and you need known exploitation paths without network access.',
    parameters: {
      query: { type: 'string', required: true, description: 'Search keywords, e.g. "Shiro rememberMe" or "2021-44228".' },
      cwd: { type: 'string', description: 'Target directory holding the .sapper store.' },
    },
    output: passthroughOutput,
    presentCall: args => ({ card: 'generic', title: `sapper kb: ${args.query}`, kind: 'search', rawInput: args }),
    async execute(args) {
      const out = await runSapper(config, ['kb', 'search', args.query], workdirFor(args))
      return { ok: true, output: out }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'sapper_flag',
    description:
      'Record a captured objective marker (flag) in the sapper ledger with value dedupe and '
      + 'record-before-submit. Only needed when the engagement owner asks for objective markers; '
      + 'ordinary penetration-test deliverables are vulnerability reports, not flags.',
    parameters: {
      value: { type: 'string', required: true, description: 'The exact flag string.' },
      challenge: { type: 'string', description: 'Challenge or target code the flag belongs to.' },
      submit: { type: 'boolean', description: 'Also submit through the configured arena API.' },
      title: { type: 'string', description: 'Optional label for the flag node.' },
      cwd: { type: 'string', description: 'Target directory holding the .sapper store.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      // Never echo the flag value back into the transcript.
      render: () => [{ type: 'text', text: 'Flag recorded in the ledger.' }],
    },
    presentCall: args => ({
      card: 'generic',
      title: `sapper flag: ${args.challenge ?? 'record'}`,
      rawInput: { challenge: args.challenge, submit: args.submit },
    }),
    async execute(args) {
      const argv = ['flag', args.value]
      if (args.challenge) argv.push('-c', args.challenge)
      if (args.submit) argv.push('--submit')
      if (args.title) argv.push('-t', args.title)
      const out = await runSapper(config, argv, workdirFor(args))
      return { ok: true, output: out }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'sapper_report',
    description:
      'Create the report skeleton for a target on disk: one file per confirmed finding plus a '
      + 'summary report, each pre-filled with the sections an authorized-testing deliverable needs. '
      + 'Supervisor gate: only findings whose audit note says pass get a finding file. Rejected and '
      + 'never-audited findings are listed in a trailing 「待补证」 section instead, so nothing reaches '
      + 'the deliverable without passing lane-auditor. Call it once per target before writing findings '
      + 'up, then fill each file from the graph. Existing files are never overwritten unless overwrite is true.',
    parameters: {
      target: {
        type: 'string',
        required: true,
        description: 'Target name used as the report directory name, e.g. "example.com" or "192.168.1.10".',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of finding files to create from the graph. Defaults to 20.',
      },
      overwrite: {
        type: 'boolean',
        description: 'Rewrite files that already exist. Defaults to false, which skips them.',
      },
      includeUnaudited: {
        type: 'boolean',
        description: 'Also create finding files for findings that have no audit note yet. Defaults to false; '
          + 'use it only to draft, never to deliver.',
      },
      cwd: { type: 'string', description: 'Target directory holding the .sapper store and receiving the report tree.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => {
        const v = value as {
          created?: string[]
          skipped?: string[]
          root?: string
          error?: string
          gated?: { passed?: number; rejected?: number; unaudited?: number }
        }
        if (v.error) return [{ type: 'text', text: v.error }]
        const lines = [`report root: ${v.root ?? ''}`]
        const gate = v.gated ?? {}
        lines.push(`supervisor gate: ${gate.passed ?? 0} 条通过审计，${gate.rejected ?? 0} 条被打回，${gate.unaudited ?? 0} 条未审计`)
        if (v.created?.length) lines.push(`created ${v.created.length} file(s):`, ...v.created.map(f => `  ${f}`))
        if (v.skipped?.length) lines.push(`skipped ${v.skipped.length} existing file(s)`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    presentCall: args => ({ card: 'generic', title: `sapper report: ${args.target}`, kind: 'other', rawInput: args }),
    async execute(args): Promise<Record<string, JsonValue>> {
      const base = resolve(workdirFor(args))
      const storeDir = resolve(base, config.store)
      const graph = await readGraph(storeDir)
      if (!graph) {
        return { error: `No .sapper store at ${storeDir}; record findings before writing a report.` }
      }

      /* Supervisor gate: read the audit ledger before touching any deliverable file. */
      const audits = auditLedger(graph.facts)
      const vulns = graph.facts.filter(f => f.kind === 'vuln')
      const passed = vulns.filter(f => audits.get(f.id ?? '')?.verdict === 'pass')
      const rejected = vulns.filter(f => audits.get(f.id ?? '')?.verdict === 'reject')
      const unaudited = vulns.filter(f => !audits.has(f.id ?? ''))
      const findings = (args.includeUnaudited ? [...passed, ...rejected, ...unaudited] : passed)
        .slice(0, Math.max(1, args.limit ?? 20))
      const root = join(base, 'reports', sanitizeSegment(args.target))
      const created: string[] = []
      const skipped: string[] = []

      const writeIfAllowed = async (path: string, body: string): Promise<void> => {
        try {
          await stat(path)
          if (!args.overwrite) {
            skipped.push(relative(base, path))
            return
          }
        } catch {
          // Missing file is the normal path.
        }
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, body, 'utf8')
        created.push(relative(base, path))
      }

      for (const finding of findings) {
        const slug = sanitizeSegment(finding.title || finding.id || 'finding')
        await writeIfAllowed(
          join(root, 'findings', `${slug}.md`),
          findingTemplate(args.target, finding, audits.get(finding.id ?? '')),
        )
      }

      await writeIfAllowed(
        join(root, 'summary.md'),
        summaryTemplate(args.target, graph, passed, rejected, unaudited, audits),
      )
      return {
        root,
        created,
        skipped,
        findings: findings.length,
        gated: { passed: passed.length, rejected: rejected.length, unaudited: unaudited.length },
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'sapper_cli',
    description:
      'Run any other sapper subcommand directly (status, graph, complete, confirm, brainstorm-pick, '
      + 'arena, bench, sweep, auto, view, …). Prefer the dedicated tools for board, init, fact, intent, '
      + 'flag, frontier, claim, release, done, doc, show, recall, validate, hint and kb.',
    parameters: {
      args: {
        type: 'array',
        required: true,
        items: { type: 'string' },
        description: 'Raw argv after the program name, e.g. ["status"] or ["complete","--from","f008"].',
      },
      cwd: { type: 'string', description: 'Target directory holding the .sapper store.' },
    },
    output: passthroughOutput,
    presentCall: args => ({
      card: 'generic',
      title: `sapper ${(args.args ?? []).join(' ')}`,
      rawInput: { args: args.args },
    }),
    async execute(args) {
      const out = await runSapper(config, args.args, workdirFor(args))
      return { ok: true, output: out }
    },
  }))

  registerDriveTool(ctx, {
    run: (args, workdir) => runSapper(config, args, workdir),
    readGraph: async storeDir => (await readGraph(storeDir)) as DriveGraph | null,
    workdirFor,
    store: config.store,
  })
}

/** Replace characters that are illegal or awkward in a file name. */
function sanitizeSegment(value: string): string {
  return value.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'target'
}

/** One supervisor audit conclusion, as recorded by `sapper_drive` or lane-auditor. */
export interface AuditRecord {
  readonly verdict: 'pass' | 'reject'
  readonly level?: string
  readonly missing?: string
  readonly reason?: string
}

/**
 * Fold the audit notes in the graph into one conclusion per audited fact.
 *
 * Audit notes are `kind=note` facts titled `审计：<漏洞名>` carrying
 * `target=<fact id>`, `verdict=pass|reject` and optionally `level` / `missing`.
 * Later notes win, so a re-audit after补证 overrides the earlier rejection.
 */
export function auditLedger(facts: GraphNode[]): Map<string, AuditRecord> {
  const ledger = new Map<string, AuditRecord>()
  for (const note of facts) {
    if (note.kind !== 'note') continue
    if (!(note.title ?? '').startsWith('审计：')) continue
    const target = String(note.data?.target ?? '')
    if (target === '') continue
    const raw = String(note.data?.verdict ?? '').trim().toLowerCase()
    const verdict: 'pass' | 'reject' = raw === 'pass' || raw === '通过' || raw === '审计通过' ? 'pass' : 'reject'
    const level = String(note.data?.level ?? '').trim()
    const missing = String(note.data?.missing ?? '').trim()
    ledger.set(target, {
      verdict,
      ...level === '' ? {} : { level },
      ...missing === '' ? {} : { missing },
      ...note.description === undefined ? {} : { reason: note.description },
    })
  }
  return ledger
}

/** Build the per-finding report skeleton. */
export function findingTemplate(target: string, finding: GraphNode, audit?: AuditRecord): string {
  const data = finding.data && Object.keys(finding.data).length > 0
    ? Object.entries(finding.data).map(([k, v]) => `- ${k}: ${String(v)}`).join('\n')
    : '- (none recorded)'
  const level = audit?.level ?? ''
  const auditBlock = audit === undefined
    ? '（未审计：本文件仅为草稿，交付前必须过 lane-auditor）'
    : [
      `- 判定：${audit.verdict === 'pass' ? 'pass（可交付）' : 'reject（打回）'}`,
      `- 定级：${audit.level ?? '（审计未给档位）'}`,
      `- 理由：${audit.reason ?? ''}`,
      ...audit.missing === undefined ? [] : [`- 缺项：${audit.missing}`],
    ].join('\n')
  return `# ${finding.title || finding.id}

- 目标：${target}
- 事实编号：${finding.id ?? ''}
- 发现时间：${finding.created_at ?? ''}

## 结论

${finding.description ?? ''}

## Supervisor 审计

${auditBlock}

## 影响与定级

- CVSS 3.0 向量：
- 评分：
- 等级（高/中/低）：${level}
- 影响描述：

## 复现步骤

1.
2.
3.

## 原始请求与响应

\`\`\`http

\`\`\`

## 结构化数据

${data}

## 证据

- 证据文件：
- 截图：

## 修复建议

-
`
}

/** Build the summary report skeleton. */
export function summaryTemplate(
  target: string,
  graph: { project: GraphProject; facts: GraphNode[]; intents: GraphNode[] },
  passed: GraphNode[],
  rejected: GraphNode[],
  unaudited: GraphNode[],
  audits: Map<string, AuditRecord>,
): string {
  const rows = passed.length > 0
    ? passed.map((f) => {
      const audit = audits.get(f.id ?? '')
      const level = audit?.level ?? ''
      return `| ${f.id ?? ''} | ${f.title ?? ''} | ${level} | 审计通过 | findings/${sanitizeSegment(f.title || f.id || 'finding')}.md |`
    }).join('\n')
    : '| - | （暂无通过审计的漏洞） | | | |'

  const pendingLines: string[] = []
  for (const finding of rejected) {
    const audit = audits.get(finding.id ?? '')
    pendingLines.push(
      `- ${finding.id ?? ''} ${finding.title ?? ''} — **已打回**${audit?.level ? `（初审 ${audit.level}）` : ''}`
      + (audit?.missing ? `；缺：${audit.missing}` : '')
      + (audit?.reason ? `；理由：${audit.reason}` : ''),
    )
  }
  for (const finding of unaudited) {
    pendingLines.push(`- ${finding.id ?? ''} ${finding.title ?? ''} — **未审计**，先派 lane-auditor 过五关`)
  }
  const pending = pendingLines.length > 0
    ? `## 待补证（未过 Supervisor 审计，不入交付）\n\n${pendingLines.join('\n')}\n`
    : ''

  return `# ${target} 测试报告

- 测试目标：${target}
- 项目目标：${graph.project.goal ?? ''}
- 报告生成时间：${new Date().toISOString()}
- 交付范围：仅含 Supervisor 审计通过的 ${passed.length} 条

## 漏洞摘要

| 编号 | 名称 | 等级 | 状态 | 报告 |
|---|---|---|---|---|
${rows}

${pending}## 攻击面识别

（资产清单、暴露服务、入口点）

## 攻击链还原

（从初始入口到最终影响的完整路径；无则写未形成完整链）

## 风险排序

（按实际影响与利用难度排序，说明优先级理由）

## 修复建议

（按风险排序给出可执行建议）

## 测试局限

（未覆盖范围、受限项、需甲方配合验证的部分）

## 撤场清理清单

- 测试账号：
- 上传文件 / webshell：
- 持久化项：
`
}
