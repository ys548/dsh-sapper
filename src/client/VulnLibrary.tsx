/**
 * Vulnerability reports for the current engagement.
 *
 * Opens from the left nav, beside the attack graph. Rows are the written
 * reports: name, short description, rating, and the report file.
 */

import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SapperTarget, VulnReport } from '../types.ts'
import { auditedFindings } from './audit.ts'
import { useSapperGraph } from './useSapperGraph.ts'

const LABEL = 'var(--dsw-alias-label-primary)'
const MUTED = 'var(--dsw-alias-label-secondary)'
const FAINT = 'var(--dsw-alias-label-tertiary)'
const GOLD = 'var(--dsw-static-amber-500)'

const rootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  minHeight: 0,
  minWidth: 0,
  overflow: 'hidden',
  background: 'var(--dsw-alias-bg-base)',
  color: LABEL,
  fontSize: 13,
  fontFamily: 'var(--dsw-font-family), ui-sans-serif, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
}

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 46,
  padding: '0 14px',
  borderBottom: '1px solid var(--dsw-alias-border-l2)',
  background: 'var(--dsw-alias-bg-layer-1)',
  flexShrink: 0,
  minWidth: 0,
}

/**
 * The target a report was written for: the directory sitting above 漏洞报告.
 * @param path - absolute report path.
 * @returns a host or domain, without the 【】 wrapper.
 */
function reportTarget(path: string): string {
  const parts = path.split(/[/\\]/)
  const at = parts.lastIndexOf('漏洞报告')
  const raw = at > 0 ? parts[at - 1] : ''
  return raw.replace(/^【/, '').replace(/】$/, '')
}

/**
 * Reports already written for this engagement.
 * Older servers omit the list; then only audit-passed findings are shown.
 * @param graph - latest graph payload.
 * @returns report rows, rejected findings left out.
 */
/** Hosts and domains named in a goal line. */
function hostsIn(text: string | null | undefined): string[] {
  return [...new Set(text?.match(/(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9][-a-z0-9]*\.[a-z]{2,}/gi) ?? [])]
}

/**
 * One choosable target. Several hosts can share one engagement store.
 */
interface TargetChoice {
  label: string
  cwd: string
}

/**
 * Targets the user can pick: hosts named by each engagement, not the store folder.
 * @param targets - engagements the Host listed.
 * @returns one row per host.
 */
function targetChoices(targets: SapperTarget[]): TargetChoice[] {
  const rows: TargetChoice[] = []
  const seen = new Set<string>()
  for (const target of targets) {
    const hosts = hostsIn(target.goal)
    const folder = target.cwd.replace(/[\\/]\.sapper$/i, '').split(/[/\\]/).filter(Boolean).pop() ?? ''
    const labels = hosts.length > 0 ? hosts : folder === '' ? [] : [folder]
    for (const label of labels) {
      if (seen.has(label)) continue
      seen.add(label)
      rows.push({ label, cwd: target.cwd })
    }
  }
  return rows
}

function reportRows(graph: { facts: Parameters<typeof auditedFindings>[0]; reports?: VulnReport[] } | null): Array<VulnReport & { target: string }> {
  if (!graph) return []
  if (Array.isArray(graph.reports) && graph.reports.length > 0) {
    return graph.reports.map(row => ({ ...row, target: reportTarget(row.path) }))
  }
  return auditedFindings(graph.facts ?? [])
    .filter(row => row.verdict === 'pass')
    .map(row => {
      const fact = graph.facts.find(item => item.id === row.id)
      const data = fact?.data ?? {}
      const host = typeof data.host === 'string' ? data.host : typeof data.ip === 'string' ? data.ip : ''
      const url = typeof data.url === 'string' ? data.url : ''
      return { name: row.title, summary: row.description, level: row.level, path: '', target: host, url }
    })
}

/**
 * The vulnerability report page.
 * @returns the report list for the current engagement.
 */
export function VulnLibrary() {
  const [cwd, setCwd] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const { graph, loading, error, targets } = useSapperGraph(false, cwd)
  const menu = useMemo(() => targetChoices(targets), [targets])
  const rows = useMemo(() => reportRows(graph), [graph])
  const fromReports = useMemo(() => [...new Set(rows.map(row => row.target).filter(name => name !== ''))], [rows])
  const names = fromReports.length > 0 ? fromReports : menu.map(choice => choice.label)
  const active = picked !== null && names.includes(picked) ? picked : ''
  const scoped = active === '' ? rows : rows.filter(row => row.target === active || row.path.includes(active))
  const needle = query.trim().toLowerCase()
  const shown = needle === '' ? scoped : scoped.filter(row => row.name.toLowerCase().includes(needle))

  if (loading && graph === null) {
    return <div style={{ ...rootStyle, padding: 24 }}>正在读取事实图…</div>
  }

  return (
    <div style={rootStyle}>
      <div style={{ ...toolbarStyle, gap: 8, overflow: 'visible', zIndex: 5 }}>
        <strong style={{ fontSize: 14, fontWeight: 650, flexShrink: 0 }}>漏洞报告</strong>
        <span style={{ color: MUTED, fontSize: 12, flexShrink: 0 }}>{shown.length}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <TargetSwitch
          names={names}
          active={active}
          onPick={(name) => {
            if (name === '') {
              setPicked(null)
              return
            }
            setPicked(name)
            const choice = menu.find(item => item.label === name)
            if (choice) setCwd(choice.cwd)
          }}
        />
        <OpenFolderButton directory={reportDirectory(rows, active || fromReports[0] || '')} />
        </div>
      </div>
      {error ? (
        <div style={{ padding: '10px 16px', color: 'var(--dsw-alias-state-error-primary)', fontSize: 12 }}>
          读取事实图失败：{error}
        </div>
      ) : null}
      <div style={{ overflow: 'auto', padding: 16, minHeight: 0 }}>
        {shown.length === 0 ? (
          <div style={{ color: MUTED, fontSize: 13, lineHeight: 1.7 }}>这个目标还没有漏洞报告。</div>
        ) : shown.map(row => (
          <ReportCard
            key={row.path !== '' ? row.path : row.name}
            row={row}
            onOpen={() => { if (row.path !== '') void openReportFile(row.path) }}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Target picker styled like the rest of the app: a short label and a menu.
 * @param props - engagements and the active store.
 * @returns the switcher.
 */
function TargetSwitch({
  names,
  active,
  onPick,
}: {
  names: string[]
  active: string
  onPick: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  if (names.length === 0) return null

  return (
    <div ref={root} style={{ position: 'relative', flexShrink: 1, minWidth: 0, maxWidth: 280 }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="切换目标"
        onClick={() => setOpen(value => !value)}
        title={active || '全部目标'}
        style={{ ...iconBtnStyle, maxWidth: '100%', justifyContent: 'flex-start', gap: 8, padding: '0 12px' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active || '全部目标'}</span>
        <Chevron />
      </button>
      {open ? (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 6,
            minWidth: 180,
            maxWidth: 280,
            padding: 6,
            borderRadius: 10,
            background: 'var(--dsw-alias-bg-layer-3)',
            border: '1px solid var(--dsw-alias-border-l2)',
            boxShadow: '0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent)',
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { onPick(''); setOpen(false) }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              border: 'none',
              borderRadius: 6,
              padding: '8px 10px',
              cursor: 'pointer',
              background: active === '' ? 'var(--dsw-specific-sidebar-nav-item-active)' : 'transparent',
              color: LABEL,
              font: 'inherit',
              fontSize: 13,
            }}
          >
            全部目标
          </button>
          {names.map(name => {
            const on = name === active
            const hot = hover === name
            return (
              <button
                key={name}
                type="button"
                role="menuitem"
                onMouseEnter={() => setHover(name)}
                onMouseLeave={() => setHover(null)}
                onClick={() => {
                  onPick(name)
                  setOpen(false)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 10px',
                  cursor: 'pointer',
                  background: on || hot ? 'var(--dsw-specific-sidebar-nav-item-active)' : 'transparent',
                  color: LABEL,
                  font: 'inherit',
                  fontSize: 13,
                }}
              >
                {name}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Directory that holds one target's written reports.
 * @param rows - reports already loaded.
 * @param target - selected host, or empty for the first report.
 * @returns the 漏洞报告 folder, or empty when no path is known.
 */
function reportDirectory(rows: Array<{ target: string; path: string }>, target: string): string {
  const row = (target === '' ? undefined : rows.find(item => item.target === target && item.path !== ''))
    ?? rows.find(item => item.path !== '')
  if (!row) return ''
  const parts = row.path.split(/[/\\]/)
  const at = parts.lastIndexOf('漏洞报告')
  if (at < 0) return ''
  return parts.slice(0, at + 1).join(row.path.includes('\\') ? '\\' : '/')
}

/** Names the Host uses for the installed-application menu. */
const APP_NAME: Record<string, string> = {
  explorer: '文件资源管理器',
  finder: '访达',
  filemanager: '文件管理器',
  cursor: 'Cursor',
  vscode: 'VS Code',
  vscodeinsiders: 'VS Code Insiders',
  windsurf: 'Windsurf',
  sublimetext: 'Sublime Text',
  intellij: 'IntelliJ IDEA',
  pycharm: 'PyCharm',
  webstorm: 'WebStorm',
  goland: 'GoLand',
  rider: 'Rider',
  androidstudio: 'Android Studio',
}

const CHOICE_KEY = 'dsh.sapper.report-app'

/**
 * Open one report directory with an installed application.
 * @param app - catalog id, such as explorer or cursor.
 * @param directory - absolute folder on this machine.
 */
async function openReportFile(path: string): Promise<void> {
  await fetch('/api/sapper/open-file', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
  })
}

async function launchApp(app: string, directory: string): Promise<void> {
  const response = await fetch('/open-in-app/open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ app, path: directory }),
  })
  if (!response.ok) throw new Error(`open failed: HTTP ${response.status}`)
}

/** Installed-application icon, falling back to the directory glyph. */
function AppIcon({ id }: { id: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <FolderMark />
  return (
    <img
      src={`/open-in-app/icon/${id}`}
      alt=""
      width={16}
      height={16}
      style={{ flex: 'none', objectFit: 'contain' }}
      onError={() => setFailed(true)}
    />
  )
}

/** The same filled folder glyph the app uses for directories, in the file-type amber. */
function FolderMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 28 28" aria-hidden="true" style={{ flex: 'none', color: 'var(--dsw-static-amber-400)' }}>
      <path d="M2.8 10.21c0-.68 0-1.02.05-1.34.14-.82.52-1.57 1.1-2.16.22-.23.5-.43 1.05-.84.29-.21.43-.31.58-.4.39-.22.81-.36 1.25-.41.17-.02.35-.02.71-.02h4.11c.81 0 1.22 0 1.6.1.13.03.26.07.38.12.37.15.7.38 1.37.85l1.26.9c.29.21.43.31.6.38.05.02.1.03.16.05.17.04.35.04.7.04h2.08c2.25 0 3.37 0 4.16.57.26.19.48.41.67.66.57.79.57 1.92.57 4.16v5.85c0 2.25 0 3.37-.57 4.16-.19.26-.41.48-.67.67-.79.57-1.91.57-4.16.57H8.2c-2.25 0-3.37 0-4.16-.57a2.8 2.8 0 0 1-.67-.67C2.8 22.1 2.8 20.98 2.8 18.73V10.21Z" fill="currentColor" />
    </svg>
  )
}

/**
 * The app's split opener: folder launches the default app, the chevron lists the rest.
 * @param props - absolute report directory.
 * @returns the control, or nothing until a directory is known.
 */
function OpenFolderButton({ directory }: { directory: string }) {
  const [apps, setApps] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const [choice, setChoice] = useState(() => localStorage.getItem(CHOICE_KEY) ?? '')
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    void fetch('/open-in-app/apps', { headers: { accept: 'application/json' } })
      .then(async response => response.ok ? await response.json() as { apps?: unknown } : null)
      .then(payload => {
        if (cancelled || !payload || !Array.isArray(payload.apps)) return
        setApps(payload.apps.filter((id): id is string => typeof id === 'string' && APP_NAME[id] !== undefined))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (!open) return undefined
    const close = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  const named = apps.length > 0 ? apps : ['explorer']
  const preferred = named.includes(choice) ? choice : named[0] ?? 'explorer'
  const disabled = directory === ''
  const launch = (app: string): void => {
    if (disabled) return
    setChoice(app)
    localStorage.setItem(CHOICE_KEY, app)
    setOpen(false)
    void launchApp(app, directory)
  }
  const label = APP_NAME[preferred] ?? preferred
  return (
    <div ref={root} style={{ position: 'relative', display: 'inline-flex' }}>
      <div title={`用 ${label} 打开`} style={{
        display: 'inline-flex',
        alignItems: 'stretch',
        height: 24,
        overflow: 'hidden',
        border: '0.5px solid var(--dsw-alias-border-l4)',
        borderRadius: 'var(--dsw-radius-sm, 6px)',
        opacity: disabled ? 0.4 : 1,
      }}>
        <button
          type="button"
          aria-label={`用 ${label} 打开`}
          disabled={disabled}
          onClick={() => launch(preferred)}
          style={splitMainStyle}
        >
          <AppIcon key={preferred} id={preferred} />
        </button>
        <button
          type="button"
          aria-label="更多打开方式"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen(value => !value)}
          style={splitChevronStyle}
        >
          <Chevron />
        </button>
      </div>
      {open ? (
        <div role="menu" style={appMenuStyle}>
          {named.map(id => {
            const name = APP_NAME[id] ?? id
            const on = id === preferred
            return (
              <button
                key={id}
                type="button"
                role="menuitem"
                onMouseEnter={() => setHover(id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => launch(id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 8px',
                  cursor: 'pointer',
                  background: on || hover === id ? 'var(--dsw-specific-sidebar-nav-item-active)' : 'transparent',
                  color: LABEL,
                  font: 'inherit',
                  fontSize: 13,
                }}
              >
                <img src={`/open-in-app/icon/${id}`} alt="" width={16} height={16} style={{ flex: 'none' }} />
                <span>{on ? `${name}（默认）` : name}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

const splitMainStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '3px 5px',
  border: 0,
  background: 'none',
  cursor: 'pointer',
}

const splitChevronStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '3px 4px 3px 3px',
  border: 0,
  borderLeft: '0.5px solid var(--dsw-alias-border-l4)',
  background: 'none',
  color: MUTED,
  cursor: 'pointer',
}

const appMenuStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  right: 0,
  zIndex: 8,
  minWidth: 220,
  padding: 6,
  borderRadius: 10,
  background: 'var(--dsw-alias-bg-layer-3)',
  border: '1px solid var(--dsw-alias-border-l2)',
  boxShadow: '0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent)',
}

const iconBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  height: 32,
  padding: '0 10px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  background: 'var(--dsw-alias-bg-layer-2)',
  color: LABEL,
  cursor: 'pointer',
  font: 'inherit',
}

/**
 * Secondary actions, kept off the bar so the target control stays a short name.
 * @param props - the current search and how many reports are listed.
 * @returns the more button.
 */
function MoreMenu({
  query,
  count,
  onQuery,
}: {
  query: string
  count: number
  onQuery: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <div ref={root} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label="更多" onClick={() => setOpen(value => !value)} style={iconBtnStyle}>
        <span style={{ letterSpacing: 1, fontSize: 16, lineHeight: 1 }}>···</span>
      </button>
      {open ? (
        <div role="menu" style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          zIndex: 6,
          width: 220,
          padding: 10,
          borderRadius: 10,
          background: 'var(--dsw-alias-bg-layer-3)',
          border: '1px solid var(--dsw-alias-border-l2)',
          boxShadow: '0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent)',
        }}>
          <div style={{ color: MUTED, fontSize: 12, marginBottom: 8 }}>{count} 份</div>
          <input
            value={query}
            onChange={event => onQuery(event.target.value)}
            placeholder="搜索名称"
            aria-label="搜索漏洞报告"
            style={{
              width: '100%',
              height: 32,
              boxSizing: 'border-box',
              borderRadius: 8,
              border: '1px solid var(--dsw-alias-border-l2)',
              background: 'var(--dsw-alias-bg-layer-2)',
              color: LABEL,
              padding: '0 10px',
              font: 'inherit',
              fontSize: 13,
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

/** Small chevron matching the app's menu buttons. */
function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flex: 'none', opacity: 0.7 }}>
      <path d="M2.5 4.5 L6 8 L9.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Colour for a report rating.
 * @param level - 严重 / 高危 / 中危 / 低危.
 * @returns a theme colour.
 */
function levelColor(level: string): string {
  if (level === '严重' || level === '高危') return 'var(--dsw-alias-state-error-primary)'
  if (level === '中危') return GOLD
  return FAINT
}

/**
 * One written report.
 * @param props - the report row.
 * @returns the card.
 */
function ReportCard({ row, onOpen }: { row: VulnReport; onOpen: () => void }) {
  return (
    <article
      title={row.path !== '' ? '双击打开报告' : undefined}
      onDoubleClick={onOpen}
      style={{
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 8,
        background: 'var(--dsw-alias-bg-layer-2)',
        cursor: row.path !== '' ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        {row.level !== '' ? (
          <span style={{ color: levelColor(row.level), fontSize: 12, fontWeight: 650, flexShrink: 0 }}>{row.level}</span>
        ) : null}
        <div style={{ fontSize: 14, fontWeight: 650, lineHeight: 1.45 }}>{row.name}</div>
      </div>
      {row.url !== undefined && row.url !== '' ? (
        <div style={{ marginTop: 4, color: MUTED, fontSize: 12, lineHeight: 1.5, wordBreak: 'break-all' }}>{row.url}</div>
      ) : null}
    </article>
  )
}
