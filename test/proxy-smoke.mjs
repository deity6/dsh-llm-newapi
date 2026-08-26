import { readFileSync } from 'node:fs'
import { NewApiAdapter } from '../lib/index.js'

// 从 dsh 凭据文件读 key（运行时读取，不硬编码、不打印完整值）
const creds = readFileSync('C:/Users/Deity/.dsh/.credentials.yaml', 'utf8')
const keyLine = creds.split('\n').find(line => line.trim().startsWith('newapi:'))
const KEY = keyLine.split(': ').slice(1).join(': ').trim()
console.log(`key_len=${KEY.length} prefix=${KEY.slice(0, 6)}... (遮罩)`)

let failures = 0
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  -> ' + extra : ''}`)
  if (!cond) failures++
}

const makeAdapter = (proxyUrl) => new NewApiAdapter({
  options: () => ({
    baseURL: 'https://seekai.cc/v1',
    apiKeyRef: 'newapi',
    models: [],
    modelExcludePatterns: [],
    defaultContextWindow: 128000,
    maxTokens: undefined,
    streamIdleTimeoutMs: 300000,
    proxyUrl, // undefined = 直连; 有值 = 走代理
    providerHints: {},
    retryPolicy: {},
  }),
  resolveApiKey: async () => KEY,
  officialProviderOf: () => undefined,
})

console.log('\n=== A. 直连 probe (无代理): 预期与之前一致 — 可能 403 (Cloudflare TLS 指纹) ===')
const direct = await makeAdapter(undefined).probeConnection({})
console.log('direct:', JSON.stringify({ ...direct, sampleModels: direct.sampleModels?.slice(0, 3) }))
check('直连结果结构完整', typeof direct.ok === 'boolean' && typeof direct.latencyMs === 'number')

console.log('\n=== B. 走 Clash 代理 probe: 预期可达+鉴权通过 ===')
const proxied = await makeAdapter('http://127.0.0.1:7890').probeConnection({})
console.log('proxied:', JSON.stringify({ ...proxied, sampleModels: proxied.sampleModels?.slice(0, 3) }))
check('代理下 reachable', proxied.reachable === true, `reachable=${proxied.reachable} status=${proxied.status}`)
check('代理下 authValid', proxied.authValid === true, `authValid=${proxied.authValid}`)
check('代理下 modelCount > 0', (proxied.modelCount ?? 0) > 0, `modelCount=${proxied.modelCount}`)

console.log('\n=== C. 走代理的最小 chat POST (验证 gateway 代理通路全通) ===')
const adapterP = makeAdapter('http://127.0.0.1:7890')
const chat = await adapterP.stream({
  model: 'gpt-5.6',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  maxTokens: 5,
})
let got = 0
let text = ''
for await (const chunk of chat) {
  got++
  if (chunk.type === 'text-delta') text += chunk.text
  if (got > 50) break
}
console.log(`chat chunks=${got} text=${JSON.stringify(text.slice(0, 60))}`)
check('chat 流有数据', got > 0, `chunks=${got}`)

console.log(failures === 0 ? '\nALL PASS ✅' : `\n${failures} FAIL ❌`)
process.exit(failures === 0 ? 0 : 1)
