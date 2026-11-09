/**
 * sapper collaboration board.
 *
 * Facts and intents are both cards. Facts sit on even columns by dependency
 * rank; intents sit on the odd column just after the facts they consume, so an
 * open intent reads as a todo card instead of a label on an edge. Links are
 * solid curves that leave a card horizontally and sweep into the next.
 *
 * The left rail switches between engagement stores. Colors come from the host
 * theme tokens, so light and dark both follow the rest of the app.
 */

import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, WheelEvent as ReactWheelEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FactNode, GraphView, IntentNode, SapperTarget } from '../types.ts'
import { useSapperGraph } from './useSapperGraph.ts'

const CANVAS_BG = 'var(--dsw-alias-bg-base)'
const GRID_DOT = 'var(--dsw-alias-label-caption)'
const CARD_BG = 'var(--dsw-alias-bg-layer-2)'
const CARD_BG_HOVER = 'var(--dsw-alias-bg-layer-3)'
const CARD_BORDER = 'var(--dsw-alias-border-l2)'
const LABEL = 'var(--dsw-alias-label-primary)'
const MUTED = 'var(--dsw-alias-label-secondary)'
const FAINT = 'var(--dsw-alias-label-tertiary)'
const VALUE = 'var(--dsw-static-deepseek-400)'
const GOLD = 'var(--dsw-static-amber-500)'
const TEAL = 'var(--dsw-static-green-400)'
const BLUE = 'var(--dsw-static-deepseek-450)'
const LIVE = 'var(--dsw-static-green-400)'
const EDGE = 'var(--dsw-static-deepseek-400)'

const CARD_W = 214
const CARD_MIN_H = 86
const GAP_X = 148
const GAP_Y = 18
const PAD_X = 48
const PAD_Y = 40
const MAX_PER_COLUMN = 5

type NodeType = 'asset' | 'finding' | 'clue' | 'objective' | 'intent'

const TYPE: Record<NodeType, { label: string; color: string }> = {
  asset: { label: '资产', color: 'var(--dsw-static-deepseek-450)' },
  finding: { label: '成果', color: 'var(--dsw-static-green-400)' },
  clue: { label: '线索', color: 'var(--dsw-static-amber-500)' },
  objective: { label: '目标物', color: 'var(--dsw-static-deepseek-300)' },
  intent: { label: '意图', color: 'var(--dsw-static-deepseek-400)' },
}

const STATUS_LABEL: Record<string, string> = {
  tested: '已验证',
  blocked: '受阻',
  open: '待办',
  claimed: '执行中',
  pending: '待处理',
  done: '已完成',
  abandoned: '已放弃',
  confirmed: '已确认',
}

const STATUS_COLOR: Record<string, string> = {
  tested: TEAL,
  blocked: GOLD,
  open: BLUE,
  claimed: GOLD,
  pending: FAINT,
  done: TEAL,
  abandoned: FAINT,
  confirmed: TEAL,
}

type MenuId = 'stats'

/** Approximate rendered width in em units; CJK counts 1, ASCII 0.55. */
function measure(text: string): number {
  let width = 0
  for (const char of text) width += /[\u3000-\u9fff\uff00-\uffef]/.test(char) ? 1 : 0.55
  return width
}

/**
 * Wrap text by measured width rather than character count.
 * @param value - text to wrap.
 * @param maxUnits - usable width in em units.
 * @param maxLines - hard line cap; the last line is ellipsized when cut.
 * @returns wrapped lines.
 */
function wrap(value: string, maxUnits: number, maxLines: number): string[] {
  const chars = [...value]
  const lines: string[] = []
  let current = ''
  let width = 0
  for (const char of chars) {
    const unit = measure(char)
    if (width + unit > maxUnits && current.length > 0) {
      lines.push(current)
      if (lines.length === maxLines) break
      current = ''
      width = 0
    }
    current += char
    width += unit
  }
  if (lines.length < maxLines && current.length > 0) lines.push(current)
  const consumed = lines.join('').length
  if (consumed < chars.length && lines.length > 0) {
    const last = [...(lines[lines.length - 1] ?? '')]
    while (last.length > 1 && measure(last.join('')) > maxUnits - 1) last.pop()
    lines[lines.length - 1] = `${last.join('')}…`
  }
  return lines.length > 0 ? lines : ['']
}

/**
 * Classify a fact into a board type.
 * @param fact - the fact to classify.
 * @returns its board type.
 */
function factType(fact: FactNode): NodeType {
  /* The project goal is a synthetic fact; render it as its own objective card. */
  if (fact.id === 'goal') return 'objective'
  switch (fact.kind) {
    case 'host':
    case 'service':
    case 'cred':
      return 'asset'
    case 'vuln':
    case 'loot':
      return 'finding'
    case 'flag':
      return 'objective'
    default:
      return 'clue'
  }
}

/** One key-value row inside a card. */
interface Row {
  label: string
  value: string
}

/**
 * Project a fact's structured data onto the rows worth showing.
 * @param fact - the fact whose data is projected.
 * @returns up to three rows.
 */
function factRows(fact: FactNode): Row[] {
  const data = fact.data ?? {}
  const str = (key: string): string | null => {
    const value = data[key]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : null
  }
  const rows: Row[] = []

  const host = str('host') ?? str('ip')
  const port = str('port')
  if (host !== null) rows.push({ label: '地址', value: port !== null ? `${host}:${port}` : host })

  const product = str('product') ?? str('framework')
  if (product !== null) rows.push({ label: '指纹', value: product })

  const cve = str('cve')
  if (cve !== null) rows.push({ label: 'CVE', value: cve })

  const entry = str('entry')
  if (entry !== null && rows.length < 2) rows.push({ label: '入口', value: entry })

  const url = str('url')
  if (url !== null && rows.length < 2) rows.push({ label: '位置', value: url })

  const waf = str('waf')
  if (waf !== null && rows.length < 3) rows.push({ label: '防护', value: waf })

  const org = str('org')
  if (org !== null && rows.length < 2) rows.push({ label: '归属', value: org })

  if (rows.length === 0) {
    const gist = fact.description?.trim() ?? ''
    if (gist !== '') rows.push({ label: '内容', value: gist })
  }
  return rows.slice(0, 3)
}

/** A rendered card, fact or intent. */
interface Card {
  id: string
  kind: 'fact' | 'intent'
  fact?: FactNode
  intent?: IntentNode
  type: NodeType
  badge: string
  titleRows: string[]
  rows: Row[]
  status: string | null
  x: number
  y: number
  height: number
  column: number
  chipY: number
  titleYs: number[]
  rowYs: number[]
  statusY: number | null
}

/** A link between two cards. */
interface Edge {
  from: string
  to: string
  color: string
  dashed: boolean
}

interface Board {
  cards: Card[]
  byId: Map<string, Card>
  edges: Edge[]
  width: number
  height: number
}

const EMPTY_BOARD: Board = { cards: [], byId: new Map(), edges: [], width: 0, height: 0 }

/**
 * Dependency rank per fact: one past the deepest chain producing it.
 * @param facts - graph facts.
 * @param intents - graph intents.
 * @returns rank per fact id.
 */
function factRanks(facts: FactNode[], intents: IntentNode[]): Map<string, number> {
  const known = new Set(facts.map(f => f.id))
  const rank = new Map<string, number>(facts.map(f => [f.id, 0]))
  let changed = true
  let guard = 0
  while (changed && guard++ <= facts.length + 5) {
    changed = false
    for (const intent of intents) {
      if (!intent.to || !known.has(intent.to)) continue
      const deepest = (intent.from ?? []).reduce((max, id) => Math.max(max, rank.get(id) ?? 0), -1)
      if ((rank.get(intent.to) ?? 0) < deepest + 1) {
        rank.set(intent.to, deepest + 1)
        changed = true
      }
    }
  }
  return rank
}

/**
 * Build the board: interleave fact and intent columns by dependency rank.
 * @param facts - graph facts.
 * @param intents - graph intents.
 * @returns the laid-out board.
 */
function buildBoard(facts: FactNode[], intents: IntentNode[]): Board {
  if (facts.length === 0 && intents.length === 0) return EMPTY_BOARD

  const titles = new Map(facts.map(fact => [fact.id, fact.title?.trim() || fact.id]))
  const ranks = factRanks(facts, intents)
  const intentRanks = new Map<string, number>()
  for (const intent of intents) {
    const deepest = (intent.from ?? []).reduce((max, id) => Math.max(max, ranks.get(id) ?? 0), 0)
    intentRanks.set(intent.id, deepest)
  }

  const slotMap = new Map<number, { facts: FactNode[]; intents: IntentNode[] }>()
  const slotOf = (index: number) => {
    const existing = slotMap.get(index)
    if (existing) return existing
    const created = { facts: [] as FactNode[], intents: [] as IntentNode[] }
    slotMap.set(index, created)
    return created
  }
  for (const fact of facts) slotOf((ranks.get(fact.id) ?? 0) * 2).facts.push(fact)
  for (const intent of intents) slotOf((intentRanks.get(intent.id) ?? 0) * 2 + 1).intents.push(intent)

  interface Column { facts: FactNode[]; intents: IntentNode[] }
  const columns: Column[] = []
  for (const index of [...slotMap.keys()].sort((a, b) => a - b)) {
    const slot = slotMap.get(index) ?? { facts: [], intents: [] }
    const items: Array<{ kind: 'fact'; value: FactNode } | { kind: 'intent'; value: IntentNode }> = [
      ...slot.facts
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
        .map(value => ({ kind: 'fact' as const, value })),
      ...slot.intents
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
        .map(value => ({ kind: 'intent' as const, value })),
    ]
    for (let start = 0; start < items.length; start += MAX_PER_COLUMN) {
      const chunk = items.slice(start, start + MAX_PER_COLUMN)
      columns.push({
        facts: chunk.filter(item => item.kind === 'fact').map(item => item.value as FactNode),
        intents: chunk.filter(item => item.kind === 'intent').map(item => item.value as IntentNode),
      })
    }
  }

  const cards: Card[] = []
  const byId = new Map<string, Card>()
  const columnHeights: number[] = []
  const titleUnits = (CARD_W - 28) / 12.5
  const rowUnits = (CARD_W - 64) / 10.5

  columns.forEach((column, columnIndex) => {
    let y = PAD_Y
    const entries = [
      ...column.facts.map(fact => ({ kind: 'fact' as const, fact })),
      ...column.intents.map(intent => ({ kind: 'intent' as const, intent })),
    ]
    for (const entry of entries) {
      let type: NodeType
      let badge: string
      let titleSource: string
      let rows: Row[]
      let status: string | null

      if (entry.kind === 'fact') {
        const fact = entry.fact
        type = factType(fact)
        badge = TYPE[type].label
        titleSource = fact.title?.trim() || fact.description?.trim() || fact.id
        rows = factRows(fact)
        status = typeof fact.data?.status === 'string' ? fact.data.status : null
      } else {
        const intent = entry.intent
        type = 'intent'
        const open = intent.to === null || intent.to === undefined
        badge = TYPE.intent.label
        titleSource = intent.title?.trim() || intent.description?.trim() || intent.id
        const from = intent.from ?? []
        rows = [{
          label: '来源',
          value: from.length > 0 ? from.map(id => titles.get(id) ?? id).join('、') : '—',
        }]
        if (intent.worker) rows.push({ label: '执行', value: intent.worker })
        status = intent.status ?? (open ? 'open' : 'done')
      }

      const titleRows = wrap(titleSource, titleUnits, 2)
      const displayRows = rows.map(row => ({ label: row.label, value: wrap(row.value, rowUnits, 1)[0] ?? '' }))

      let cursor = 20
      const chipY = cursor
      cursor += 16
      const titleYs = titleRows.map((_, index) => cursor + index * 17)
      cursor += titleRows.length * 17 + 8
      const rowYs = displayRows.map((_, index) => cursor + index * 15)
      cursor += displayRows.length * 15
      const statusY = status !== null ? cursor + 14 : null
      const height = Math.max(CARD_MIN_H, (statusY ?? cursor) + 12)

      const card: Card = {
        id: entry.kind === 'fact' ? entry.fact.id : entry.intent.id,
        kind: entry.kind,
        ...(entry.kind === 'fact' ? { fact: entry.fact } : { intent: entry.intent }),
        type,
        badge,
        titleRows,
        rows: displayRows,
        status,
        x: PAD_X + columnIndex * (CARD_W + GAP_X),
        y,
        height,
        column: columnIndex,
        chipY,
        titleYs,
        rowYs,
        statusY,
      }
      cards.push(card)
      byId.set(card.id, card)
      y += height + GAP_Y
    }
    columnHeights.push(y)
  })

  const edges: Edge[] = []
  for (const intent of intents) {
    if (!byId.has(intent.id)) continue
    const open = intent.to === null || intent.to === undefined
    for (const fromId of intent.from ?? []) {
      if (!byId.has(fromId)) continue
      edges.push({ from: fromId, to: intent.id, color: EDGE, dashed: open })
    }
    if (intent.to && byId.has(intent.to)) {
      edges.push({ from: intent.id, to: intent.to, color: EDGE, dashed: false })
    }
  }

  const tallest = Math.max(1, ...columnHeights)
  const height = Math.max(460, tallest + 24)
  const width = PAD_X * 2 + Math.max(0, columns.length - 1) * (CARD_W + GAP_X) + CARD_W
  return { cards, byId, edges, width, height }
}

interface Tally {
  asset: number
  finding: number
  cred: number
  clue: number
  objective: number
  intent: number
  open: number
  done: number
}

function tallyOf(facts: FactNode[], intents: IntentNode[]): Tally {
  const tally: Tally = { asset: 0, finding: 0, cred: 0, clue: 0, objective: 0, intent: intents.length, open: 0, done: 0 }
  for (const fact of facts) {
    switch (fact.kind) {
      case 'host':
      case 'service':
        tally.asset += 1
        break
      case 'cred':
        tally.cred += 1
        break
      case 'vuln':
      case 'loot':
        tally.finding += 1
        break
      case 'flag':
        tally.objective += 1
        break
      default:
        tally.clue += 1
    }
  }
  for (const intent of intents) {
    if (intent.status === 'done') tally.done += 1
    else tally.open += 1
  }
  return tally
}

function downloadGraph(graph: GraphView): void {
  const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'sapper-graph.json'
  link.click()
  URL.revokeObjectURL(url)
}

const rootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  minHeight: 0,
  minWidth: 0,
  overflow: 'hidden',
  background: CANVAS_BG,
  color: LABEL,
  fontSize: 13,
  fontFamily: 'var(--dsw-font-family), ui-sans-serif, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
}

const toolbarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  height: 46,
  padding: '0 14px',
  borderBottom: '1px solid var(--dsw-alias-border-l2)',
  background: 'var(--dsw-alias-bg-layer-1)',
  flexShrink: 0,
  minWidth: 0,
  overflow: 'hidden',
  position: 'relative',
  zIndex: 4,
}

const textBtnStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: LABEL,
  fontSize: 13,
  lineHeight: 1,
  padding: '6px 8px',
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
}

const menuStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  zIndex: 6,
  minWidth: 220,
  maxWidth: 360,
  maxHeight: 280,
  overflow: 'auto',
  padding: 6,
  borderRadius: 10,
  background: 'var(--dsw-alias-bg-layer-3)',
  border: '1px solid var(--dsw-alias-border-l2)',
  boxShadow: '0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent)',
}

const floatStyle: CSSProperties = {
  position: 'absolute',
  top: 14,
  right: 14,
  width: 292,
  borderRadius: 12,
  background: 'var(--dsw-alias-bg-layer-2)',
  border: '1px solid var(--dsw-alias-border-l2)',
  boxShadow: '0 12px 40px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent)',
  zIndex: 3,
  overflow: 'hidden',
}

/**
 * The collaboration board.
 * @returns the board UI.
 */
export function SapperBoard() {
  const [paused, setPaused] = useState(false)
  const [cwd, setCwd] = useState<string | null>(null)
  const { graph, loading, error, targets, store } = useSapperGraph(paused, cwd)
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [assetsOnly, setAssetsOnly] = useState(false)
  const [menu, setMenu] = useState<MenuId | null>(null)
  const [agentsOpen, setAgentsOpen] = useState(true)
  const [view, setView] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)

  const viewGraph = useMemo(() => {
    if (!graph) return null
    if (!assetsOnly) return graph
    const facts = graph.facts.filter(fact => factType(fact) === 'asset')
    const ids = new Set(facts.map(fact => fact.id))
    const intents = graph.intents.filter(intent =>
      (intent.from ?? []).some(id => ids.has(id)) || (intent.to !== undefined && ids.has(intent.to)))
    return { ...graph, facts, intents }
  }, [graph, assetsOnly])

  const board = useMemo(
    () => (viewGraph ? buildBoard(viewGraph.facts, viewGraph.intents) : EMPTY_BOARD),
    [viewGraph],
  )

  const tally = useMemo(
    () => tallyOf(viewGraph?.facts ?? [], viewGraph?.intents ?? []),
    [viewGraph],
  )

  useEffect(() => {
    if (selected !== null && !board.byId.has(selected)) setSelected(null)
  }, [board, selected])

  useEffect(() => {
    if (board.width > 0 && board.height > 0) setView({ x: 0, y: 0, w: board.width, h: board.height })
  }, [board.width, board.height])

  useEffect(() => {
    if (menu === null) return undefined
    const close = (event: PointerEvent): void => {
      if (!barRef.current?.contains(event.target as Node)) setMenu(null)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])

  const box = view ?? { x: 0, y: 0, w: Math.max(board.width, 800), h: Math.max(board.height, 500) }

  const fit = useCallback(() => {
    if (board.width > 0 && board.height > 0) setView({ x: 0, y: 0, w: board.width, h: board.height })
  }, [board.width, board.height])

  const frameSelection = useCallback(() => {
    if (selected === null) {
      fit()
      return
    }
    const card = board.byId.get(selected)
    if (!card) {
      fit()
      return
    }
    const pad = 80
    setView({ x: card.x - pad, y: card.y - pad, w: CARD_W + pad * 2, h: card.height + pad * 2 })
  }, [board.byId, fit, selected])

  const connected = useMemo(() => {
    if (hovered === null) return null
    const ids = new Set<string>([hovered])
    for (const edge of board.edges) {
      if (edge.from === hovered) ids.add(edge.to)
      if (edge.to === hovered) ids.add(edge.from)
    }
    return ids
  }, [board.edges, hovered])

  const onPointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest('[data-card]')) return
    setSelected(null)
    drag.current = { x: event.clientX, y: event.clientY }
  }, [])

  const onPointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    const start = drag.current
    const svg = svgRef.current
    if (!start || !svg) return
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const dx = ((event.clientX - start.x) / rect.width) * box.w
    const dy = ((event.clientY - start.y) / rect.height) * box.h
    setView({ x: box.x - dx, y: box.y - dy, w: box.w, h: box.h })
    drag.current = { x: event.clientX, y: event.clientY }
  }, [box])

  const onPointerUp = useCallback(() => { drag.current = null }, [])

  const onWheel = useCallback((event: ReactWheelEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    event.preventDefault()
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const fx = (event.clientX - rect.left) / rect.width
    const fy = (event.clientY - rect.top) / rect.height
    const factor = event.deltaY > 0 ? 1.12 : 0.9
    const w = box.w * factor
    const h = box.h * factor
    setView({ x: box.x + (box.w - w) * fx, y: box.y + (box.h - h) * fy, w, h })
  }, [box])

  const toggleMenu = (id: MenuId): void => { setMenu(current => current === id ? null : id) }
  const running = (graph?.intents ?? []).filter(intent => intent.worker && intent.status !== 'done' && intent.status !== 'abandoned')
  const link = paused ? 'paused' : error ? 'down' : 'live'
  const selectedCard = selected !== null ? board.byId.get(selected) : undefined
  const filteredEmpty = graph !== null && graph.facts.length + graph.intents.length > 0 && board.cards.length === 0

  if (loading && graph === null) {
    return <div style={{ ...rootStyle, padding: 24 }}>正在读取事实图…</div>
  }

  return (
    <div style={rootStyle}>
      <div ref={barRef} style={toolbarStyle}>
        <strong style={{ fontSize: 14, fontWeight: 650, marginRight: 8, flexShrink: 0 }}>协作画板</strong>

        <button
          type="button"
          aria-pressed={assetsOnly}
          onClick={() => setAssetsOnly(value => !value)}
          style={{
            ...textBtnStyle,
            ...(assetsOnly ? { color: TEAL, background: 'color-mix(in srgb, var(--dsw-static-green-400) 16%, transparent)' } : {}),
          }}
        >
          资产
        </button>
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused(value => !value)}
          style={{ ...textBtnStyle, ...(paused ? { color: GOLD } : {}) }}
        >
          {paused ? '继续' : '暂停'}
        </button>
        <button
          type="button"
          style={{ ...textBtnStyle, ...(graph ? {} : { opacity: 0.4, cursor: 'default' }) }}
          onClick={() => { if (graph) downloadGraph(graph) }}
        >
          导出
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flexShrink: 1 }}>
          <div style={{ position: 'relative', minWidth: 0, flexShrink: 1 }}>
            <button
              type="button"
              onClick={() => toggleMenu('stats')}
              aria-expanded={menu === 'stats'}
              style={{ ...textBtnStyle, color: MUTED, fontSize: 12, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              资产 {tally.asset} / 意图 {tally.intent} / 成果 {tally.finding} / 凭据 {tally.cred}
              <span style={{ color: MUTED, marginLeft: 8 }}>▸ 统计详情</span>
            </button>
            {menu === 'stats' ? (
              <div style={{ ...menuStyle, right: 0, left: 'auto', minWidth: 200 }}>
                <StatRow label="资产" value={tally.asset} />
                <StatRow label="意图" value={tally.intent} />
                <StatRow label="成果" value={tally.finding} />
                <StatRow label="凭据" value={tally.cred} />
                <StatRow label="线索" value={tally.clue} />
                <StatRow label="目标物" value={tally.objective} />
                <StatRow label="进行中" value={tally.open} />
                <StatRow label="已完成" value={tally.done} />
              </div>
            ) : null}
          </div>
          <LivePill link={link} />
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex' }}>
        {targets.length > 0 ? (
          <TargetRail
            targets={targets}
            active={cwd ?? store}
            onPick={(next) => {
              setCwd(next)
              setSelected(null)
            }}
          />
        ) : null}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {error && graph === null ? (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <strong style={{ color: 'var(--dsw-alias-state-error-primary)' }}>读取事实图失败</strong>
              <span style={{ color: MUTED }}>{error}</span>
            </div>
          ) : null}

          {graph !== null && graph.facts.length === 0 && graph.intents.length === 0 ? (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <strong>这个目标还没有事实图</strong>
              <span style={{ color: MUTED }}>让指挥官先用 sapper_fact 记下第一条已确认的观察，这里就会长出节点。</span>
            </div>
          ) : null}

          {graph !== null && (graph.facts.length > 0 || graph.intents.length > 0) ? (
            <div style={{ flex: 1, minHeight: 0, minWidth: 0, position: 'relative', overflow: 'hidden', background: CANVAS_BG }}>
              <svg
                ref={svgRef}
                viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
                width="100%"
                height="100%"
                style={{ display: 'block', cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none' }}
                role="img"
                aria-label="协作画板"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                onWheel={onWheel}
              >
                <defs>
                  <pattern id="sb-grid" width="18" height="18" patternUnits="userSpaceOnUse">
                    <circle cx="1" cy="1" r="0.9" fill={GRID_DOT} fillOpacity={0.45} />
                  </pattern>
                </defs>
                <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={CANVAS_BG} />
                <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="url(#sb-grid)" />

                {board.edges.map((edge, index) => {
                  const source = board.byId.get(edge.from)
                  const target = board.byId.get(edge.to)
                  if (!source || !target) return null
                  const dim = connected !== null && !(edge.from === hovered || edge.to === hovered)
                  const x1 = source.x + CARD_W
                  const y1 = source.y + source.height / 2
                  const x2 = target.x
                  const y2 = target.y + target.height / 2
                  const dx = x2 - x1
                  const dy = y2 - y1
                  const span = Math.max(Math.abs(dx), 1)
                  const dir = Math.sign(dx) || 1
                  const handle = span * 0.5
                  const side = dy === 0 ? 1 : Math.sign(dy)
                  const sag = Math.max(span * 0.7, Math.abs(dy) * 0.55)
                  return (
                    <path
                      key={`edge-${edge.from}-${edge.to}-${index}`}
                      d={`M${x1},${y1} C${x1 + dir * handle},${y1 + side * sag} ${x2 - dir * handle},${y2 + side * sag * 0.35} ${x2},${y2}`}
                      fill="none"
                      stroke={edge.color}
                      strokeOpacity={dim ? 0.06 : 0.92}
                      strokeWidth={1.6}
                      strokeLinecap="round"
                    />
                  )
                })}

                {board.cards.map((card, index) => {
                  const accent = TYPE[card.type].color
                  const dim = connected !== null && !connected.has(card.id)
                  const isHover = hovered === card.id
                  const isSelected = selected === card.id
                  return (
                    <g
                      key={card.id}
                      data-card
                      opacity={dim ? 0.2 : 1}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelected(card.id)}
                      onMouseEnter={() => setHovered(card.id)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <title>{`${card.fact?.title ?? card.intent?.title ?? card.id}\n${card.fact?.description ?? card.intent?.description ?? ''}`}</title>
                      <clipPath id={`sb-clip-${index}`} clipPathUnits="userSpaceOnUse">
                        <rect x={card.x} y={card.y} width={CARD_W} height={card.height} rx={8} />
                      </clipPath>
                      <g clipPath={`url(#sb-clip-${index})`}>
                        <rect x={card.x} y={card.y} width={CARD_W} height={card.height} fill={isHover ? CARD_BG_HOVER : CARD_BG} />
                        <rect x={card.x} y={card.y} width={3} height={card.height} fill={accent} />
                      </g>
                      <rect
                        x={card.x}
                        y={card.y}
                        width={CARD_W}
                        height={card.height}
                        rx={8}
                        fill="none"
                        stroke={isSelected ? BLUE : isHover ? 'var(--dsw-alias-border-l4)' : CARD_BORDER}
                        strokeWidth={isSelected ? 1.6 : 1}
                      />
                      <g transform={`translate(${card.x},${card.y})`}>
                        <text x={14} y={card.chipY} fill={accent} fontSize={10} fontWeight={700} letterSpacing={0.6}>
                          {card.badge}
                        </text>
                        <text x={CARD_W - 12} y={card.chipY} textAnchor="end" fill={FAINT} fontSize={10}>
                          {card.id}
                        </text>
                        {card.titleRows.map((row, rowIndex) => (
                          <text key={rowIndex} x={14} y={card.titleYs[rowIndex] ?? 0} fill={LABEL} fontSize={12.5} fontWeight={600}>
                            {row}
                          </text>
                        ))}
                        {card.rows.map((row, rowIndex) => (
                          <g key={rowIndex} transform={`translate(0,${card.rowYs[rowIndex] ?? 0})`}>
                            <text x={14} y={0} fill={FAINT} fontSize={10}>{row.label}</text>
                            <text x={48} y={0} fill={VALUE} fontSize={11} fontFamily="var(--ds-font-family-code), ui-monospace, Menlo, Consolas, monospace">
                              {row.value}
                            </text>
                          </g>
                        ))}
                        {card.status !== null && card.statusY !== null ? (
                          <text
                            x={CARD_W - 12}
                            y={card.statusY}
                            textAnchor="end"
                            fill={STATUS_COLOR[card.status] ?? MUTED}
                            fontSize={10}
                          >
                            {STATUS_LABEL[card.status] ?? card.status}
                          </text>
                        ) : null}
                      </g>
                    </g>
                  )
                })}
              </svg>

              {filteredEmpty ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, pointerEvents: 'none' }}>
                  当前筛选下没有节点
                </div>
              ) : null}

              <AgentPanel
                open={agentsOpen}
                onToggle={() => setAgentsOpen(value => !value)}
                running={running}
                selected={selectedCard}
                onSelect={(id) => {
                  setAssetsOnly(false)
                  setSelected(id)
                }}
                onBack={() => setSelected(null)}
              />

              <ZoomStack
                onZoomIn={() => setView({ x: box.x + box.w * 0.08, y: box.y + box.h * 0.08, w: box.w * 0.84, h: box.h * 0.84 })}
                onZoomOut={() => setView({ x: box.x - box.w * 0.08, y: box.y - box.h * 0.08, w: box.w * 1.16, h: box.h * 1.16 })}
                onReset={fit}
                onFrame={frameSelection}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function TargetRail({
  targets,
  active,
  onPick,
}: {
  targets: SapperTarget[]
  active: string | null
  onPick: (cwd: string) => void
}) {
  return (
    <aside style={{
      width: 220,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      borderRight: '1px solid var(--dsw-alias-border-l2)',
      background: 'var(--dsw-specific-sidebar-fill)',
    }}>
      <div style={{ padding: '12px 14px 8px', color: FAINT, fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>目标</div>
      <div style={{ overflow: 'auto', padding: '0 8px 12px' }}>
        {targets.map((target) => {
          const on = target.cwd === active
          const title = target.goal?.trim() || target.cwd.split(/[/\\]/).filter(Boolean).pop() || target.cwd
          return (
            <button
              key={target.cwd}
              type="button"
              aria-pressed={on}
              title={target.cwd}
              onClick={() => onPick(target.cwd)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: on ? '1px solid var(--dsw-static-deepseek-450)' : '1px solid transparent',
                borderRadius: 8,
                padding: '8px 10px',
                marginBottom: 4,
                cursor: 'pointer',
                background: on ? 'var(--dsw-specific-sidebar-nav-item-active)' : 'transparent',
                color: LABEL,
                fontFamily: 'inherit',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: on ? 650 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
              <div style={{ marginTop: 2, color: FAINT, fontSize: 11 }}>{target.facts} 事实 · {target.intents} 意图</div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function LivePill({ link }: { link: 'live' | 'paused' | 'down' }) {
  const color = link === 'down' ? 'var(--dsw-alias-state-error-primary)' : link === 'paused' ? GOLD : LIVE
  const text = link === 'down' ? '通道中断' : link === 'paused' ? '轮询已暂停' : '实时通道已连接'
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      flexShrink: 0,
      padding: '4px 12px',
      borderRadius: 999,
      border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
      background: `color-mix(in srgb, ${color} 12%, transparent)`,
      color,
      fontSize: 12,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: color }} />
      {text}
    </span>
  )
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, padding: '5px 8px', fontSize: 12 }}>
      <span style={{ color: MUTED }}>{label}</span>
      <span style={{ color: VALUE, fontFamily: 'var(--ds-font-family-code), ui-monospace, Menlo, Consolas, monospace' }}>{value}</span>
    </div>
  )
}

function AgentPanel({
  open,
  onToggle,
  running,
  selected,
  onSelect,
  onBack,
}: {
  open: boolean
  onToggle: () => void
  running: IntentNode[]
  selected: Card | undefined
  onSelect: (id: string) => void
  onBack: () => void
}) {
  return (
    <aside style={floatStyle} onWheel={event => event.stopPropagation()}>
      {selected !== undefined ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--dsw-alias-border-l2)' }}>
            <button type="button" onClick={onBack} style={{ ...textBtnStyle, padding: '2px 6px', color: MUTED }}>←</button>
            <strong style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.fact?.title ?? selected.intent?.title ?? selected.id}
            </strong>
          </div>
          <div style={{ maxHeight: 'min(68vh, 560px)', overflow: 'auto', padding: '12px 14px', overscrollBehavior: 'contain' }}>
            <div style={{ color: TYPE[selected.type].color, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>
              {TYPE[selected.type].label} · {selected.id}
            </div>
            {selected.kind === 'fact' && selected.fact ? (
              <>
                <Field label="要点">{selected.fact.description ?? ''}</Field>
                {selected.fact.data && Object.keys(selected.fact.data).length > 0 ? (
                  <Field label="结构化数据" mono>
                    {Object.entries(selected.fact.data).map(([key, value]) => `${key} = ${String(value)}`).join('\n')}
                  </Field>
                ) : null}
                {selected.fact.doc ? <Field label="证据文档" mono>{selected.fact.doc}</Field> : null}
                <Field label="记录">{`${selected.fact.created_at ?? ''} · ${selected.fact.creator ?? ''}`}</Field>
              </>
            ) : null}
            {selected.kind === 'intent' && selected.intent ? (
              <>
                <Field label="要点">{selected.intent.description ?? ''}</Field>
                <Field label="出发事实" mono>{(selected.intent.from ?? []).join(', ') || '—'}</Field>
                <Field label="产出事实" mono>{selected.intent.to ?? '（尚未产出 · 待办）'}</Field>
                <Field label="执行车道">{selected.intent.worker ?? '未认领'}</Field>
                {selected.intent.requires_confirmation ? (
                  <Field label="需确认">{selected.intent.confirmed_at ? `已确认 ${selected.intent.confirmed_at}` : '待确认'}</Field>
                ) : null}
                {selected.intent.doc ? <Field label="作战手册" mono>{selected.intent.doc}</Field> : null}
              </>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px' }}>
            <strong style={{ fontSize: 13 }}>运行中的智能体</strong>
            <span style={{
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              borderRadius: 99,
              background: BLUE,
              color: 'var(--dsw-alias-label-primary-foreground)',
              fontSize: 11,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {running.length}
            </span>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              style={{ ...textBtnStyle, marginLeft: 'auto', padding: '2px 4px', color: MUTED }}
            >
              {open ? '▾' : '▸'}
            </button>
          </div>
          {open ? (
            <div style={{ maxHeight: 320, overflow: 'auto', padding: running.length === 0 ? '0 14px 14px' : '0 10px 10px', overscrollBehavior: 'contain' }}>
              {running.length === 0 ? (
                <div style={{ color: MUTED, fontSize: 12, lineHeight: 1.7 }}>
                  暂无运行中的智能体 —— claim 活跃时会出现在这里。
                </div>
              ) : running.map(intent => (
                <button
                  key={intent.id}
                  type="button"
                  onClick={() => onSelect(intent.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    border: '1px solid var(--dsw-alias-border-l2)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    marginBottom: 6,
                    cursor: 'pointer',
                    background: 'var(--dsw-alias-bg-layer-1)',
                    color: LABEL,
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ color: BLUE, fontSize: 11, fontWeight: 700 }}>● {intent.worker}</span>
                    <span style={{ marginLeft: 'auto', color: FAINT, fontSize: 10 }}>{intent.id}</span>
                  </div>
                  <div style={{ fontSize: 12 }}>{intent.title ?? ''}</div>
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </aside>
  )
}

function ZoomStack({
  onZoomIn,
  onZoomOut,
  onReset,
  onFrame,
}: {
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  onFrame: () => void
}) {
  const buttons: Array<{ label: string; onClick: () => void; icon: ReactNode }> = [
    { label: '放大', onClick: onZoomIn, icon: <path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /> },
    { label: '缩小', onClick: onZoomOut, icon: <path d="M3.2 8h9.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /> },
    { label: '重置视图', onClick: onReset, icon: <><path d="M12.2 6.2A4.6 4.6 0 1 0 12.6 10" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" /><path d="M12.2 3.2v3.2H9" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></> },
    { label: '定位选中', onClick: onFrame, icon: <><rect x="3.2" y="3.2" width="9.6" height="9.6" rx="1.4" stroke="currentColor" strokeWidth="1.3" fill="none" /><rect x="6" y="6" width="4" height="4" rx="0.6" stroke="currentColor" strokeWidth="1.1" fill="none" /></> },
  ]
  return (
    <div style={{ position: 'absolute', right: 16, bottom: 16, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 3 }}>
      {buttons.map(button => (
        <button
          key={button.label}
          type="button"
          title={button.label}
          aria-label={button.label}
          onClick={button.onClick}
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            border: '1px solid var(--dsw-alias-border-l2)',
            background: 'var(--dsw-alias-bg-layer-2)',
            color: LABEL,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">{button.icon}</svg>
        </button>
      ))}
    </div>
  )
}

/**
 * One labelled block in the detail panel.
 * @param props - label, body, and whether to render monospace.
 * @returns the block.
 */
function Field({ label, children, mono = false }: { label: string; children: string; mono?: boolean }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ color: FAINT, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 4 }}>{label}</div>
      <pre style={{
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontSize: mono ? 11 : 12.5,
        fontFamily: mono ? 'var(--ds-font-family-code), ui-monospace, Menlo, Consolas, monospace' : 'inherit',
        color: label === '要点' ? LABEL : MUTED,
        lineHeight: 1.6,
      }}>
        {children}
      </pre>
    </div>
  )
}
