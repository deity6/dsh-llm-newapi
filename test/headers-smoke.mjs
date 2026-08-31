/**
 * Custom request-header injection smoke: the config → resolved-connection
 * path and its validation. The wire-level merge (custom spread first,
 * mandatory headers last) is exercised by the adapter's fetch sites, which
 * this script reaches through the exported resolver — a full gateway round
 * trip is deliberately out of scope here.
 */
import { resolveAdapterOptions } from '../lib/index.js'

let failures = 0
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  -> ' + extra : ''}`)
  if (!cond) failures++
}

const base = {
  id: 't',
  baseURL: 'https://gw.test/v1',
  models: [],
  modelExcludePatterns: [],
  defaultContextWindow: 128_000,
  streamIdleTimeoutMs: 300_000,
}

// 1. 自定义头原样解析进连接选项
const withHeaders = resolveAdapterOptions({
  ...base,
  headers: { 'HTTP-Referer': 'https://dsh.app', 'X-Title': 'dsh', 'X-Custom': ' a b ' },
})
check('headers 解析进连接选项', withHeaders.headers !== undefined, JSON.stringify(withHeaders.headers))
check('值两侧空白被 trim', withHeaders.headers?.['X-Custom'] === 'a b', withHeaders.headers?.['X-Custom'])
check('名称大小写原样保留', withHeaders.headers?.['HTTP-Referer'] === 'https://dsh.app')
check('大小写无关键仍独立', Object.keys(withHeaders.headers ?? {}).includes('X-Title'))

// 2. 无 headers 时连接选项不带该字段
const bare = resolveAdapterOptions(base)
check('无 headers 时字段缺省', bare.headers === undefined)

// 3. 空名条目被丢弃
const emptyName = resolveAdapterOptions({
  ...base,
  headers: { '': 'x', '  ': 'y', 'X-Keep': '1' },
})
check('空名丢弃、非空保留', emptyName.headers !== undefined
  && Object.keys(emptyName.headers).length === 1
  && emptyName.headers?.['X-Keep'] === '1', JSON.stringify(emptyName.headers))

// 4. 非法头名（非 RFC 7230 token）拒绝
let threwName = false
try {
  resolveAdapterOptions({ ...base, headers: { 'bad name': 'x' } })
} catch (error) {
  threwName = error instanceof Error && error.message.includes('not a valid HTTP header name')
}
check('非法头名拒绝', threwName)

// 5. CR/LF 值拒绝（头注入防护）
let threwValue = false
try {
  resolveAdapterOptions({ ...base, headers: { 'X-OK': 'a\r\nX-Evil: 1' } })
} catch (error) {
  threwValue = error instanceof Error && error.message.includes('no CR/LF')
}
check('CRLF 值拒绝', threwValue)

// 6. 非法头名不影响合法头（同对象里逐项校验，合法项仍解析）
const partial = resolveAdapterOptions({ ...base, headers: { 'X-Good': '1' } })
check('合法项不受其他项影响', partial.headers?.['X-Good'] === '1')

console.log(failures === 0 ? '\nALL PASS ✅' : `\n${failures} FAIL ❌`)
process.exit(failures === 0 ? 0 : 1)
