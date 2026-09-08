import {
  nextPitch, clampPitcherX, distanceRatio, PITCHER_X_BASE,
} from '../game/pitches.js'
import {
  createGame, startPitch, swing, tick, settle, idle, nextPitchAt, setPowerMul, READY,
} from '../game/engine.js'
import { draw, layout, setKeyHint } from '../render/draw.js'
import { kitOf } from '../render/teams.js'
import { batOf } from '../game/gear.js'
import { createWallet, earn, teamIdOf, powerMul as walletPowerMul } from '../game/wallet.js'
import {
  enqueueHit, headHit, dropHead, sendableHit, newSecret, defaultNickname,
} from '../game/sync.js'
import { registerPlayer, submitHit, randomBytes } from '../net/ranking.js'

const RECORD_KEY = 'sneaky-baseball:record'
const PITCHER_KEY = 'sneaky-baseball:pitcherX'
const WALLET_KEY = 'sneaky-baseball:wallet'

const canvas = document.getElementById('stage')
const ctx = canvas.getContext('2d')

let state = createGame()
let size = { w: 0, h: 0 }
let savedBest = { bestMeters: 0, bestGearedMeters: 0 } // 저장해 둔 최고 비거리(m)
// ⌥을 누르고 있는 동안만 투수가 던진다. 브라우저로 열었을 땐 늘 켜져 있다.
let holding = !window.sneaky
// 타자·투수 유니폼. 안 고르면 예전처럼 검은 실루엣이다.
let kits = { batter: null, pitcher: null }
// 유니폼 키('lotte-home')는 따로 들고 있는다 — 응원 포인트를 어느 구단에 넣을지가 여기서 나온다.
let kitKeys = { batter: null, pitcher: null }
// 지갑·응원·가진 배트. 앱이면 셸이, 브라우저면 localStorage 가 들고 있다.
let wallet = createWallet()
// 이미 점수를 준 타구. 결과 객체는 칠 때마다 새로 만들어지므로 같은 것인지로 가린다.
let lastAwarded = null
// 랭킹 신분과 아직 못 보낸 타구 줄. 셸이 저장하고, 여기서는 보낼 때만 쓴다.
let account = null
let pending = []
// 한 번에 하나만 올린다 — 겹쳐 보내면 같은 타구가 두 번 갈 수 있다.
let syncing = false
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
  kitKeys = { ...kitKeys, [who]: key ?? null }
}

/** 셸(또는 상점)이 바꾼 지갑을 받아 든다. 낀 배트가 바뀌면 힘 배수도 그 자리에서 갈린다. */
function setWallet(next) {
  wallet = createWallet(next)
  state = setPowerMul(state, walletPowerMul(wallet))
  // 랭킹 신분은 지갑과 같은 상자에 실려 온다.
  if (next?.account?.playerId && next.account.secret) account = next.account
  // **대기 줄은 여기서 안 받는다.** 셸이 지갑을 되밀 때(pushGear) 실려 오는 줄은
  // 방금 넣은 타구가 아직 저장되기 전의 옛 줄이라, 받아 적으면 그 타구가 사라진다.
  // 줄의 정본은 이 창이 들고 있고, 셸은 저장만 한다. 처음 한 번만 boot 에서 읽는다.
}

function savePending() {
  window.sneaky?.savePending?.(pending)
  if (!window.sneaky) persistWallet()
}

/**
 * 줄에 선 타구를 앞에서부터 하나씩 올린다.
 *
 * **점수는 안 보낸다** — 무슨 결과를 몇 미터 쳤는지만 보내고 서버가 매긴다.
 * 클라이언트가 계산한 점수를 그대로 받아 적게 두면, 앱을 뜯은 사람이 아무 값이나 넣는다.
 *
 * 실패하면 줄에 그대로 두고 물러난다 — 랭킹이 안 되는 것과 게임이 안 되는 것은 다른 일이다.
 * 다음 타구를 칠 때나 1분 뒤에 다시 올린다.
 */
async function flushHits() {
  if (syncing || pending.length === 0) return
  syncing = true

  try {
    // 처음 올리는 순간에 신분을 만든다. 안 치는 사람은 서버에 흔적조차 안 남는다.
    if (!account) {
      const secret = newSecret(randomBytes)
      const nickname = defaultNickname(randomBytes)
      const playerId = await registerPlayer(nickname, secret)
      account = { playerId, secret, nickname }
      window.sneaky?.saveAccount?.(account)
    }

    while (pending.length > 0) {
      const hit = headHit(pending)
      // 모양이 틀린 것은 서버에 헛걸음하지 말고 여기서 버린다.
      if (sendableHit(hit)) {
        await submitHit(account.playerId, account.secret, hit.team, hit.result, hit.meters)
        // 서버에 합산됐다. 열려 있는 랭킹이 그 자리에서 바뀌어야 한다.
        window.sneaky?.scored?.()
      }
      pending = dropHead(pending)
      savePending()
    }
  } catch {
    // 줄은 그대로 둔다. 다음 차례에 앞에서부터 다시 올라간다.
  } finally {
    syncing = false
  }
}

function persistWallet() {
  try {
    localStorage.setItem(WALLET_KEY, JSON.stringify({ ...wallet, account, pending }))
  } catch {
    // 저장에 실패해도 게임은 계속된다.
  }
}

/**
 * 방금 난 결과에 점수를 준다. 지갑과 응원에 같은 값이 들어간다.
 * **셸이 있으면 셸이 원장이다** — 여기서 번 값만 알리고, 되돌아오는 값을 정본으로 삼는다.
 * 그래야 상점 창에서 산 배트와 여기서 번 포인트가 서로를 덮어쓰지 않는다.
 */
function award() {
  const res = state.lastResult
  if (!res || res === lastAwarded) return
  lastAwarded = res

  const team = teamIdOf(kitKeys.batter)
  const { wallet: next, gained } = earn(wallet, res.result, res.meters, team)
  if (gained === 0) return

  wallet = next
  if (window.sneaky?.earn) window.sneaky.earn({ points: gained, team })
  else persistWallet()

  // **친 그 자리에서 바로 올린다.** 유니폼을 안 입었으면 적립할 구단이 없어 안 보낸다.
  if (!team) return
  pending = enqueueHit(pending, { team, result: res.result, meters: res.meters })
  savePending()
  flushHits()
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

  award()
  draw(ctx, size.w, size.h, state, now, kits, pitcherX, hovering || dragging,
    { bat: batOf(wallet.equipped), points: wallet.points })
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

/** 앱이면 셸이 들고 있는 값, 브라우저면 localStorage. */
async function loadWallet() {
  if (window.sneaky) return window.sneaky.gear ?? {}
  try {
    return JSON.parse(localStorage.getItem(WALLET_KEY)) ?? {}
  } catch {
    return {}
  }
}

function persistRecord() {
  // 기록이 둘이다 — 맨몸(bestMeters)과 장비(bestGearedMeters). 둘 중 하나라도 오르면 쓴다.
  if (state.bestMeters <= savedBest.bestMeters
    && state.bestGearedMeters <= savedBest.bestGearedMeters) return
  savedBest = { bestMeters: state.bestMeters, bestGearedMeters: state.bestGearedMeters }

  const record = { ...savedBest }
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

  // 지갑도 셸이 저장한다. 상점 창에서 배트를 사면 여기로 밀려 들어온다.
  window.sneaky.onGear?.(setWallet)
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
  const record = await loadRecord()
  savedBest = {
    bestMeters: record.bestMeters ?? 0,
    // 장비 기록이 없던 시절에 저장된 값에는 맨몸 기록만 있다 — 그게 곧 장비 기록이기도 하다.
    bestGearedMeters: record.bestGearedMeters ?? record.bestMeters ?? 0,
  }
  state = createGame({ ...savedBest })

  const gear = await loadWallet()
  // 지난번에 못 보내고 남은 타구. 이 뒤로는 이 창이 줄의 정본이다.
  pending = Array.isArray(gear.pending) ? [...gear.pending] : []
  setWallet(gear)
  flushHits()

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

// 못 보내고 줄에 남은 것을 1분마다 다시 올린다. 평소에는 칠 때마다 바로 올라가므로
// 이 타이머는 **네트워크가 끊겼다 돌아왔을 때만** 할 일이 있다.
setInterval(flushHits, 60 * 1000)

boot()
