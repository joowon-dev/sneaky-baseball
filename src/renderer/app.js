import { nextPitch } from '../game/pitches.js'
import { createGame, startPitch, swing, tick, settle, READY } from '../game/engine.js'
import { draw, setKeyHint } from '../render/draw.js'

const RECORD_KEY = 'sneaky-baseball:record'

const canvas = document.getElementById('stage')
const ctx = canvas.getContext('2d')

let state = createGame()
let size = { w: 0, h: 0 }
let savedBest = 0

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

function frame() {
  const now = performance.now()

  state = tick(state, now)
  const settled = settle(state, now)
  if (settled !== state) {
    state = settled
    persistRecord()
  }
  // 첫 공과, 계속 거른 뒤의 공은 사용자가 키를 누를 때까지 기다린다.
  if (state.phase === READY && state.pitch) pitch(now)

  draw(ctx, size.w, size.h, state, now)
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
  if (state.bestStreak <= savedBest) return
  savedBest = state.bestStreak

  const record = { bestStreak: savedBest }
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
  setKeyHint('⌥Space')
  window.sneaky.onSwing(press)
}

// 브라우저에서 index.html만 열었을 때의 경로.
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space') return
  event.preventDefault()
  press()
})

window.addEventListener('resize', resize)

async function boot() {
  savedBest = (await loadRecord()).bestStreak ?? 0
  state = createGame({ bestStreak: savedBest })
  resize()
  requestAnimationFrame(frame)
}

boot()
