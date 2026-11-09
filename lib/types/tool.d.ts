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
import type { Context } from '@deepseek-ai/cordis';
import type { Config as ToolSapperConfig } from '@deepseek-ai/dsh-tool-sapper';
import z from '@deepseek-ai/schemastery';
export { inject } from '@deepseek-ai/dsh-tool-sapper';
export declare const name = "sapper-tools";
/**
 * Absolute path of the CLI shipped inside this package.
 * @returns `<package>/sapper`, the directory holding `lib/sapper.py`.
 */
export declare function bundledCliRoot(): string;
/**
 * Deployment defaults for the installed bundle.
 *
 * `@deepseek-ai/dsh-tool-sapper`'s schema defaults to the fork's absolute
 * checkout paths, and the Loader parses a row's Config through the exported
 * schema *before* `apply` runs — so re-exporting it would override the
 * install-relative defaults on every install. Only the field set is shared.
 */
export declare const Config: z<ToolSapperConfig>;
/**
 * Mount the sapper tool set, filling install-relative defaults.
 * @param ctx - agent context that carries the `tools` and `subagents` seams.
 * @param config - deployment overrides; every field is optional here because the
 * preset row ships without paths.
 */
export declare function apply(ctx: Context, config?: Partial<ToolSapperConfig>): void;
//# sourceMappingURL=tool.d.ts.map