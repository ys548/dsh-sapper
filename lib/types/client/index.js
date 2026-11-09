/**
 * sapper board, browser half.
 *
 * Contributes two things: the sidebar launcher entry and the main-column page
 * it opens. The page renders the engagement fact graph as an attack map — typed
 * fact nodes colour-coded by kind, intents drawn as edges between the facts they
 * build on and the fact they produce.
 */
import { SapperBoard } from "./SapperBoard.js";
import { SapperPanelIcon } from "./SapperPanelIcon.js";
import { en, NS, zh } from "./locales.js";
/** Panel id shared by the sidebar entry and the main-column page. */
export const SAPPER_PANEL_ID = 'sapper-board';
/** Required services: the slot registry and dictionaries. */
export const inject = ['slots', 'locale'];
/**
 * Client plugin body: register the dictionaries, the sidebar launcher and the
 * main-column page.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    const t = ctx.locale.bind(NS);
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sapper-board: dictionaries');
    // The launcher row in the global panel list.
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: SAPPER_PANEL_ID,
        order: 40,
        label: () => t('title'),
        locale: NS,
    }, SapperPanelIcon));
    // The page the launcher opens, keyed by the same id.
    ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: SAPPER_PANEL_ID,
    }, SapperBoard));
}
//# sourceMappingURL=index.js.map