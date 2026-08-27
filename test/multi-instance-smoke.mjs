import { Config, instanceEntriesOf, routeOf, refOf, sanitizeInstanceId, resolveAdapterOptions } from '../lib/index.js'

let failures = 0
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  -> ' + extra : ''}`)
  if (!cond) failures++
}

// --- route / ref 派生 ---
check('sanitizeInstanceId("seekai") = "seekai"', sanitizeInstanceId('seekai') === 'seekai')
check('sanitizeInstanceId(" My GW! ") = "my-gw"', sanitizeInstanceId(' My GW! ') === 'my-gw', sanitizeInstanceId(' My GW! '))
check('sanitizeInstanceId("!!!") = "default"', sanitizeInstanceId('!!!') === 'default')
check('routeOf("seekai") = "newapi-seekai"', routeOf('seekai') === 'newapi-seekai', routeOf('seekai'))
check('refOf("seekai") = "newapi_seekai"', refOf('seekai') === 'newapi_seekai', refOf('seekai'))
check('refOf("my-gw") = "newapi_my_gw" (dash→underscore)', refOf('my-gw') === 'newapi_my_gw', refOf('my-gw'))

// --- legacy 迁移 ---
const legacy = Config({ baseURL: 'https://seekai.cc/v1', models: [{ id: 'a' }] })
const eLegacy = instanceEntriesOf(legacy)
check('legacy flat → 1 个 default 实例', eLegacy.length === 1 && eLegacy[0].id === 'default', JSON.stringify(eLegacy.map(e => e.id)))
check('legacy displayName = NewAPI', eLegacy[0].displayName === 'NewAPI')
const optsLegacy = resolveAdapterOptions(eLegacy[0].instance, undefined, refOf('default'))
check('legacy apiKeyRef = newapi_default', optsLegacy.apiKeyRef === 'newapi_default', optsLegacy.apiKeyRef)

// --- 空配置 → 0 实例 ---
check('空配置 → 0 实例', instanceEntriesOf(Config({})).length === 0)

// --- 多实例列表 ---
const multi = Config({
  instances: [
    { id: 'seekai', displayName: 'SeekAI', baseURL: 'https://seekai.cc/v1' },
    { id: 'my-gw', baseURL: 'https://gw.example.com/v1', proxy: { enabled: true, url: 'http://127.0.0.1:7890' } },
  ],
})
const eMulti = instanceEntriesOf(multi)
check('instances 列表 → 2 个', eMulti.length === 2, JSON.stringify(eMulti.map(e => e.id)))
check('displayName 显式', eMulti[0].displayName === 'SeekAI')
check('displayName 回退到 id', eMulti[1].displayName === 'my-gw')
check('route: newapi-seekai / newapi-my-gw', routeOf(eMulti[0].id) === 'newapi-seekai' && routeOf(eMulti[1].id) === 'newapi-my-gw')

// --- 每实例独立解析: baseURL / ref / proxy ---
const a = resolveAdapterOptions(eMulti[0].instance, undefined, refOf(eMulti[0].id))
const b = resolveAdapterOptions(eMulti[1].instance, undefined, refOf(eMulti[1].id))
check('实例A apiKeyRef = newapi_seekai', a.apiKeyRef === 'newapi_seekai', a.apiKeyRef)
check('实例B apiKeyRef = newapi_my_gw', b.apiKeyRef === 'newapi_my_gw', b.apiKeyRef)
check('实例A baseURL 独立', a.baseURL === 'https://seekai.cc/v1')
check('实例B baseURL 独立 + proxy 生效', b.baseURL === 'https://gw.example.com/v1' && b.proxyUrl === 'http://127.0.0.1:7890', JSON.stringify({ b: b.baseURL, p: b.proxyUrl }))

console.log(failures === 0 ? '\nALL PASS ✅' : `\n${failures} FAIL ❌`)
process.exit(failures === 0 ? 0 : 1)
