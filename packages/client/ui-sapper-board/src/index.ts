/**
 * sapper board plugin, node half.
 *
 * Registers one HTTP route the browser half polls for the current engagement
 * graph. The route reads the same on-disk `.sapper` store the sapper tools
 * write, so the board and the commander never disagree about state. Strictly
 * read-only: it never mutates the store.
 *
 * Store resolution, in order: an explicit `cwd` query, then each registered
 * workspace that already holds a store, then the server's own directory. The
 * workspace scan is what makes the board show the right engagement without the
 * browser having to know which folder the user opened.
 * @module @deepseek-ai/dsh-client-ui-sapper-board
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import z from '@deepseek-ai/schemastery'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { FactNode, GraphView, IntentNode, SapperTarget } from './types.ts'

export const name = 'ui-sapper-board'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Durable workspace registry; read to find the engagement store. */
    workspaceRegistry: {
      list: () => ReadonlyArray<{ path: string }> | Promise<ReadonlyArray<{ path: string }>>
    }
  }
}

/** Services required before the graph route can be registered. */
export const inject = ['webServer', 'workspaceRegistry']

/** Deployment choices for the read-only graph route. */
export interface Config {
  /** Store directory name inside a workspace directory. */
  store: string
  /** Route path the browser half fetches. */
  route: string
}

/** Schemastery configuration for the board's graph route. */
export const Config: z<Config> = z.object({
  store: z.string().default('.sapper'),
  route: z.string().default('/api/sapper/graph'),
})

/**
 * Test whether a directory holds a sapper store.
 * @param dir - absolute candidate directory.
 * @returns true when `project.json` is present.
 */
async function hasStore(dir: string): Promise<boolean> {
  try {
    const info = await stat(join(dir, 'project.json'))
    return info.isFile()
  } catch {
    return false
  }
}

/**
 * Read one node directory, skipping files that are not complete JSON.
 * @param dir - absolute directory holding one JSON document per node.
 * @returns parsed nodes, in directory order.
 */
async function readNodes<T>(dir: string): Promise<T[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const nodes: T[] = []
  for (const file of names) {
    if (!file.endsWith('.json')) continue
    try {
      nodes.push(JSON.parse(await readFile(join(dir, file), 'utf8')) as T)
    } catch {
      // A half-written node must not blank the whole board.
    }
  }
  return nodes
}

/**
 * Load the whole graph from disk.
 * @param storeDir - absolute path of the `.sapper` store.
 * @returns the graph, or an empty board when the store does not exist.
 */
async function loadGraph(storeDir: string): Promise<GraphView> {
  let goal: string | null = null
  let status: string | null = null
  try {
    const project = JSON.parse(await readFile(join(storeDir, 'project.json'), 'utf8')) as {
      goal?: string | null
      status?: string | null
    }
    goal = project.goal ?? null
    status = project.status ?? null
  } catch {
    return { goal: null, status: null, facts: [], intents: [] }
  }
  const [facts, intents] = await Promise.all([
    readNodes<FactNode>(join(storeDir, 'facts')),
    readNodes<IntentNode>(join(storeDir, 'intents')),
  ])
  return { goal, status, facts, intents }
}

/** The workspace registry surface this route needs, when the Host provides it. */
interface WorkspaceHost {
  list: () => Promise<ReadonlyArray<{ path?: string }>> | ReadonlyArray<{ path?: string }>
}

/**
 * Count JSON documents in a node directory.
 * @param dir - absolute facts or intents directory.
 * @returns how many `*.json` files are present.
 */
async function countJson(dir: string): Promise<number> {
  try {
    const names = await readdir(dir)
    return names.filter(name => name.endsWith('.json')).length
  } catch {
    return 0
  }
}

/**
 * Describe one store for the target switcher.
 * @param storeDir - absolute `.sapper` directory.
 * @returns the summary, or null when `project.json` is missing.
 */
async function summarizeStore(storeDir: string): Promise<SapperTarget | null> {
  if (!await hasStore(storeDir)) return null
  let goal: string | null = null
  let status: string | null = null
  try {
    const project = JSON.parse(await readFile(join(storeDir, 'project.json'), 'utf8')) as {
      goal?: string | null
      status?: string | null
    }
    goal = project.goal ?? null
    status = project.status ?? null
  } catch {
    return null
  }
  const [facts, intents] = await Promise.all([
    countJson(join(storeDir, 'facts')),
    countJson(join(storeDir, 'intents')),
  ])
  return { cwd: storeDir, goal, status, facts, intents }
}

/**
 * Every engagement the registered workspaces (and the server directory) hold.
 * @param config - route configuration.
 * @param workspaces - registered workspace rows.
 * @returns targets, first occurrence of each store directory.
 */
async function listTargets(
  config: Config,
  workspaces: ReadonlyArray<{ path?: string }> | null,
): Promise<SapperTarget[]> {
  const seen = new Set<string>()
  const targets: SapperTarget[] = []
  const consider = async (dir: string): Promise<void> => {
    const storeDir = (await hasStore(dir)) ? dir : resolve(dir, config.store)
    const key = resolve(storeDir)
    if (seen.has(key)) return
    seen.add(key)
    const target = await summarizeStore(key)
    if (target !== null) targets.push(target)
  }
  for (const workspace of workspaces ?? []) {
    if (typeof workspace.path !== 'string' || workspace.path.length === 0) continue
    await consider(workspace.path)
  }
  await consider(process.cwd())
  return targets
}

/**
 * Resolve which store a request targets.
 * @param request - the incoming request.
 * @param config - resolved route configuration.
 * @param workspaces - registered workspace rows, when the Host exposes them.
 * @returns absolute store path.
 */
async function storeFor(
  request: IncomingMessage,
  config: Config,
  workspaces: ReadonlyArray<{ path?: string }> | null,
): Promise<string> {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const explicit = url.searchParams.get('cwd')

  if (explicit !== null && explicit.length > 0) {
    const direct = resolve(explicit)
    // The query may name either the workspace or the store itself.
    return (await hasStore(direct)) ? direct : resolve(direct, config.store)
  }

  // Prefer a registered workspace that already carries the engagement.
  for (const workspace of workspaces ?? []) {
    if (typeof workspace.path !== 'string' || workspace.path.length === 0) continue
    const candidate = resolve(workspace.path, config.store)
    if (await hasStore(candidate)) return candidate
  }

  return resolve(process.cwd(), config.store)
}

/**
 * Register the graph route on the Host web server.
 * @param ctx - registrant context.
 * @param config - resolved route configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const respond = (response: ServerResponse, status: number, body: unknown): void => {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(body))
  }

  const workspaceHost = ctx.workspaceRegistry as WorkspaceHost | undefined

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: config.route,
    handler: (request: IncomingMessage, response: ServerResponse) => {
      void (async () => {
        let rows: ReadonlyArray<{ path?: string }> | null = null
        if (workspaceHost) {
          try {
            rows = await workspaceHost.list()
          } catch {
            rows = null
          }
        }
        const [storeDir, targets] = await Promise.all([
          storeFor(request, config, rows),
          listTargets(config, rows),
        ])
        const graph = await loadGraph(storeDir)
        respond(response, 200, { found: graph.facts.length > 0, store: storeDir, graph, targets })
      })().catch((error: unknown) => {
        respond(response, 500, { found: false, error: String(error) })
      })
    },
  }))
}
