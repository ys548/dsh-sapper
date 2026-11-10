/**
 * sapper collaboration board.
 *
 * The board is a left-to-right flow: 起点 on the left, the clues a task reads,
 * then the task and what it produced, merging into 目标 on the right.
 * Edges for work that is still running carry a dash that travels toward 目标.
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
  complete: '已收口',
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
  complete: TEAL,
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
  /** True when no intent reads or produces this card, so the flow has no edge for it. */
  loose: boolean
}

/** A link between two cards. */
interface Edge {
  from: string
  to: string
  color: string
  dashed: boolean
  /** 0 stays in the gutter. Kept so older callers stay shape-compatible. */
  lane: number
  laneY: number
  /** Attachment y on the source card. */
  y1: number
  /** Attachment y on the target card. */
  y2: number
  /** Work is still running; the stroke travels toward 目标. */
  live: boolean
  /** Short relation drawn on the curve, such as 推导 or 产出. */
  label: string
}

interface Board {
  cards: Card[]
  byId: Map<string, Card>
  edges: Edge[]
  width: number
  height: number
  /** Initial view covers the dependency chain; loose notes sit below this y. */
  focusHeight: number
}

const EMPTY_BOARD: Board = { cards: [], byId: new Map(), edges: [], width: 0, height: 0, focusHeight: 0 }

const START_ID = '__start__'
const TARGET_ID = '__target__'
const TREE_GAP = 36

function compareId(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true })
}

function isLiveIntent(intent: IntentNode): boolean {
  const status = intent.status ?? (intent.to === null || intent.to === undefined ? 'open' : 'done')
  return status === 'claimed' || status === 'open' || status === 'pending'
}

/** An agent is running only while its intent is claimed, open, or pending. */
function isRunningIntent(intent: IntentNode): boolean {
  return (intent.worker?.trim() ?? '') !== '' && isLiveIntent(intent)
}

/** Text the board search matches against. */
function cardHaystack(card: Card): string {
  return [
    card.id,
    card.badge,
    card.status ?? '',
    ...card.titleRows,
    ...card.rows.flatMap(row => [row.label, row.value]),
    card.fact?.title ?? '',
    card.fact?.description ?? '',
    card.fact?.kind ?? '',
    card.intent?.title ?? '',
    card.intent?.description ?? '',
    card.intent?.worker ?? '',
    ...(card.intent?.from ?? []),
    card.intent?.to ?? '',
  ].join('\n').toLowerCase()
}

/** Curve from the right edge of one card into the left edge of the next. */
function linkPath(source: Card, target: Card, edge: Edge): string {
  const x1 = source.x + CARD_W
  const y1 = edge.y1
  const x2 = target.x
  const y2 = edge.y2
  const span = Math.max(x2 - x1, 32)
  const handle = Math.min(Math.max(span * 0.42, 48), 140)
  return `M${x1},${y1} C${x1 + handle},${y1} ${x2 - handle},${y2} ${x2},${y2}`
}

/**
 * Build the board as a flow from 起点 to 目标.
 * @param facts - graph facts.
 * @param intents - graph intents.
 * @returns the laid-out board.
 */
function buildBoard(facts: FactNode[], intents: IntentNode[]): Board {
  if (facts.length === 0 && intents.length === 0) return EMPTY_BOARD

  const titles = new Map(facts.map(fact => [fact.id, fact.title?.trim() || fact.id]))
  const titleUnits = (CARD_W - 28) / 12.5
  const rowUnits = (CARD_W - 64) / 10.5
  const cards: Card[] = []
  const byId = new Map<string, Card>()

  const present = (
    id: string,
    kind: 'fact' | 'intent',
    type: NodeType,
    badge: string,
    titleSource: string,
    rows: Row[],
    status: string | null,
    fact?: FactNode,
    intent?: IntentNode,
  ): Card => {
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
      id,
      kind,
      ...(fact ? { fact } : {}),
      ...(intent ? { intent } : {}),
      type,
      badge,
      titleRows,
      rows: displayRows,
      status,
      x: 0,
      y: 0,
      height,
      column: 0,
      chipY,
      titleYs,
      rowYs,
      statusY,
      loose: false,
    }
    cards.push(card)
    byId.set(card.id, card)
    return card
  }

  for (const fact of facts) {
    if (fact.id === 'goal') continue
    const type = factType(fact)
    present(
      fact.id,
      'fact',
      type,
      TYPE[type].label,
      fact.title?.trim() || fact.description?.trim() || fact.id,
      factRows(fact),
      typeof fact.data?.status === 'string' ? fact.data.status : null,
      fact,
    )
  }
  for (const intent of intents) {
    const open = intent.to == null
    const from = intent.from ?? []
    const rows: Row[] = [{
      label: '来源',
      value: from.length > 0 ? from.map(id => titles.get(id) ?? id).join('、') : '—',
    }]
    if (intent.worker) rows.push({ label: '执行', value: intent.worker })
    present(
      intent.id,
      'intent',
      'intent',
      '子任务',
      intent.title?.trim() || intent.description?.trim() || intent.id,
      rows,
      intent.status ?? (open ? 'open' : 'done'),
      undefined,
      intent,
    )
  }

  const goal = facts.find(fact => fact.id === 'goal')
  const start = present(
    START_ID,
    'fact',
    'objective',
    '起点',
    goal?.description?.trim() || goal?.title?.trim() || '起点',
    [],
    null,
    goal,
  )

  const producedBy = new Map<string, string>()
  for (const intent of intents) {
    if (intent.to && intent.to !== 'goal' && byId.has(intent.to)) producedBy.set(intent.to, intent.id)
  }
  const intentById = new Map(intents.map(intent => [intent.id, intent]))
  const flowIds = new Set<string>([START_ID])
  for (const intent of intents) {
    flowIds.add(intent.id)
    for (const id of intent.from ?? []) {
      if (id !== 'goal' && byId.has(id)) flowIds.add(id)
    }
    if (intent.to && intent.to !== 'goal' && byId.has(intent.to)) flowIds.add(intent.to)
  }

  const sourcesOf = (id: string): string[] => {
    if (id === START_ID) return []
    const producer = producedBy.get(id)
    if (producer) return [producer]
    const intent = intentById.get(id)
    if (!intent) return []
    return (intent.from ?? []).filter(source => source !== 'goal' && source !== id && flowIds.has(source))
  }

  const columnMemo = new Map<string, number>()
  const columnOf = (id: string, seen = new Set<string>()): number => {
    const cached = columnMemo.get(id)
    if (cached !== undefined) return cached
    if (id === START_ID) {
      columnMemo.set(id, 0)
      return 0
    }
    if (seen.has(id)) return 1
    seen.add(id)
    let column = 1
    const producer = producedBy.get(id)
    if (producer) column = columnOf(producer, seen) + 1
    else {
      const sources = sourcesOf(id)
      if (sources.length > 0) column = Math.max(...sources.map(source => columnOf(source, seen))) + 1
    }
    columnMemo.set(id, column)
    return column
  }
  for (const id of flowIds) columnOf(id)

  const placed = new Set<string>()
  const columnCursor = new Map<number, number>()
  const take = (id: string, idealCenter: number): Card | undefined => {
    const card = byId.get(id)
    if (!card || id === START_ID || placed.has(id)) return card
    const column = columnOf(id)
    const cursor = columnCursor.get(column) ?? PAD_Y
    const y = Math.max(cursor, idealCenter - card.height / 2)
    card.column = column
    card.x = PAD_X + column * (CARD_W + GAP_X)
    card.y = y
    columnCursor.set(column, y + card.height + TREE_GAP)
    placed.add(id)
    return card
  }
  const centerOf = (card: Card): number => card.y + card.height / 2
  const placing = new Set<string>()
  const placeIntent = (intent: IntentNode): void => {
    if (placed.has(intent.id) || placing.has(intent.id)) return
    placing.add(intent.id)
    const sources = sourcesOf(intent.id)
    for (const source of sources) {
      const producer = producedBy.get(source)
      const upstream = producer ? intentById.get(producer) : undefined
      if (upstream) placeIntent(upstream)
    }
    for (const source of sources) {
      if (!producedBy.has(source)) take(source, PAD_Y)
    }
    const anchors = sources.filter(source => producedBy.has(source))
    const aligned = (anchors.length > 0 ? anchors : sources)
      .map(source => byId.get(source))
      .filter((card): card is Card => card !== undefined && placed.has(card.id))
    const mid = aligned.length > 0
      ? aligned.reduce((sum, card) => sum + centerOf(card), 0) / aligned.length
      : (columnCursor.get(columnOf(intent.id)) ?? PAD_Y)
    const card = take(intent.id, mid)
    if (card && intent.to && intent.to !== 'goal' && byId.has(intent.to)) take(intent.to, centerOf(card))
    placing.delete(intent.id)
  }
  const pending = intents.filter(intent => sourcesOf(intent.id).every(source => !producedBy.has(source)))
  const waiting = [...pending]
  while (waiting.length > 0) {
    waiting.sort((a, b) => {
      const share = (item: IntentNode): number => sourcesOf(item.id).filter(source => placed.has(source)).length
      return share(b) - share(a) || compareId(a.id, b.id)
    })
    const next = waiting.shift()
    if (next) placeIntent(next)
  }
  const later = intents.filter(intent => sourcesOf(intent.id).some(source => producedBy.has(source)))
  later.sort((a, b) => compareId(a.id, b.id))
  for (const intent of later) placeIntent(intent)

  let minY = Infinity
  let maxY = -Infinity
  for (const id of flowIds) {
    if (id === START_ID) continue
    const card = byId.get(id)
    if (!card || !placed.has(card.id)) continue
    minY = Math.min(minY, card.y)
    maxY = Math.max(maxY, card.y + card.height)
  }
  start.column = 0
  start.x = PAD_X
  start.y = (Number.isFinite(minY) ? (minY + maxY) / 2 : PAD_Y) - start.height / 2
  const shift = PAD_Y - Math.min(Number.isFinite(minY) ? minY : PAD_Y, start.y)
  if (shift > 0) {
    for (const id of flowIds) {
      const card = byId.get(id)
      if (card) card.y += shift
    }
  }
  const maxColumn = Math.max(0, ...[...flowIds].map(id => byId.get(id)?.column ?? 0))

  const flowCards = [...flowIds].map(id => byId.get(id)).filter((card): card is Card => card !== undefined)
  const treeMid = flowCards.reduce((sum, card) => sum + centerOf(card), 0) / Math.max(flowCards.length, 1)
  const target = present(
    TARGET_ID,
    'fact',
    'objective',
    '目标',
    goal?.title?.trim() || '目标',
    goal ? factRows(goal) : [],
    null,
    goal,
  )
  target.column = maxColumn + 1
  target.x = PAD_X + target.column * (CARD_W + GAP_X)
  target.y = treeMid - target.height / 2

  const liveIntent = new Set(intents.filter(isLiveIntent).map(intent => intent.id))
  const edges: Edge[] = []
  const seenEdge = new Set<string>()
  const pushEdge = (from: string, to: string, live: boolean, label: string): void => {
    const key = `${from}>${to}`
    if (seenEdge.has(key) || from === to) return
    const source = byId.get(from)
    const dest = byId.get(to)
    if (!source || !dest) return
    seenEdge.add(key)
    edges.push({
      from,
      to,
      color: live ? GOLD : EDGE,
      dashed: false,
      lane: 0,
      laneY: 0,
      y1: source.y + source.height / 2,
      y2: dest.y + dest.height / 2,
      live,
      label,
    })
  }
  for (const id of flowIds) {
    if (id === START_ID || sourcesOf(id).length > 0) continue
    pushEdge(START_ID, id, liveIntent.has(id), '')
  }
  for (const intent of intents) {
    const sources = sourcesOf(intent.id)
    const live = liveIntent.has(intent.id)
    for (const id of sources) pushEdge(id, intent.id, live, sources.length === 1 ? (live ? '推进' : '推导') : '')
    if (intent.to && intent.to !== 'goal' && byId.has(intent.to)) {
      const card = byId.get(intent.to)
      const blocked = card?.status === 'blocked' || intent.status === 'blocked'
      if (blocked && card) card.badge = '阻塞'
      pushEdge(intent.id, intent.to, live, blocked ? '阻塞' : '产出')
    }
  }
  const outgoing = new Set(edges.map(edge => edge.from))
  const leaves = [...flowIds].filter(id => id !== START_ID && !outgoing.has(id))
  for (const id of leaves) {
    const producer = producedBy.get(id)
    const live = liveIntent.has(id) || (producer !== undefined && liveIntent.has(producer))
    pushEdge(id, TARGET_ID, live, leaves.length > 2 ? '' : (live ? '推进' : '指向'))
  }

  const loose = cards.filter(card => card.id !== TARGET_ID && !flowIds.has(card.id))
  const flowBottom = Math.max(target.y + target.height, ...flowCards.map(card => card.y + card.height))
  if (loose.length > 0) {
    const gridCols = Math.min(Math.max(target.column + 1, 1), Math.max(loose.length, 1), 6)
    loose.sort((a, b) => compareId(a.id, b.id))
    const rowHeights: number[] = []
    loose.forEach((card, index) => {
      const row = Math.floor(index / gridCols)
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, card.height)
    })
    const rowTop: number[] = []
    let cursor = flowBottom + 72
    for (const height of rowHeights) {
      rowTop.push(cursor)
      cursor += height + GAP_Y
    }
    loose.forEach((card, index) => {
      const column = index % gridCols
      const row = Math.floor(index / gridCols)
      card.loose = true
      card.column = column
      card.x = PAD_X + column * (CARD_W + GAP_X)
      card.y = rowTop[row] ?? cursor
    })
  }

  const bottom = Math.max(...cards.map(card => card.y + card.height))
  const span = Math.max(...cards.map(card => card.column)) + 1
  const width = PAD_X * 2 + (span - 1) * (CARD_W + GAP_X) + CARD_W
  const height = Math.max(460, bottom + 72)
  const focusHeight = Math.min(height, flowBottom + 56)
  return { cards, byId, edges, width, height, focusHeight }
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

function tallyOfBoard(cards: Card[]): Tally {
  const tally: Tally = { asset: 0, finding: 0, cred: 0, clue: 0, objective: 0, intent: 0, open: 0, done: 0 }
  for (const card of cards) {
    if (card.loose || card.id === START_ID || card.id === TARGET_ID) continue
    if (card.kind === 'intent') {
      tally.intent += 1
      if (card.status === 'done' || card.status === 'complete' || card.status === 'abandoned') tally.done += 1
      else tally.open += 1
      continue
    }
    switch (card.fact?.kind) {
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
  const [railOpen, setRailOpen] = useState(true)
  const [showLoose, setShowLoose] = useState(false)
  const [search, setSearch] = useState('')
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

  const tally = useMemo(() => tallyOfBoard(board.cards), [board.cards])

  useEffect(() => {
    if (selected !== null && !board.byId.has(selected)) setSelected(null)
  }, [board, selected])

  useEffect(() => {
    if (board.width <= 0 || board.height <= 0) return
    const query = search.trim().toLowerCase()
    if (query !== '') {
      const hits = board.cards.filter(card => cardHaystack(card).includes(query))
      if (hits.length === 0) return
      const minX = Math.min(...hits.map(card => card.x)) - 64
      const minY = Math.min(...hits.map(card => card.y)) - 48
      const maxX = Math.max(...hits.map(card => card.x + CARD_W)) + 64
      const maxY = Math.max(...hits.map(card => card.y + card.height)) + 48
      setView({ x: minX, y: minY, w: Math.max(maxX - minX, 480), h: Math.max(maxY - minY, 320) })
      return
    }
    const focus = showLoose || board.focusHeight <= 0 ? board.height : Math.min(board.focusHeight, board.height)
    setView({ x: 0, y: 0, w: board.width, h: focus })
  }, [board, search, showLoose])

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
    if (board.width <= 0 || board.height <= 0) return
    const focus = showLoose || board.focusHeight <= 0 ? board.height : Math.min(board.focusHeight, board.height)
    setView({ x: 0, y: 0, w: board.width, h: focus })
  }, [board.width, board.height, board.focusHeight, showLoose])

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
  const running = (graph?.intents ?? []).filter(isRunningIntent)
  const query = search.trim().toLowerCase()
  const matched = query === '' ? null : new Set(board.cards.filter(card => cardHaystack(card).includes(query)).map(card => card.id))
  const shown = (card: Card): boolean => {
    if (card.id === selected) return true
    if (matched !== null) return matched.has(card.id)
    return !card.loose || showLoose
  }
  const looseCount = board.cards.filter(card => card.loose).length
  const link = paused ? 'paused' : error ? 'down' : 'live'
  const selectedCard = selected !== null ? board.byId.get(selected) : undefined
  const filteredEmpty = graph !== null && graph.facts.length + graph.intents.length > 0 && board.cards.length === 0

  if (loading && graph === null) {
    return <div style={{ ...rootStyle, padding: 24 }}>正在读取事实图…</div>
  }

  return (
    <div style={rootStyle}>
      <div ref={barRef} style={toolbarStyle}>
        <strong style={{ fontSize: 14, fontWeight: 650, marginRight: 8, flexShrink: 0 }}>攻击图谱</strong>

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
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="搜索事实、意图"
          aria-label="搜索事实或意图"
          style={{
            width: 168,
            marginLeft: 8,
            height: 28,
            flexShrink: 0,
            borderRadius: 6,
            border: '1px solid var(--dsw-alias-border-l2)',
            background: 'var(--dsw-alias-bg-layer-2)',
            color: LABEL,
            fontSize: 12,
            padding: '0 8px',
            fontFamily: 'inherit',
          }}
        />
        {looseCount > 0 ? (
          <button
            type="button"
            aria-pressed={showLoose}
            title="这些事实没有被任何意图的来源或产出引用，所以没有连线"
            onClick={() => setShowLoose(value => !value)}
            style={{
              ...textBtnStyle,
              ...(showLoose ? { color: GOLD } : { color: MUTED }),
            }}
          >
            未引用 {looseCount}
          </button>
        ) : null}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flexShrink: 1 }}>
          <div style={{ position: 'relative', minWidth: 0, flexShrink: 1 }}>
            <button
              type="button"
              onClick={() => toggleMenu('stats')}
              aria-expanded={menu === 'stats'}
              title="只统计图上连出来的节点，不含未引用事实"
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
                <StatRow label="未引用" value={looseCount} />
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
            open={railOpen}
            onToggle={() => setRailOpen(value => !value)}
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
                aria-label="攻击图谱"
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
                  <marker id="sb-arrow" viewBox="0 0 8 8" markerWidth="7" markerHeight="7" refX="7" refY="4" orient="auto">
                    <path d="M0,1 L7,4 L0,7 Z" fill={EDGE} />
                  </marker>
                  <marker id="sb-arrow-live" viewBox="0 0 8 8" markerWidth="7" markerHeight="7" refX="7" refY="4" orient="auto">
                    <path d="M0,1 L7,4 L0,7 Z" fill={GOLD} />
                  </marker>
                </defs>
                <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={CANVAS_BG} />
                <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="url(#sb-grid)" />

                {board.edges.map((edge, index) => {
                  const source = board.byId.get(edge.from)
                  const target = board.byId.get(edge.to)
                  if (!source || !target || !shown(source) || !shown(target)) return null
                  const hot = hovered !== null && (edge.from === hovered || edge.to === hovered)
                  const dim = connected !== null && !hot
                  const d = linkPath(source, target, edge)
                  const labelX = (source.x + CARD_W + target.x) / 2
                  const labelY = (edge.y1 + edge.y2) / 2 - 7
                  return (
                    <g key={`edge-${edge.from}-${edge.to}-${index}`} pointerEvents="none">
                      {edge.live ? (
                        <path d={d} fill="none" stroke={GOLD} strokeOpacity={dim ? 0.04 : 0.28} strokeWidth={7} strokeLinecap="round" />
                      ) : null}
                      <path
                        d={d}
                        fill="none"
                        stroke={edge.live ? GOLD : edge.color}
                        strokeOpacity={hot ? 0.98 : dim ? 0.05 : edge.live ? 0.95 : 0.72}
                        strokeWidth={edge.live ? 2.1 : 1.35}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray={edge.live ? '14 18' : undefined}
                        markerEnd={edge.live ? 'url(#sb-arrow-live)' : 'url(#sb-arrow)'}
                      >
                        {edge.live ? (
                          <animate attributeName="stroke-dashoffset" from="64" to="0" dur="1.15s" repeatCount="indefinite" />
                        ) : null}
                      </path>
                      {edge.label ? (
                        <text x={labelX} y={labelY} textAnchor="middle" fill={edge.live ? GOLD : MUTED} fontSize={11}>
                          {edge.label}
                        </text>
                      ) : null}
                    </g>
                  )
                })}

                {board.cards.map((card, index) => {
                  const accent = TYPE[card.type].color
                  const dim = connected !== null && !connected.has(card.id)
                  const isHover = hovered === card.id
                  const isSelected = selected === card.id
                  const pin = card.badge === '起点' || card.badge === '目标'
                  if (!shown(card)) return null
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
                        stroke={isSelected ? BLUE : pin ? GOLD : isHover ? 'var(--dsw-alias-border-l4)' : CARD_BORDER}
                        strokeWidth={isSelected || pin ? 1.6 : 1}
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
              {matched !== null && matched.size === 0 ? (
                <div style={{ position: 'absolute', left: 16, bottom: 16, color: MUTED, fontSize: 12, pointerEvents: 'none' }}>
                  没有匹配「{search.trim()}」
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
  open,
  onToggle,
  onPick,
}: {
  targets: SapperTarget[]
  active: string | null
  open: boolean
  onToggle: () => void
  onPick: (cwd: string) => void
}) {
  if (!open) {
    return (
      <aside style={{
        width: 36,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        minHeight: 0,
        paddingTop: 10,
        borderRight: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-specific-sidebar-fill)',
      }}>
        <button type="button" onClick={onToggle} aria-expanded={false} title="展开目标" style={{ ...textBtnStyle, padding: '4px 6px', color: MUTED }}>›</button>
        <div style={{ writingMode: 'vertical-rl', color: FAINT, fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>目标</div>
      </aside>
    )
  }
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
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 8px 8px 14px' }}>
        <div style={{ color: FAINT, fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>目标</div>
        <button type="button" onClick={onToggle} aria-expanded title="收起目标" style={{ ...textBtnStyle, marginLeft: 'auto', padding: '2px 6px', color: MUTED }}>‹</button>
      </div>
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
