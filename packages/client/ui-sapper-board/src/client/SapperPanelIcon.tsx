/**
 * Sidebar launcher icon for the sapper board: one confirmed fact feeding an
 * open intent, with a flag node at the end of the chain.
 * @returns the launcher glyph.
 */

import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the board's panel icon.
 * @param props - host-supplied icon size.
 * @returns the svg glyph.
 */
export function SapperPanelIcon({ size = 16 }: SidebarPanelIconOwnerProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4.5 L8 8 L12 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.55" />
      <path d="M8 8 L8 11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.55" />
      <circle cx="4" cy="4" r="1.7" fill="currentColor" />
      <circle cx="12" cy="4" r="1.7" fill="currentColor" opacity="0.6" />
      <circle cx="8" cy="11.8" r="2" fill="currentColor" />
    </svg>
  )
}
