// Regression: the model picker labels provider groups with
// adapter.providerInfo().name (dsh-host-apiproxy buildModelCatalog), so a
// multi-instance adapter must return ITS instance's displayName — a
// hardcoded name makes every instance read the same (v0.9.0 regression).
import { readFileSync } from 'node:fs'
import yaml from 'yaml'
import { NewApiAdapter, resolveAdapterOptions, routeOf, refOf } from '../lib/index.js'

let failures = 0
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  -> ' + extra : ''}`)
  if (!cond) failures++
}

const settings = yaml.parse(readFileSync('C:/Users/Deity/.dsh/settings.yaml', 'utf8'))
const section = settings['llm-newapi'] ?? {}
const instances = section.instances ?? []

// 每实例一个 adapter（模拟 syncRegistrations 的构造）
for (const entry of instances) {
  const id = entry.id
  const route = routeOf(id)
  const adapter = new NewApiAdapter({
    options: () => resolveAdapterOptions({ ...entry }, undefined, refOf(id)),
    resolveApiKey: async () => 'sk-test',
    displayName: entry.displayName ?? id,
  })
  const info = adapter.providerInfo(route)
  check(
    `providerInfo('${route}').name = '${entry.displayName ?? id}'`,
    info.name === (entry.displayName ?? id),
    `actual: '${info.name}'`,
  )
}

// 不传 displayName 时回退路由 id（基类行为）
const bare = new NewApiAdapter({ options: () => ({}), resolveApiKey: async () => 'x' })
const bareInfo = bare.providerInfo('newapi-x')
check("无 displayName 回退路由 id", bareInfo.name === 'newapi-x', `actual: '${bareInfo.name}'`)

console.log(failures === 0 ? '\nALL PASS ✅' : `\n${failures} FAIL ❌`)
process.exit(failures === 0 ? 0 : 1)
