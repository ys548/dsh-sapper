/**
 * Poll the Host graph route for the current engagement graph.
 *
 * The Host resolves which store to read (explicit override, then any registered
 * workspace that already holds one, then its own directory), so the browser
 * does not need to know the folder layout.
 */

import { useEffect, useState } from 'react'
import type { GraphView, SapperTarget } from '../types.ts'

/** Route registered by this package's Host half. */
const GRAPH_ROUTE = '/api/sapper/graph'

/** Poll cadence: the graph changes at human pace, not frame pace. */
const POLL_MS = 4000

interface GraphState {
  /** Latest graph, or null before the first successful read. */
  graph: GraphView | null
  /** Engagements the Host can switch between. */
  targets: SapperTarget[]
  /** True while the first read is in flight. */
  loading: boolean
  /** Human-readable failure, cleared by the next success. */
  error: string | null
  /** Store directory the Host read, for the header line. */
  store: string | null
}

/**
 * Subscribe to one engagement graph.
 *
 * The last read per route is kept in a module-level cache, so a remount (the
 * panel unmounts when switched away) paints the previous read at once and
 * refreshes behind it instead of staring at the loading line again.
 * @param paused - when true, keep the last graph and stop polling.
 * @param cwd - store directory to read; null asks the Host to pick one.
 * @returns the latest graph, the target list, and loading and error state.
 */
const cache = new Map<string, GraphState>()

export function useSapperGraph(paused = false, cwd: string | null = null): GraphState {
  const route = cwd === null || cwd.length === 0
    ? GRAPH_ROUTE
    : `${GRAPH_ROUTE}?cwd=${encodeURIComponent(cwd)}`
  const [state, setState] = useState<GraphState>(
    () => cache.get(route) ?? { graph: null, targets: [], loading: true, error: null, store: null },
  )

  useEffect(() => {
    let cancelled = false
    const read = async (): Promise<void> => {
      try {
        const response = await fetch(route, { headers: { accept: 'application/json' } })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const payload = (await response.json()) as { graph?: GraphView; store?: string; targets?: SapperTarget[] }
        if (cancelled) return
        const next: GraphState = {
          graph: payload.graph ?? null,
          targets: payload.targets ?? [],
          loading: false,
          error: null,
          store: payload.store ?? null,
        }
        cache.set(route, next)
        setState(next)
      } catch (error) {
        if (cancelled) return
        setState(previous => ({
          graph: previous.graph,
          targets: previous.targets,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          store: previous.store,
        }))
      }
    }

    void read()
    if (paused) return () => { cancelled = true }
    /* Hidden pages skip polls; coming back visible reads once immediately. */
    const tick = (): void => { if (!document.hidden) void read() }
    const onVisible = (): void => { if (!document.hidden) void read() }
    const timer = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [paused, route])

  return state
}
