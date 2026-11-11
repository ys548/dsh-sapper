/**
 * intel-watch MCP server — stdio JSON-RPC，零依赖。
 *
 * 暴露五个工具：intel_add / intel_remove / intel_list / intel_fetch / intel_resolve。
 * 采集与状态在 intel-core.mjs；判读由 agent 会话完成（intel-check 命令编排）。
 */

import { createInterface } from 'node:readline'
import * as core from './intel-core.mjs'

const SERVER_INFO = { name: 'intel-watch', version: '0.1.0' }

const TOOLS = [
  {
    name: 'intel_add',
    description: '登记一个 GitHub 仓库到开源情报监控（可选绑定 sapper store 路径用于落图）',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'owner/name，例如 vim/vim' },
        branch: { type: 'string', description: '分支，默认仓库默认分支' },
        store: { type: 'string', description: '绑定的 .sapper store 绝对路径；留空则只记录不落图' },
      },
      required: ['repo'],
    },
  },
  {
    name: 'intel_remove',
    description: '从监控清单移除一个仓库',
    inputSchema: { type: 'object', properties: { repo: { type: 'string' } }, required: ['repo'] },
  },
  {
    name: 'intel_list',
    description: '查看监控清单、待判读队列和最近判读记录',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'intel_fetch',
    description: '轮询所有登记仓库：拉取新 commit 及其 diff patch，进入待判读队列并返回',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'intel_resolve',
    description: '记录一个提交的判读结论（escalated/noted/skip）并移出待判读队列',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string' },
        sha: { type: 'string', description: '提交 SHA（前缀即可）' },
        verdict: { type: 'string', description: '一句话判读结论' },
        action: { type: 'string', enum: ['escalated', 'noted', 'skip'] },
        factId: { type: 'string', description: '写入 store 的 fact id（有则填）' },
        intentId: { type: 'string', description: '创建的复现 intent id（有则填）' },
      },
      required: ['repo', 'sha', 'verdict', 'action'],
    },
  },
]

const HANDLERS = {
  intel_add: core.addRepo,
  intel_remove: core.removeRepo,
  intel_list: core.listRepos,
  intel_fetch: core.fetchPending,
  intel_resolve: core.resolveCommit,
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

const readline = createInterface({ input: process.stdin, terminal: false })
readline.on('line', line => {
  const text = line.trim()
  if (text === '') return
  let message
  try {
    message = JSON.parse(text)
  } catch {
    return
  }
  if (message.id === undefined || message.id === null) return // notification, no reply
  void handle(message)
})

async function handle(message) {
  const { method, params } = message
  try {
    if (method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: params?.protocolVersion ?? '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      })
      return
    }
    if (method === 'ping') {
      send({ jsonrpc: '2.0', id: message.id, result: {} })
      return
    }
    if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id: message.id, result: { tools: TOOLS } })
      return
    }
    if (method === 'tools/call') {
      const name = params?.name
      const handler = HANDLERS[name]
      if (handler === undefined) throw new Error(`未知工具：${name}`)
      const output = await handler(params?.arguments ?? {})
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] },
      })
      return
    }
    send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `method not found: ${method}` } })
  } catch (error) {
    if (method === 'tools/call') {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: { content: [{ type: 'text', text: String(error.message ?? error) }], isError: true },
      })
    } else {
      send({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: String(error.message ?? error) } })
    }
  }
}
