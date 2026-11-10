/**
 * sapper board, browser half.
 *
 * Contributes two things: the sidebar launcher entry and the main-column page
 * it opens. The page renders the engagement fact graph as an attack map — typed
 * fact nodes colour-coded by kind, intents drawn as edges between the facts they
 * build on and the fact they produce.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type SapperKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** sapper board copy. */
        'sapper': SapperKey;
    }
}
/** Panel id shared by the board launcher and the main-column page. */
export declare const SAPPER_PANEL_ID = "sapper-board";
/** Panel id shared by the vulnerability-library launcher and its page. */
export declare const VULN_PANEL_ID = "sapper-vulns";
/** Required services: the slot registry and dictionaries. */
export declare const inject: string[];
/**
 * Client plugin body: register the dictionaries, the sidebar launcher and the
 * main-column page.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map