/**
 * Poll the Host graph route for the current engagement graph.
 *
 * The Host resolves which store to read (explicit override, then any registered
 * workspace that already holds one, then its own directory), so the browser
 * does not need to know the folder layout.
 */
import type { GraphView, SapperTarget } from '../types.ts';
interface GraphState {
    /** Latest graph, or null before the first successful read. */
    graph: GraphView | null;
    /** Engagements the Host can switch between. */
    targets: SapperTarget[];
    /** True while the first read is in flight. */
    loading: boolean;
    /** Human-readable failure, cleared by the next success. */
    error: string | null;
    /** Store directory the Host read, for the header line. */
    store: string | null;
}
/**
 * Subscribe to one engagement graph.
 * @param paused - when true, keep the last graph and stop polling.
 * @param cwd - store directory to read; null asks the Host to pick one.
 * @returns the latest graph, the target list, and loading and error state.
 */
export declare function useSapperGraph(paused?: boolean, cwd?: string | null): GraphState;
export {};
//# sourceMappingURL=useSapperGraph.d.ts.map