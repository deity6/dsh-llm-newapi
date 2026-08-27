import { readFileSync } from 'node:fs'
import yaml from 'yaml'
import { NewApiAdapter } from '../lib/index.js'
const settings = yaml.parse(readFileSync('C:/Users/Deity/.dsh/settings.yaml', 'utf8'))
const inst = settings['llm-newapi'].instances[0]
const KEY = readFileSync('C:/Users/Deity/.dsh/.credentials.yaml', 'utf8').split('\n').find(l => l.trim().startsWith('newapi_seekai:')).split(': ').slice(1).join(': ').trim()
console.log('settings baseURL:', JSON.stringify(inst.baseURL))

async function tryChat(label, proxyUrl) {
  const adapter = new NewApiAdapter({
    options: () => ({ baseURL: 'https://seekai.cc/v1', apiKeyRef: 'newapi_seekai', models: [], modelExcludePatterns: [], defaultContextWindow: 128000, maxTokens: undefined, streamIdleTimeoutMs: 300000, proxyUrl, providerHints: {}, retryPolicy: {} }),
    resolveApiKey: async () => KEY,
    officialProviderOf: () => undefined,
  })
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 30000)
  const started = Date.now()
  try {
    const chat = adapter.stream({ model: 'glm-5-2', messages: [{ role: 'user', content: [{ type: 'text', text: 'say ok' }] }], maxTokens: 10, signal: ac.signal })
    let got = 0
    for await (const c of chat) { got++; if (got > 5) break }
    console.log(`${label}: OK in ${Date.now() - started}ms, chunks=${got}`)
  } catch (e) {
    console.log(`${label}: ${e.code} in ${Date.now() - started}ms - ${String(e.message).slice(0, 90)}`)
    console.log(`   CAUSE: ${e.cause?.message ?? e.cause ?? '(none)'}`.slice(0, 150))
  } finally { clearTimeout(t) }
}
await tryChat('proxy7890', 'http://127.0.0.1:7890')
await tryChat('direct', undefined)
