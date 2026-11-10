/**
 * Wire types shared by the sapper board's Host reader and browser renderer.
 */

/** One confirmed observation. */
export interface FactNode {
  /** Stable node id, e.g. `f001`. */
  id: string
  /** Short human label shown in the graph view. */
  title?: string
  /** One-sentence gist. */
  description?: string
  /** Observation type: host / service / cred / vuln / loot / flag / note. */
  kind?: string
  /** Intent that produced this fact, when the CLI recorded provenance. */
  source_intent?: string | null
  /** Detailed evidence document (third layer: commands, raw responses). */
  doc?: string | null
  /** ISO-8601 creation instant. */
  created_at?: string
  /** Author recorded by the CLI. */
  creator?: string
  /** Optional zone label grouping assets by network area (外网 / 内网 …). */
  zone?: string | null
  /** Structured KEY=VALUE payload. */
  data?: Record<string, unknown> | null
}

/** One unit of offensive work, an edge between facts. */
export interface IntentNode {
  /** Stable node id, e.g. `i001`. */
  id: string
  title?: string
  description?: string
  /** Fact ids this intent builds on. */
  from?: string[]
  /** Fact id this intent produced. */
  to?: string
  /** done / open / abandoned. */
  status?: string
  /** Lane teammate that claimed it. */
  worker?: string | null
  /** True when the action needs human confirmation. */
  requires_confirmation?: boolean
  /** Confirmation instant, when confirmed. */
  confirmed_at?: string | null
  /** Detailed playbook or evidence document. */
  doc?: string | null
}

/** One engagement the board can switch to. */
export interface SapperTarget {
  /** Absolute `.sapper` directory. Sent back as the `cwd` query. */
  cwd: string
  /** Engagement goal line, when the store recorded one. */
  goal: string | null
  /** active / completed / stopped. */
  status: string | null
  /** Fact count, so the switcher can show scale without loading the graph. */
  facts: number
  /** Intent count. */
  intents: number
}

/** One written vulnerability report on disk. */
export interface VulnReport {
  /** Name taken from the report. */
  name: string
  /** First paragraph of the report's description. */
  summary: string
  /** 严重 / 高危 / 中危 / 低危, when the report states one. */
  level: string
  /** Absolute path of the report file. */
  path: string
  /** Vulnerable URL recorded in the report, when it has one. */
  url?: string
  /** Fact id backing a not-yet-written finding; absent for written reports. */
  id?: string
}

/** The whole graph as the board renders it. */
export interface GraphView {
  /** Engagement goal line. */
  goal: string | null
  /** active / completed / stopped. */
  status: string | null
  /** Confirmed observations. */
  facts: FactNode[]
  /** Work units. */
  intents: IntentNode[]
  /** Vulnerability reports written for this engagement. */
  reports?: VulnReport[]
}
