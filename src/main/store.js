// userData/state.json 영속화. 실패해도 게임 진행을 막지 않는다.

const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')

// 창은 화면 작업 영역을 그대로 덮으므로 위치·크기는 저장하지 않는다.
const DEFAULTS = { record: { bestMeters: 0 } }

function file() {
  return path.join(app.getPath('userData'), 'state.json')
}

function read() {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'))
    return { ...DEFAULTS, ...raw, record: { ...DEFAULTS.record, ...raw.record } }
  } catch {
    return { ...DEFAULTS }
  }
}

function write(patch) {
  const next = { ...read(), ...patch }
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), JSON.stringify(next, null, 2))
  } catch (error) {
    console.warn('상태 저장 실패:', error.message)
  }
  return next
}

module.exports = { read, write }
