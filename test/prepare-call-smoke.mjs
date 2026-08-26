import { NewApiAdapter } from '../lib/index.js'

let failures = 0
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  -> ' + extra : ''}`)
  if (!cond) failures++
}

// 1) 原型上确实有 prepareCall（这是之前报错的缺失方法）
check('NewApiAdapter.prototype.prepareCall is a function',
  typeof NewApiAdapter.prototype.prepareCall === 'function')

// 2) 构造最小实例并真实调用 prepareCall（模拟宿主 ctx.llm.prepareCall 的委托）
const stubConfig = {
  options: () => ({
    models: [{ id: 'gpt-4o', contextWindow: 128000 }],
    maxTokens: undefined,
    defaultContextWindow: 128000,
  }),
  resolveApiKey: async () => 'sk-stub',
  officialProviderOf: () => undefined,
}
const adapter = new NewApiAdapter(stubConfig)
const result = await adapter.prepareCall('newapi', 'gpt-4o', undefined)
check('prepareCall returns an object', typeof result === 'object' && result !== null)
check('result.model present (LlmResolvedModelInfo)', !!result.model && result.model.id === 'gpt-4o')
check('result.stream is a function', typeof result.stream === 'function')
console.log('resolved model sample:', JSON.stringify(result.model))

console.log(failures === 0 ? '\nALL PASS ✅' : `\n${failures} FAIL ❌`)
process.exit(failures === 0 ? 0 : 1)
