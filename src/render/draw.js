// 한 프레임을 그린다. 상태를 바꾸지 않는다.
// 측면 2D 뷰: 왼쪽에 타자, 오른쪽에 투수. 공은 오른쪽에서 날아오고, 맞으면 오른쪽으로 날아간다.
//
// 배경이 없는 전체 화면 오버레이라 좌표계가 둘이다.
//   1. 필드 좌표 — 화면 왼쪽 아래에 고정된 900×300 상자. 선수·지면·담장·투구가 여기 산다.
//   2. 화면 좌표 — 맞은 공만. 상자를 벗어나 작업 중인 창 위로 솟구친다.

import { ballPosition } from '../game/pitches.js'
import { battedFlight, battedBall, travel, TIME_SCALE } from '../game/batted.js'
import { READY, PITCHING, RESULT, RESULT_MS, WINDUP_MS, progress } from '../game/engine.js'
import { HOMERUN, LABELS, WINDOWS } from '../game/judge.js'
import {
  drawFigure, batterStance, batterSwing, pitcherWindup, pitcherRelease,
} from './sprites.js'

// 투명한 배경 위 검은 실루엣. 어두운 앱 위에서도 읽히도록 흰 번짐을 깔고 그린다.
const INK = '#101013'
const DIM = 'rgba(16, 16, 19, 0.4)'
const SOFT = 'rgba(16, 16, 19, 0.6)'
const HALO = 'rgba(255, 255, 255, 0.92)'

// 필드 좌표는 0..1 비율. x는 왼쪽(백네트)에서 오른쪽(외야)으로.
const GROUND_Y = 0.92
const BACKSTOP_X = 0.07 // 헛친 공이 굴러가 사라지는 자리
const BATTER_X = 0.19
const PITCHER_X = 0.87
const BATTER_H = 0.62
const PITCHER_H = 0.5

// 담장. 필드 상자가 아니라 타구 좌표에 산다 — 넘기면 홈런인 그 선.
// 퍼펙트 타이밍(캐리 2.8)은 넘고, 굿 타이밍 경계(캐리 1.9)는 못 넘는 자리.
const FENCE_CARRY = 2.3
const FENCE_H = 0.16 // 화면 높이 대비

// 화면 왼쪽 아래 구석에 놓이는 필드 상자. 작을수록 눈에 덜 띈다 —
// 타구는 이 상자와 무관하게 화면 크기로 날아가므로 상자만 줄이면 된다.
const FIELD_W = 240
const FIELD_H = 78
const MARGIN_X = 16
const MARGIN_Y = 8

// 타구 세로 단위는 화면 높이. 가로 단위는 "가장 멀리 가는 타구가 여기까지"에 맞춘다 —
// 그래서 공은 화면 밖으로 나가지 않고 화면 안에서 튀다 선다.
const FLIGHT_FAR_EDGE = 0.9
const MAX_LANE = 0.06 // 가장 높은 공(가장 멀리 나가는 각도). pitches.js의 LANE_SPREAD 절반

// 공 뒤에 남는 잔상의 길이 (궤적 시간 기준). 점이 아니라 한 줄로 잇는다.
const TRAIL_MS = 130

const BASE_H = 320 // 이 높이를 기준으로 글자·여백을 비례시킨다
const PASSED_MS = 280 // 헛스윙한 공이 포수 미트에 닿기까지

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

let keyHint = 'SPACE'

/** 시작 안내에 띄울 키 이름. Electron이면 전역 단축키 이름으로 바꿔 끼운다. */
export function setKeyHint(label) {
  keyHint = label
}

// 상자는 작아도 글자와 공은 읽을 수 있어야 한다 — 비례하되 바닥을 둔다.
function metrics(height) {
  const k = clamp(height / BASE_H, 0.25, 2.4)
  return {
    k,
    small: Math.max(10, 11 * k),
    label: Math.max(12, 15 * k),
    big: Math.max(16, 22 * k),
    ballR: Math.max(3, 4.5 * k),
    tick: Math.max(6, 14 * k),
    glow: Math.max(4, 5 * k),
  }
}

/** 화면 왼쪽 아래에 붙는 필드 상자. */
function layout(width, height) {
  const w = Math.min(FIELD_W, width - MARGIN_X * 2)
  const h = Math.min(FIELD_H, height * 0.42)
  return { x: MARGIN_X, y: height - MARGIN_Y - h, w, h }
}

export function draw(ctx, width, height, state, now) {
  ctx.clearRect(0, 0, width, height)

  const field = layout(width, height)
  const ui = metrics(field.h)
  const spot = geometry(field)
  const space = flightSpace(field, spot, width, height)

  // 지면과 담장은 타구가 지나가는 범위 전체에 걸친다 — 화면 좌표.
  drawGround(ctx, field, spot, ui, space)

  ctx.save()
  ctx.translate(field.x, field.y)
  ctx.fillStyle = INK
  ctx.strokeStyle = INK

  drawScore(ctx, field, ui, state)
  drawContactMark(ctx, spot, ui, state, now)
  drawPeople(ctx, field, spot, ui, state, now)

  if (state.phase === PITCHING) drawPitchedBall(ctx, field, spot, ui, state, now)

  drawVerdict(ctx, field, ui, state, now)
  if (state.phase === READY && !state.pitch) drawHint(ctx, field, ui, now)
  ctx.restore()

  // 맞은 공만 상자 밖 — 화면 전체를 쓴다. 페이즈와 무관하게 제 수명만큼 굴러간다.
  if (state.lastResult) drawFlight(ctx, field, spot, ui, space, state, now)
}

/**
 * 타구를 화면에 앉히는 좌표계. 세로 단위는 화면 높이,
 * 가로 단위는 "가장 멀리 가는 타구가 화면 폭 FLIGHT_FAR_EDGE 지점에 멈추도록" 역산한다.
 */
function flightSpace(field, spot, screenW, screenH) {
  const unitY = screenH
  // 타격점이 땅에서 떠 있는 높이 — 공은 이만큼 더 떨어져야 땅에 닿고, 거기서 튄다.
  const launchDy = (spot.ground - spot.contact.y) / unitY
  const origin = { x: field.x + spot.contact.x, y: field.y + spot.contact.y }
  const far = travel(battedFlight(HOMERUN, 0, -MAX_LANE, launchDy))
  const farX = screenW * FLIGHT_FAR_EDGE

  return {
    origin,
    unitY,
    launchDy,
    farX,
    unitX: (farX - origin.x) / far,
    ground: field.y + spot.ground,
  }
}

/** 필드 비율을 픽셀 좌표로 한 번에 풀어둔다. */
function geometry(field) {
  const ground = field.h * GROUND_Y
  const batterH = field.h * BATTER_H
  const pitcherH = field.h * PITCHER_H

  return {
    ground,
    batterH,
    pitcherH,
    contact: { x: field.w * (BATTER_X + 0.06), y: ground - batterH * 0.52 },
    release: { x: field.w * (PITCHER_X - 0.06), y: ground - pitcherH * 0.88 },
  }
}

/** 상단 바가 없어졌으니 기록은 필드 왼쪽 위에 한 줄로. */
function drawScore(ctx, field, ui, state) {
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = `600 ${ui.small}px ui-monospace, SFMono-Regular, Menlo, monospace`
  ctx.shadowColor = HALO
  ctx.shadowBlur = ui.glow
  ctx.fillStyle = SOFT

  const score = `홈런 ${state.homeRuns}   연속 ${state.streak}   최고 ${state.bestStreak}`
  for (let i = 0; i < 3; i += 1) ctx.fillText(score, 0, 0)
  ctx.restore()
}

/** 지면과 담장. 공이 굴러가는 데까지 이어지므로 필드 상자가 아니라 화면 좌표에 그린다. */
function drawGround(ctx, field, spot, ui, space) {
  ctx.save()
  ctx.shadowColor = HALO
  ctx.shadowBlur = ui.glow
  ctx.lineWidth = Math.max(1, ui.k)
  ctx.strokeStyle = DIM

  // 지면 — 타자 발밑부터 공이 멈추는 데까지.
  ctx.beginPath()
  ctx.moveTo(field.x, space.ground)
  ctx.lineTo(space.farX, space.ground)
  ctx.stroke()
  ctx.stroke()

  // 담장 — 이 선을 넘겨야 홈런.
  const fenceX = space.origin.x + FENCE_CARRY * space.unitX
  ctx.setLineDash([3 * ui.k, 4 * ui.k])
  ctx.beginPath()
  ctx.moveTo(fenceX, space.ground)
  ctx.lineTo(fenceX, space.ground - FENCE_H * space.unitY)
  ctx.stroke()
  ctx.stroke()
  ctx.restore()
}

/** 타격점 표시. 공이 굿 윈도우 안에 들어오면 진해진다. */
function drawContactMark(ctx, spot, ui, state, now) {
  const hot = state.phase === PITCHING && Math.abs(now - state.plateAt) <= WINDOWS.good

  ctx.save()
  ctx.shadowColor = HALO
  ctx.shadowBlur = ui.glow
  ctx.lineWidth = Math.max(1, ui.k * (hot ? 2 : 1))
  ctx.strokeStyle = hot ? INK : DIM
  ctx.beginPath()
  ctx.moveTo(spot.contact.x, spot.contact.y - ui.tick)
  ctx.lineTo(spot.contact.x, spot.contact.y + ui.tick)
  ctx.stroke()
  ctx.stroke()
  ctx.restore()
}

function drawPeople(ctx, field, spot, ui, state, now) {
  // 타자는 오른쪽(투수)을 본다 — 그래서 좌우 반전.
  const swung = state.phase === RESULT && state.lastResult?.timing !== 'take'
  const recovered = swung && now - state.resultAt > RESULT_MS
  const pose = swung && !recovered ? batterSwing : batterStance

  drawFigure(ctx, pose, field.w * BATTER_X, spot.ground, spot.batterH, -1, ui.glow)

  const throwing = state.phase === PITCHING
  const pitcher = throwing ? pitcherRelease : pitcherWindup
  drawFigure(ctx, pitcher, field.w * PITCHER_X, spot.ground, spot.pitcherH, 1, ui.glow)
}

function ball(ctx, x, y, r, ui, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = INK
  ctx.shadowColor = HALO
  ctx.shadowBlur = ui.glow
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fill()
  ctx.restore()
}

function drawPitchedBall(ctx, field, spot, ui, state, now) {
  const t = progress(state, now)

  for (const back of [0.07, 0.035, 0]) {
    const { travel, offset } = ballPosition(state.pitch, t - back)
    const x = spot.release.x + (spot.contact.x - spot.release.x) * travel
    const y = spot.release.y + (spot.contact.y - spot.release.y) * travel + offset * field.h
    ball(ctx, x, y, ui.ballR, ui, back === 0 ? 1 : 0.2)
  }
}

/**
 * 결과 뒤의 공 — 맞았으면 화면 좌표의 포물선, 헛스윙이면 포수 미트로.
 * 화면 좌표로 그리므로 필드 상자를 벗어나 작업 중인 창 위를 가로지른다.
 */
function drawFlight(ctx, field, spot, ui, space, state, now) {
  const age = now - state.resultAt
  const { result, errorMs, lane } = state.lastResult
  const flight = battedFlight(result, errorMs, lane ?? 0, space.launchDy)

  if (!flight) {
    drawPassedBall(ctx, field, spot, ui, age)
    return
  }

  // 궤적 상의 시각. 실제로 흐른 시간보다 느리게 간다.
  const flightAge = age * TIME_SCALE
  const at = (t) => {
    const p = battedBall(flight, t)
    return p && { x: space.origin.x + p.dx * space.unitX, y: space.origin.y - p.dy * space.unitY }
  }

  // 다 구르고 멈춘 공은 그 자리에서 서서히 사라진다.
  const fade = clamp((flight.lifeMs - flightAge) / flight.fadeMs, 0, 1)

  drawTrail(ctx, at, flightAge, ui, fade)

  const head = at(flightAge)
  if (head) ball(ctx, head.x, head.y, ui.ballR, ui, fade)
}

/** 공이 지나온 자리를 한 줄로 잇는다. 점을 띄엄띄엄 찍으면 공이 여러 개로 보인다. */
function drawTrail(ctx, at, flightAge, ui, fade) {
  ctx.save()
  ctx.globalAlpha = 0.22 * fade
  ctx.strokeStyle = INK
  ctx.lineWidth = ui.ballR * 1.1
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.shadowColor = HALO
  ctx.shadowBlur = ui.glow

  ctx.beginPath()
  let started = false
  for (let back = TRAIL_MS; back > 0; back -= 8) {
    const p = at(flightAge - back)
    if (!p) continue
    if (started) ctx.lineTo(p.x, p.y)
    else {
      ctx.moveTo(p.x, p.y)
      started = true
    }
  }
  if (started) ctx.stroke()
  ctx.restore()
}

/** 헛친 공은 타자 뒤로 빠져 사라진다. */
function drawPassedBall(ctx, field, spot, ui, age) {
  if (age > PASSED_MS) return
  const t = age / PASSED_MS
  const x = spot.contact.x + (field.w * BACKSTOP_X - spot.contact.x) * t
  ctx.save()
  ctx.translate(field.x, field.y)
  ball(ctx, x, spot.contact.y + t * ui.tick * 0.6, ui.ballR, ui, 1 - t * 0.5)
  ctx.restore()
}

/** 첫 공을 기다리는 동안만 보이는 안내. 천천히 숨을 쉰다. */
function drawHint(ctx, field, ui, now) {
  ctx.save()
  ctx.globalAlpha = 0.45 + 0.3 * Math.sin(now / 500)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = INK
  ctx.font = `500 ${ui.label}px ui-monospace, Menlo, monospace`
  ctx.shadowColor = HALO
  ctx.shadowBlur = ui.glow
  const text = `${keyHint} 로 시작`
  for (let i = 0; i < 3; i += 1) ctx.fillText(text, field.w * 0.5, field.h * 0.24)
  ctx.restore()
}

function drawVerdict(ctx, field, ui, state, now) {
  if (state.phase !== RESULT) return

  const age = now - state.resultAt
  const life = RESULT_MS + WINDUP_MS * 0.5
  if (age > life) return

  const { result, timing, errorMs } = state.lastResult
  const big = result === HOMERUN

  ctx.save()
  ctx.globalAlpha = Math.max(0, 1 - age / life)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = HALO
  ctx.shadowBlur = ui.glow

  // 상자가 작으니 기록 줄 아래로 내려 겹치지 않게 둔다. 폭을 넘어가도 배경이 없어 괜찮다.
  const x = field.w * 0.3
  const y = field.h * 0.34 - Math.min(10 * ui.k, age * 0.02)

  ctx.fillStyle = INK
  ctx.font = `700 ${big ? ui.big : ui.label}px ui-rounded, "Helvetica Neue", sans-serif`
  for (let i = 0; i < 3; i += 1) ctx.fillText(LABELS[result], x, y)
  const labelWidth = ctx.measureText(LABELS[result]).width

  ctx.fillStyle = SOFT
  ctx.font = `500 ${ui.small}px ui-monospace, Menlo, monospace`
  const sub = subtitle(result, timing, errorMs)
  for (let i = 0; i < 3; i += 1) ctx.fillText(sub, x + labelWidth + 8 * ui.k, y + 1)

  ctx.restore()
}

function subtitle(result, timing, errorMs) {
  if (result === HOMERUN) return 'PERFECT'
  if (timing === 'take') return '가만히 있었다'
  return `${Math.abs(Math.round(errorMs))}ms ${timing === 'early' ? '빠름' : '늦음'}`
}
