import { readFileSync } from 'node:fs'
import { NewApiAdapter } from '../lib/index.js'
const creds = readFileSync('C:/Users/Deity/.dsh/.credentials.yaml', 'utf8')
const KEY = creds.split('\n').find(l => l.trim().startsWith('newapi:')).split(': ').slice(1).join(': ').trim()
const adapter = new NewApiAdapter({
  options: () => ({ baseURL: 'https://seekai.cc/v1', apiKeyRef: 'newapi', models: [], modelExcludePatterns: [], defaultContextWindow: 128000, maxTokens: undefined, streamIdleTimeoutMs: 300000, proxyUrl: 'http://127.0.0.1:7890', providerHints: {}, retryPolicy: {} }),
  resolveApiKey: async () => KEY,
  officialProviderOf: () => undefined,
})
for (const model of ['deepseek-v4-flash', 'gemini-3-flash', 'gpt-5.6']) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 25000)
  const started = Date.now()
  try {
    const chat = adapter.stream({ model, messages: [{ role: 'user', content: [{ type: 'text', text: 'say ok' }] }], maxTokens: 10, signal: ac.signal })
    let got = 0, text = ''
    for await (const chunk of chat) {
      got++
      if (chunk.type === 'text-delta') text += chunk.text
      if (got > 100) break
    }
    console.log(`${model}: OK in ${Date.now() - started}ms chunks=${got} text=${JSON.stringify(text.slice(0, 40))}`)
  } catch (e) {
    console.log(`${model}: ${e.code} after ${Date.now() - started}ms msg=${String(e.message).slice(0, 60)}`)
  } finally { clearTimeout(t) }
}
