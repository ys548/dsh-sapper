/**
 * dsh-sapper, profile-level half.
 *
 * One row mounted by this bundle's patch layer does two things the rest of the
 * package assumes exist exactly once per profile:
 *
 * 1. the read-only collaboration-board route (`/api/sapper/graph`), reused
 *    verbatim from the fork's `@deepseek-ai/dsh-client-ui-sapper-board` node
 *    half — the browser polls it for the engagement graph;
 * 2. the sapper skill catalog: the 43 methodology skills and 7 lane specs ship
 *    inside this package under `presets/`, so they are registered through a
 *    provider rooted at `import.meta.dirname` instead of a hard-coded absolute
 *    path in a preset. Registering at profile scope keeps one provider for the
 *    whole app; preset rows stay pure tool rows.
 * @module dsh-sapper
 */
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import { apply as applyBoard } from '@deepseek-ai/dsh-client-ui-sapper-board';
import { resolve } from 'node:path';
export const name = 'dsh-sapper';
/** Services the board route and the skill provider need before mounting. */
export const inject = ['webServer', 'workspaceRegistry', 'skills'];
/** Package root (`lib` -> package directory), the anchor for shipped assets. */
const PACKAGE_ROOT = resolve(import.meta.dirname, '..');
/**
 * Directory holding the shipped methodology skills.
 * @returns absolute path of `presets/sapper-skills`.
 */
export function skillDir() {
    return resolve(PACKAGE_ROOT, 'presets', 'sapper-skills');
}
/**
 * Directory holding the shipped lane specifications.
 * @returns absolute path of `presets/sapper-lanes`.
 */
export function laneDir() {
    return resolve(PACKAGE_ROOT, 'presets', 'sapper-lanes');
}
/**
 * Mount the graph route and the sapper skill catalog.
 * @param ctx - profile-level context carrying `webServer`, `workspaceRegistry` and `skills`.
 */
export function apply(ctx) {
    applyBoard(ctx, {
        store: '.sapper',
        route: '/api/sapper/graph',
    });
    ctx.skills.registerProvider(control => new FileSystemSkillProvider(ctx, control, {
        providerName: 'sapper',
        customSkillDirs: [skillDir(), laneDir()],
    }));
}
//# sourceMappingURL=index.js.map