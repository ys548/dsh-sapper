/**
 * Sidebar launcher icon for the audited vulnerability library.
 * @returns the launcher glyph.
 */

import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the library's panel icon: a list of reviewed findings.
 * @param props - host-supplied icon size.
 * @returns the svg glyph.
 */
export function VulnLibraryIcon({ size = 16 }: SidebarPanelIconOwnerProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.7 6.1 H11.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4.7 8.5 H11.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4.7 10.9 H8.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
