import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import yaml from 'yaml'
import { Config, instanceEntriesOf, routeOf, refOf, resolveAdapterOptions } from '../lib/index.js'

let failures = 0
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  -> ' + extra : ''}`)
  if (!cond) failures++
}

// 解析真实 settings.yaml 的 llm-newapi 段（本机回归；路径可经 DSH_SETTINGS_PATH 覆盖，
// 文件不存在时跳过——CI 无本地配置，属于正常跳过而非失败）
const settingsPath = process.env.DSH_SETTINGS_PATH ?? join(homedir(), '.dsh', 'settings.yaml')
if (!existsSync(settingsPath)) {
  console.log(`SKIP  ${settingsPath} 不存在 — 本机回归测试跳过`)
  console.log('\nALL PASS ✅ (skipped)')
  process.exit(0)
}
const raw = readFileSync(settingsPath, 'utf8')
const doc = yaml.parse(raw)
const section = Config(doc['llm-newapi'] ?? {})
const entries = instanceEntriesOf(section)
check('settings.yaml → ≥3 个实例（含 seekai/justwoker/agentrouter）', entries.length >= 3
  && ['seekai', 'justwoker', 'agentrouter'].every(id => entries.some(e => e.id === id)),
JSON.stringify(entries.map(e => e.id)))
const seekai = entries.find(e => e.id === 'seekai')
check('实例 seekai 存在', seekai !== undefined)
if (seekai === undefined) {
  console.log(failures === 0 ? '\nALL PASS ✅' : `\n${failures} FAIL ❌`)
  process.exit(1)
}
check('displayName = seekai', seekai.displayName === 'seekai', seekai.displayName)
check('route = newapi-seekai', routeOf(seekai.id) === 'newapi-seekai', routeOf(seekai.id))
check('ref = newapi_seekai', refOf(seekai.id) === 'newapi_seekai', refOf(seekai.id))
const opts = resolveAdapterOptions(seekai.instance, undefined, refOf(seekai.id))
check('baseURL = https://seekai.cc/v1', opts.baseURL === 'https://seekai.cc/v1', opts.baseURL)
check('proxyUrl 生效', opts.proxyUrl === 'http://127.0.0.1:7890', opts.proxyUrl)
check('models 数量 = 8', opts.models.length === 8, String(opts.models.length))
check('默认模型 glm-5-2 在列', opts.models.some(m => m.id === 'glm-5-2'))
// justwoker 实例（用户后加）也独立解析
const justwoker = entries.find(e => e.id === 'justwoker')
check('实例 justwoker 存在', justwoker !== undefined, JSON.stringify(entries.map(e => e.id)))
if (justwoker !== undefined) {
  check('justwoker route = newapi-justwoker', routeOf(justwoker.id) === 'newapi-justwoker', routeOf(justwoker.id))
  check('justwoker ref = newapi_justwoker', refOf(justwoker.id) === 'newapi_justwoker', refOf(justwoker.id))
  check('实例 agentrouter 存在', entries.some(e => e.id === 'agentrouter'), JSON.stringify(entries.map(e => e.id)))
}


// 旧扁平格式仍能迁移（回归）
const legacy = Config({ baseURL: 'https://x/v1', models: [{ id: 'm1' }] })
const le = instanceEntriesOf(legacy)
check('旧扁平 → default 实例', le.length === 1 && le[0].id === 'default')

console.log(failures === 0 ? '\nALL PASS ✅' : `\n${failures} FAIL ❌`)
process.exit(failures === 0 ? 0 : 1)
