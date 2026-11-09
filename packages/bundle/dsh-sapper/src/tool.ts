/**
 * dsh-sapper, per-agent half: the twenty `sapper_*` graph tools.
 *
 * The plugin body is the fork's `@deepseek-ai/dsh-tool-sapper` unchanged; this
 * wrapper only supplies install-relative defaults so an installed bundle needs
 * no absolute path in its preset:
 *
 * - `sapperRoot` defaults to the vendored CLI shipped in this package
 *   (`sapper/`, holding `lib/sapper.py`), overridable with `SAPPER_ROOT`;
 * - `pythonPath` defaults to `SAPPER_PYTHON`, else `python` on PATH, so the
 *   interpreter is a deployment choice rather than a source constant;
 * - `store` stays `.sapper` inside the engagement workspace.
 * @module dsh-sapper/tool
 */

import type { Context } from '@deepseek-ai/cordis'
import { apply as applySapper } from '@deepseek-ai/dsh-tool-sapper'
import type { Config as ToolSapperConfig } from '@deepseek-ai/dsh-tool-sapper'
import { resolve } from 'node:path'

export { Config } from '@deepseek-ai/dsh-tool-sapper'
export { inject } from '@deepseek-ai/dsh-tool-sapper'

export const name = 'sapper-tools'

/** Package root (`lib` -> package directory), the anchor for the vendored CLI. */
const PACKAGE_ROOT = resolve(import.meta.dirname, '..')

/**
 * Absolute path of the CLI shipped inside this package.
 * @returns `<package>/sapper`, the directory holding `lib/sapper.py`.
 */
export function bundledCliRoot(): string {
  return resolve(PACKAGE_ROOT, 'sapper')
}

/**
 * Mount the sapper tool set, filling install-relative defaults.
 * @param ctx - agent context that carries the `tools` and `subagents` seams.
 * @param config - deployment overrides; every field is optional here because the
 * preset row ships without paths.
 */
export function apply(
  ctx: Context,
  config: Partial<ToolSapperConfig> = {},
): void {
  applySapper(ctx as unknown as Parameters<typeof applySapper>[0], {
    sapperRoot: config.sapperRoot ?? process.env.SAPPER_ROOT ?? bundledCliRoot(),
    pythonPath: config.pythonPath ?? process.env.SAPPER_PYTHON ?? 'python',
    store: config.store ?? '.sapper',
    timeoutMs: config.timeoutMs ?? 60_000,
  })
}
