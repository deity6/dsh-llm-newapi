import { readFileSync } from 'node:fs'
import yaml from 'yaml'
import { NewApiAdapter } from '../lib/index.js'
const settings = yaml.parse(readFileSync('C:/Users/Deity/.dsh/settings.yaml', 'utf8'))
const KEY = readFileSync('C:/Users/Deity/.dsh/.credentials.yaml', 'utf8').split('\n').find(l => l.trim().startsWith('newapi_seekai:')).split(': ').slice(1).join(': ').trim()
const adapter = new NewApiAdapter({
  options: () => ({ baseURL: 'https://seekai.cc/v1', apiKeyRef: 'newapi_seekai', models: [], modelExcludePatterns: [], defaultContextWindow: 128000, maxTokens: undefined, streamIdleTimeoutMs: 300000, proxyUrl: 'http://127.0.0.1:7890', providerHints: {}, retryPolicy: {} }),
  resolveApiKey: async () => KEY,
  officialProviderOf: () => undefined,
})
const ac = new AbortController()
const t = setTimeout(() => ac.abort(), 30000)
try {
  const chat = adapter.stream({ model: 'glm-5-2', messages: [{ role: 'user', content: [{ type: 'text', text: 'say ok' }] }], maxTokens: 10, signal: ac.signal })
  for await (const c of chat) { break }
} catch (e) {
  let depth = 0
  let cur = e
  while (cur && depth < 6) {
    const msg = cur.message ?? String(cur)
    const code = cur.code ?? cur.name ?? '?'
    console.log(`[${depth}] ${code}: ${msg}`.slice(0, 220))
    cur = cur.cause ?? cur.reason
    depth++
  }
} finally { clearTimeout(t) }
