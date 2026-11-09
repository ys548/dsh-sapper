/**
 * sapper board dictionaries.
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'sapper'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '协作画板',
  'loading': '正在读取事实图…',
  'empty.title': '事实图还是空的',
  'empty.body': '让指挥官先用 sapper_fact 记下第一条已确认的观察，这里就会长出节点。',
  'counts': '{facts} 事实 · {intents} 意图',
  'goal': '目标',
  'kind.host': '主机',
  'kind.service': '服务',
  'kind.cred': '凭据',
  'kind.vuln': '漏洞',
  'kind.loot': '战利品',
  'kind.flag': 'FLAG',
  'kind.note': '笔记',
  'error': '读取事实图失败：{message}',
}

/** English dictionary, checked against the Chinese key set. */
export const en: typeof zh = {
  'title': 'sapper board',
  'loading': 'Reading the fact graph…',
  'empty.title': 'The fact graph is still empty',
  'empty.body': 'Have the commander record its first confirmed observation with sapper_fact and nodes will appear here.',
  'counts': '{facts} facts · {intents} intents',
  'goal': 'Goal',
  'kind.host': 'Host',
  'kind.service': 'Service',
  'kind.cred': 'Cred',
  'kind.vuln': 'Vuln',
  'kind.loot': 'Loot',
  'kind.flag': 'FLAG',
  'kind.note': 'Note',
  'error': 'Failed to read the fact graph: {message}',
}

export type SapperKey = keyof typeof zh
