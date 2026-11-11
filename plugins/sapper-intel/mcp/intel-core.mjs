/**
 * intel-core — GitHub commit 轮询与状态管理，零依赖。
 *
 * 状态文件默认在 ~/.zcode/intel-watch/state.json（可用 INTEL_STATE_DIR 覆盖），
 * 记录每个监控仓库的分支、绑定的 sapper store、最后见过的 commit SHA 与待判读队列。
 * 判读本身由 agent 会话完成（intel-check 命令），本模块只负责采集与记账。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const STATE_DIR = process.env.INTEL_STATE_DIR ?? join(homedir(), '.zcode', 'intel-watch')
const STATE_FILE = join(STATE_DIR, 'state.json')
const API = 'https://api.github.com'

const MAX_PENDING_PER_REPO = 20
const MAX_BACKFILL = 10
const FILES_LIMIT = 10
const PATCH_LIMIT = 4000
const HISTORY_LIMIT = 100

function authToken() {
  return process.env.INTEL_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? ''
}

function loadState() {
  if (!existsSync(STATE_FILE)) return { version: 1, repos: {}, history: [] }
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    return { version: 1, repos: parsed.repos ?? {}, history: parsed.history ?? [] }
  } catch {
    throw new Error(`状态文件损坏：${STATE_FILE}（删除后可重建，但会丢失监控清单）`)
  }
}

function saveState(state) {
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8')
}

async function gh(path) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'sapper-intel/0.1' }
  const token = authToken()
  if (token !== '') headers.authorization = `Bearer ${token}`
  const response = await fetch(API + path, { headers })
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      throw new Error('GitHub API 限流（HTTP 403）— 未认证每小时仅 60 次；设置 INTEL_GITHUB_TOKEN 或 GITHUB_TOKEN 后重试')
    }
    if (response.status === 404) throw new Error(`仓库不存在或不可访问：${path}`)
    const body = await response.text().catch(() => '')
    throw new Error(`GitHub API HTTP ${response.status}: ${body.slice(0, 300)}`)
  }
  return response.json()
}

function requireRepo(state, repo) {
  const config = state.repos[repo]
  if (config === undefined) throw new Error(`仓库未登记：${repo}（先用 intel_add 登记）`)
  return config
}

/**
 * 登记一个监控仓库。首次登记只记录基线（最新 commit），不判读历史。
 */
export async function addRepo({ repo, branch, store } = {}) {
  if (typeof repo !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(repo.trim())) {
    throw new Error('repo 需要是 owner/name 形式，例如 vim/vim')
  }
  const key = repo.trim()
  const state = loadState()
  const info = await gh(`/repos/${key}`)
  const config = {
    branch: typeof branch === 'string' && branch !== '' ? branch : info.default_branch ?? 'main',
    store: typeof store === 'string' && store !== '' ? store : '',
    addedAt: new Date().toISOString(),
    lastSha: '',
    pending: [],
  }
  if (state.repos[key] !== undefined) {
    // 已登记：保留基线与待判读队列，只更新绑定
    config.lastSha = state.repos[key].lastSha ?? ''
    config.pending = state.repos[key].pending ?? []
    config.addedAt = state.repos[key].addedAt
  }
  state.repos[key] = config
  saveState(state)
  return {
    repo: key,
    branch: config.branch,
    store: config.store,
    description: info.description ?? '',
    baselinePolicy: config.lastSha === '' ? '首次登记，已记录基线，不判读历史提交' : '保留原基线与待判读队列',
    stateFile: STATE_FILE,
  }
}

export function removeRepo({ repo } = {}) {
  const state = loadState()
  requireRepo(state, repo)
  const pending = state.repos[repo].pending.length
  delete state.repos[repo]
  saveState(state)
  return { removed: repo, droppedPending: pending }
}

export function listRepos() {
  const state = loadState()
  const repos = Object.entries(state.repos).map(([repo, config]) => ({
    repo,
    branch: config.branch,
    store: config.store === '' ? '（未绑定，只记录不落图）' : config.store,
    pending: config.pending.length,
    lastSha: (config.lastSha ?? '').slice(0, 12),
    pendingTitles: config.pending.map(item => `${item.sha.slice(0, 8)} ${item.message}`),
  }))
  return { stateFile: STATE_FILE, tokenConfigured: authToken() !== '', repos, recentHistory: state.history.slice(-15).reverse() }
}

function digestCommit(detail, listEntry) {
  const files = (detail.files ?? []).slice(0, FILES_LIMIT).map(file => ({
    file: file.filename,
    status: file.status,
    changes: `+${file.additions ?? 0}/-${file.deletions ?? 0}`,
    patch: (file.patch ?? '').slice(0, PATCH_LIMIT),
    patchTruncated: (file.patch ?? '').length > PATCH_LIMIT,
  }))
  return {
    sha: detail.sha.slice(0, 12),
    date: listEntry.date,
    author: listEntry.author,
    message: listEntry.message,
    url: listEntry.url,
    files,
    fileCount: (detail.files ?? []).length,
  }
}

/**
 * 轮询所有登记仓库：新 commit 拉取 diff 后进入待判读队列。
 * lastSha 丢失（超过一页回溯不到）时按一页上限补采，防止无限抓取。
 */
export async function fetchPending() {
  const state = loadState()
  if (Object.keys(state.repos).length === 0) {
    throw new Error('监控清单为空 — 先用 intel_add 登记仓库')
  }
  const report = []
  for (const [repo, config] of Object.entries(state.repos)) {
    try {
      const commits = await gh(`/repos/${repo}/commits?sha=${encodeURIComponent(config.branch)}&per_page=30`)
      if (!Array.isArray(commits) || commits.length === 0) {
        report.push({ repo, newCommits: 0, note: '分支上没有提交' })
        continue
      }
      const list = commits.map(item => ({
        sha: item.sha,
        date: item.commit?.author?.date ?? '',
        author: item.commit?.author?.name ?? '',
        message: (item.commit?.message ?? '').split('\n')[0].slice(0, 200),
        url: item.html_url ?? `https://github.com/${repo}/commit/${item.sha}`,
      }))
      if (config.lastSha === '') {
        config.lastSha = list[0].sha
        saveState(state)
        report.push({ repo, newCommits: 0, note: `首次采集，基线定为 ${list[0].sha.slice(0, 12)}（${list[0].message}），不判读历史` })
        continue
      }
      const seenAt = list.findIndex(item => item.sha === config.lastSha)
      const fresh = seenAt === -1 ? list.slice(0, MAX_BACKFILL) : list.slice(0, seenAt)
      const entries = []
      for (const item of fresh) {
        try {
          const detail = await gh(`/repos/${repo}/commits/${item.sha}`)
          const entry = digestCommit(detail, item)
          config.pending.push(entry)
          entries.push(entry)
        } catch (error) {
          entries.push({ sha: item.sha.slice(0, 12), message: item.message, error: String(error.message ?? error) })
        }
      }
      if (fresh.length > 0) config.lastSha = fresh[0].sha
      if (config.pending.length > MAX_PENDING_PER_REPO) {
        config.pending = config.pending.slice(0, MAX_PENDING_PER_REPO)
      }
      report.push({ repo, newCommits: fresh.length, pendingNow: config.pending.length, commits: entries })
    } catch (error) {
      report.push({ repo, error: String(error.message ?? error) })
    }
  }
  saveState(state)
  return { report, stateFile: STATE_FILE }
}

/**
 * 记录一个提交的判读结论，并移出待判读队列。
 */
export function resolveCommit({ repo, sha, verdict, action, factId, intentId } = {}) {
  if (typeof verdict !== 'string' || verdict.trim() === '') throw new Error('verdict 不能为空（一句话判读结论）')
  const state = loadState()
  const config = requireRepo(state, repo)
  const index = config.pending.findIndex(item => item.sha.startsWith(String(sha)))
  if (index === -1) throw new Error(`待判读队列里没有 ${sha}（可能已判过或未采集到）`)
  const entry = config.pending.splice(index, 1)[0]
  const record = {
    repo,
    sha: entry.sha,
    message: entry.message,
    verdict: verdict.trim().slice(0, 500),
    action: ['escalated', 'noted', 'skip'].includes(action) ? action : 'noted',
    factId: factId ?? '',
    intentId: intentId ?? '',
    at: new Date().toISOString(),
  }
  state.history.push(record)
  if (state.history.length > HISTORY_LIMIT) state.history = state.history.slice(-HISTORY_LIMIT)
  saveState(state)
  return { resolved: entry.sha, pendingLeft: config.pending.length, verdict: record.verdict, action: record.action }
}
