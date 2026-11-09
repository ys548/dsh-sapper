/**
 * sapper board, browser half.
 *
 * Contributes two things: the sidebar launcher entry and the main-column page
 * it opens. The page renders the engagement fact graph as an attack map — typed
 * fact nodes colour-coded by kind, intents drawn as edges between the facts they
 * build on and the fact they produce.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { SapperBoard } from './SapperBoard.tsx'
import { SapperPanelIcon } from './SapperPanelIcon.tsx'
import { en, NS, zh, type SapperKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** sapper board copy. */
    'sapper': SapperKey
  }
}

/** Panel id shared by the sidebar entry and the main-column page. */
export const SAPPER_PANEL_ID = 'sapper-board'

/** Required services: the slot registry and dictionaries. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the dictionaries, the sidebar launcher and the
 * main-column page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sapper-board: dictionaries')

  // The launcher row in the global panel list.
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: SAPPER_PANEL_ID,
    order: 40,
    label: () => t('title'),
    locale: NS,
  }, SapperPanelIcon))

  // The page the launcher opens, keyed by the same id.
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: SAPPER_PANEL_ID as MainPanelId,
  }, SapperBoard))
}
