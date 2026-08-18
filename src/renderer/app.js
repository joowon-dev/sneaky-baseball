import { nextPitch } from '../game/pitches.js'
import { createGame, startPitch, swing, tick, settle, idle, nextPitchAt, READY } from '../game/engine.js'
import { draw, setKeyHint } from '../render/draw.js'
import { kitOf } from '../render/teams.js'

const RECORD_KEY = 'sneaky-baseball:record'

const canvas = document.getElementById('stage')
const ctx = canvas.getContext('2d')

let state = createGame()
let size = { w: 0, h: 0 }
let savedBest = 0 // 저장해 둔 최고 비거리(m)
// ⌥을 누르고 있는 동안만 투수가 던진다. 브라우저로 열었을 땐 늘 켜져 있다.
let holding = !window.sneaky
// 타자·투수 유니폼. 안 고르면 예전처럼 검은 실루엣이다.
let kits = { batter: null, pitcher: null }

function setKit(who, key) {
  if (who !== 'batter' && who !== 'pitcher') return
  kits = { ...kits, [who]: kitOf(key) }
}

function resize() {
  const dpr = window.devicePixelRatio || 1
  size = { w: canvas.clientWidth, h: canvas.clientHeight }
  canvas.width = Math.round(size.w * dpr)
  canvas.height = Math.round(size.h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function pitch(now) {
  state = startPitch(state, nextPitch(state.homeRuns), now)
}

/** 시작이든 스윙이든 키 하나로 들어온다. 누른 시각이 곧 판정 시각. */
function press() {
  const now = performance.now()
  if (state.phase === READY) pitch(now)
  else state = swing(state, now)
}

/** 손을 떼면 던지던 공을 거두고 대기로. */
function setHolding(down) {
  holding = down
  if (!holding) state = idle(state)
}

function frame() {
  const now = performance.now()

  state = tick(state, now)
  const settled = settle(state, now)
  if (settled !== state) {
    state = settled
    persistRecord()
  }
  // ⌥을 누르고 있고, 직전 타구가 다 굴러 멈췄으면 다음 공을 던진다.
  const due = !state.lastResult || now >= nextPitchAt(state)
  if (holding && state.phase === READY && due) pitch(now)

  draw(ctx, size.w, size.h, state, now, kits)
  requestAnimationFrame(frame)
}

/** Electron이면 userData 파일, 브라우저면 localStorage. */
async function loadRecord() {
  if (window.sneaky) return (await window.sneaky.getRecord()) ?? {}
  try {
    return JSON.parse(localStorage.getItem(RECORD_KEY)) ?? {}
  } catch {
    return {}
  }
}

function persistRecord() {
  if (state.bestMeters <= savedBest) return
  savedBest = state.bestMeters

  const record = { bestMeters: savedBest }
  if (window.sneaky) {
    window.sneaky.saveRecord(record)
    return
  }
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(record))
  } catch {
    // 저장에 실패해도 게임은 계속된다.
  }
}

// 오버레이는 포커스가 없어 키 이벤트가 오지 않는다 — 전역 단축키가 main을 거쳐 들어온다.
if (window.sneaky) {
  // 키 이름은 셸이 알려준다 — 맥은 ⌥, 윈도우는 Alt.
  setKeyHint(window.sneaky.keyHint ?? '⌥ 누르고 SPACE')
  window.sneaky.onSwing(press)
  // 트레이에서 조작키를 바꾸면 안내 문구도 그 자리에서 바뀐다.
  window.sneaky.onHint?.(setKeyHint)
  window.sneaky.onHold(setHolding)

  // 유니폼은 트레이 메뉴에서 고른다. 처음 값은 셸이 들고 있다가 브리지에 실어 준다.
  setKit('batter', window.sneaky.kits?.batter)
  setKit('pitcher', window.sneaky.kits?.pitcher)
  window.sneaky.onKit?.(setKit)
} else {
  // 브라우저에는 트레이 메뉴가 없다. 개발 중 확인용으로 쿼리 파라미터만 읽는다.
  // 예: index.html?batter=lg-home&pitcher=kia-away
  const params = new URLSearchParams(location.search)
  setKit('batter', params.get('batter'))
  setKit('pitcher', params.get('pitcher'))
}

// 브라우저에서 index.html만 열었을 때의 경로.
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space') return
  event.preventDefault()
  press()
})

window.addEventListener('resize', resize)

async function boot() {
  savedBest = (await loadRecord()).bestMeters ?? 0
  state = createGame({ bestMeters: savedBest })
  resize()
  requestAnimationFrame(frame)
}

boot()
