/**
 * sapper board, browser half.
 *
 * Contributes the sidebar launchers and the main-column pages they open: the
 * attack map, and the audited vulnerability library.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { SapperBoard } from './SapperBoard.tsx'
import { SapperPanelIcon } from './SapperPanelIcon.tsx'
import { VulnLibrary } from './VulnLibrary.tsx'
import { VulnLibraryIcon } from './VulnLibraryIcon.tsx'
import { en, NS, zh, type SapperKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** sapper board copy. */
    'sapper': SapperKey
  }
}

/** Panel id shared by the board launcher and the main-column page. */
export const SAPPER_PANEL_ID = 'sapper-board'

/** Panel id shared by the vulnerability-library launcher and its page. */
export const VULN_PANEL_ID = 'sapper-vulns'

/** Required services: the slot registry and dictionaries. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the dictionaries, both sidebar launchers and the
 * main-column pages.
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

  // Audited vulnerabilities, directly under the board in the left nav.
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: VULN_PANEL_ID,
    order: 41,
    label: () => t('library.title'),
    locale: NS,
  }, VulnLibraryIcon))

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: VULN_PANEL_ID as MainPanelId,
  }, VulnLibrary))
}
