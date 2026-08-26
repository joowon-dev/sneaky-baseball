import {
  nextPitch, clampPitcherX, distanceRatio, PITCHER_X_BASE,
} from '../game/pitches.js'
import { createGame, startPitch, swing, tick, settle, idle, nextPitchAt, READY } from '../game/engine.js'
import { draw, layout, setKeyHint } from '../render/draw.js'
import { kitOf } from '../render/teams.js'

const RECORD_KEY = 'sneaky-baseball:record'
const PITCHER_KEY = 'sneaky-baseball:pitcherX'

const canvas = document.getElementById('stage')
const ctx = canvas.getContext('2d')

let state = createGame()
let size = { w: 0, h: 0 }
let savedBest = 0 // 저장해 둔 최고 비거리(m)
// ⌥을 누르고 있는 동안만 투수가 던진다. 브라우저로 열었을 땐 늘 켜져 있다.
let holding = !window.sneaky
// 타자·투수 유니폼. 안 고르면 예전처럼 검은 실루엣이다.
let kits = { batter: null, pitcher: null }
// 투수가 선 자리. 드래그로 옮기면 던지는 거리가 바뀌고 공이 오는 시간도 바뀐다.
let pitcherX = PITCHER_X_BASE
// 드래그 중인가 / 커서가 투수 위에 있나. 뒤엣것은 「잡을 수 있다」 표시에만 쓴다.
let dragging = false
let hovering = false
// 셸에 마지막으로 알린 히트박스. 매 프레임 브리지를 두드리지 않으려고 들고 있는다.
let sentHitbox = ''

function setPitcherX(x) {
  pitcherX = clampPitcherX(typeof x === 'number' ? x : Number(x))
}

function persistPitcherX() {
  if (window.sneaky?.savePitcherX) {
    window.sneaky.savePitcherX(pitcherX)
    return
  }
  try {
    localStorage.setItem(PITCHER_KEY, String(pitcherX))
  } catch {
    // 저장에 실패해도 게임은 계속된다.
  }
}

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
  state = startPitch(state, nextPitch(state.homeRuns, Math.random, distanceRatio(pitcherX)), now)
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

  draw(ctx, size.w, size.h, state, now, kits, pitcherX, hovering || dragging)
  reportHitbox()
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


// ── 투수 드래그 ────────────────────────────────────────────────────────────
// 셸은 **문만 여닫는다** — 커서가 아래 히트박스 안에 있고 수식키를 누르고 있는
// 그 순간에만 창의 클릭 통과를 끈다. 실제 드래그는 여기서 평범한 포인터 이벤트로 한다.

/** 투수를 잡을 수 있는 자리. 드래그 중에는 필드 전체로 넓힌다. */
function hitbox() {
  const box = layout(size.w, size.h)
  // 커서가 투수보다 빨리 움직이는 순간 문이 닫혀 드래그가 끊기면 안 된다.
  if (dragging) return box

  const cx = box.x + box.w * pitcherX
  const half = box.h * 0.16
  return { x: cx - half, y: box.y + box.h * 0.4, w: half * 2, h: box.h * 0.55 }
}

/**
 * 히트박스를 셸에 알려준다. 투수가 화면 어디에 그려지는지는 그리는 쪽만 알기
 * 때문에 게임이 알려줘야 한다.
 */
function reportHitbox() {
  if (!window.sneaky?.setHitbox) return
  const box = hitbox()
  const key = `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.w)},${Math.round(box.h)}`
  if (key === sentHitbox) return
  sentHitbox = key
  window.sneaky.setHitbox(box)
}

/** 화면 x(CSS 픽셀) → 필드 상자 가로 비율. */
function toPitcherX(clientX) {
  const box = layout(size.w, size.h)
  return (clientX - box.x) / box.w
}

function inHitbox(x, y) {
  const box = hitbox()
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h
}

canvas.addEventListener('pointerdown', (event) => {
  if (!inHitbox(event.clientX, event.clientY)) return
  dragging = true
  canvas.setPointerCapture(event.pointerId)
  setPitcherX(toPitcherX(event.clientX))
  event.preventDefault()
})

canvas.addEventListener('pointermove', (event) => {
  if (dragging) setPitcherX(toPitcherX(event.clientX))
  else hovering = inHitbox(event.clientX, event.clientY)
})

canvas.addEventListener('pointerleave', () => {
  hovering = false
})

function endDrag(event) {
  if (!dragging) return
  dragging = false
  hovering = inHitbox(event.clientX, event.clientY)
  try {
    canvas.releasePointerCapture(event.pointerId)
  } catch {
    // 이미 놓였으면 그만이다.
  }
  persistPitcherX()
}

canvas.addEventListener('pointerup', endDrag)
canvas.addEventListener('pointercancel', endDrag)

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

  // 투수 자리는 셸이 저장한다. 다른 창구에서 바뀌면 그 자리에서 따라간다.
  window.sneaky.onPitcherX?.(setPitcherX)
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

  if (window.sneaky) setPitcherX(window.sneaky.pitcherX ?? PITCHER_X_BASE)
  else {
    try {
      setPitcherX(localStorage.getItem(PITCHER_KEY) ?? PITCHER_X_BASE)
    } catch {
      // 못 읽으면 기본 자리.
    }
  }

  resize()
  requestAnimationFrame(frame)
}

boot()
