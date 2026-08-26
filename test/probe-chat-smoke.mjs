import { readFileSync } from 'node:fs'
import { NewApiAdapter } from '../lib/index.js'
const creds = readFileSync('C:/Users/Deity/.dsh/.credentials.yaml', 'utf8')
const KEY = creds.split('\n').find(l => l.trim().startsWith('newapi:')).split(': ').slice(1).join(': ').trim()
const adapter = new NewApiAdapter({
  options: () => ({ baseURL: 'https://seekai.cc/v1', apiKeyRef: 'newapi', models: [], modelExcludePatterns: [], defaultContextWindow: 128000, maxTokens: undefined, streamIdleTimeoutMs: 300000, proxyUrl: 'http://127.0.0.1:7890', providerHints: {}, retryPolicy: {} }),
  resolveApiKey: async () => KEY,
  officialProviderOf: () => undefined,
})

// 1) 不带 chatModel: 免费、快速、只看 models
const fast = await adapter.probeConnection({})
console.log('无chatModel: ok=', fast.ok, 'authValid=', fast.authValid, 'modelCount=', fast.modelCount, 'latencyMs=', fast.latencyMs, '| chat 字段存在?', 'chat' in fast ? '是(不应!)' : '否(正确)')

// 2) 带 chatModel: 极省 token 的 chat 实测
const t0 = Date.now()
const withChat = await adapter.probeConnection({ chatModel: 'deepseek-v4-flash', chatTimeoutMs: 25000 })
console.log('带chatModel: ok=', withChat.ok, 'authValid=', withChat.authValid, 'modelCount=', withChat.modelCount, '总耗时ms=', Date.now() - t0)
console.log('  chat 子结果:', JSON.stringify(withChat.chat))
