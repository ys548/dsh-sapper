/**
 * Poll the Host graph route for the current engagement graph.
 *
 * The Host resolves which store to read (explicit override, then any registered
 * workspace that already holds one, then its own directory), so the browser
 * does not need to know the folder layout.
 */
import { useEffect, useState } from 'react';
/** Route registered by this package's Host half. */
const GRAPH_ROUTE = '/api/sapper/graph';
/** Poll cadence: the graph changes at human pace, not frame pace. */
const POLL_MS = 4000;
/**
 * Subscribe to one engagement graph.
 * @param paused - when true, keep the last graph and stop polling.
 * @param cwd - store directory to read; null asks the Host to pick one.
 * @returns the latest graph, the target list, and loading and error state.
 */
export function useSapperGraph(paused = false, cwd = null) {
    const [state, setState] = useState({ graph: null, targets: [], loading: true, error: null, store: null });
    useEffect(() => {
        let cancelled = false;
        const route = cwd === null || cwd.length === 0
            ? GRAPH_ROUTE
            : `${GRAPH_ROUTE}?cwd=${encodeURIComponent(cwd)}`;
        const read = async () => {
            try {
                const response = await fetch(route, { headers: { accept: 'application/json' } });
                if (!response.ok)
                    throw new Error(`HTTP ${response.status}`);
                const payload = (await response.json());
                if (cancelled)
                    return;
                setState({
                    graph: payload.graph ?? null,
                    targets: payload.targets ?? [],
                    loading: false,
                    error: null,
                    store: payload.store ?? null,
                });
            }
            catch (error) {
                if (cancelled)
                    return;
                setState(previous => ({
                    graph: previous.graph,
                    targets: previous.targets,
                    loading: false,
                    error: error instanceof Error ? error.message : String(error),
                    store: previous.store,
                }));
            }
        };
        void read();
        if (paused)
            return () => { cancelled = true; };
        const timer = setInterval(() => { void read(); }, POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [paused, cwd]);
    return state;
}
//# sourceMappingURL=useSapperGraph.js.map