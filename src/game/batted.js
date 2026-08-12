// 맞은 공의 궤적. 순수 모듈.
// 좌표 단위는 둘 다 "필드 높이" — dx는 타격점에서 오른쪽으로, dy는 위로.
// 공은 땅에 닿으면 한 번 튀어오르고, 힘이 빠지면 그 자리에 선다.

import { FOUL, WHIFF, WINDOWS } from './judge.js'

export const GRAVITY = 9 // 필드 높이 / 초²

const LAUNCH_DEG = 32 // 퍼펙트 타이밍의 발사각
const MIN_DEG = 8
const MAX_DEG = 62
const MAX_SPEED = 5.3 // 필드 높이 / 초
const MIN_SPEED_RATIO = 0.35
const DEG_PER_MS = 0.11 // 타이밍 1ms가 발사각을 바꾸는 정도
const DEG_PER_LANE = 40 // 낮은 공일수록 각도가 깎인다
const FOUL_SPEED_RATIO = -0.5 // 파울은 뒤로, 힘도 빠진다

const BOUNCE = 0.42 // 땅에 부딪히고 남는 수직 속도
const BOUNCE_DRAG = 0.72 // 튈 때마다 앞으로 가는 속도도 깎인다
const MIN_BOUNCE_VY = 0.55 // 이보다 약하게 튀면 그냥 선다
const MAX_HOPS = 4
const SETTLE_MS = 150 // 멈춘 공을 잠깐 더 보여주는 여유

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * 타이밍 오차와 공의 높낮이로 타구를 만든다. 오차가 연속적으로 반영되므로
 * 같은 홈런도 매번 다른 궤적을 그린다. 헛스윙은 null.
 *
 * launchDy는 타격점이 땅에서 떠 있는 높이. 공은 그 높이만큼 더 떨어져야 땅에 닿고,
 * 튀는 것도 땅에서 튄다.
 */
export function battedFlight(result, errorMs, lane = 0, launchDy = 0) {
  if (result === WHIFF) return null

  const off = clamp(errorMs ?? 0, -WINDOWS.foul, WINDOWS.foul)
  const power = 1 - Math.abs(off) / WINDOWS.foul
  const speed = MAX_SPEED * (MIN_SPEED_RATIO + (1 - MIN_SPEED_RATIO) * power)

  // 빠르게 휘두르면 퍼올려 뜨고, 늦으면 낮게 깔린다.
  const deg = clamp(LAUNCH_DEG - off * DEG_PER_MS - lane * DEG_PER_LANE, MIN_DEG, MAX_DEG)
  const rad = (deg * Math.PI) / 180

  const vy = speed * Math.sin(rad)
  const vx = speed * Math.cos(rad) * (result === FOUL ? FOUL_SPEED_RATIO : 1)

  const hops = buildHops(vx, vy, launchDy)
  const last = hops[hops.length - 1]

  return { vx, vy, launchDy, hops, lifeMs: Math.round(last.startMs + last.durMs) + SETTLE_MS }
}

/**
 * 땅에 닿을 때마다 하나씩. 각 구간은 땅 높이(y=0)를 기준으로 한 포물선이다.
 * y0는 그 구간이 시작하는 높이 — 첫 구간만 타격 높이에서 시작하고 나머지는 0.
 */
function buildHops(vx, vy, launchDy) {
  const hops = []
  let startMs = 0
  let x = 0
  let y = launchDy
  let up = vy
  let along = vx

  for (let i = 0; i < MAX_HOPS; i += 1) {
    // 땅에 닿는 순간의 낙하 속도. 여기서 이번 구간의 길이가 나온다.
    const impact = Math.sqrt(Math.max(0, up * up + 2 * GRAVITY * y))
    const dur = (up + impact) / GRAVITY

    hops.push({ startMs, durMs: dur * 1000, x0: x, y0: y, vx: along, vy: up })

    startMs += dur * 1000
    x += along * dur
    up = impact * BOUNCE
    along *= BOUNCE_DRAG
    y = 0

    if (up < MIN_BOUNCE_VY) break
  }

  return hops
}

/** 맞은 뒤 ageMs가 지난 시점의 위치. 수명이 지나면 null. */
export function battedBall(flight, ageMs) {
  if (!flight || ageMs < 0 || ageMs > flight.lifeMs) return null

  const hop = hopAt(flight.hops, ageMs)
  // 마지막 구간이 끝난 뒤(SETTLE)에는 그 자리에 멈춰 있는다.
  const s = Math.min(ageMs - hop.startMs, hop.durMs) / 1000

  return {
    dx: hop.x0 + hop.vx * s,
    dy: hop.y0 + hop.vy * s - 0.5 * GRAVITY * s * s - flight.launchDy,
  }
}

function hopAt(hops, ageMs) {
  for (let i = hops.length - 1; i >= 0; i -= 1) {
    if (ageMs >= hops[i].startMs) return hops[i]
  }
  return hops[0]
}

/** 타구가 처음 땅에 닿을 때까지 간 거리 — 궤적 비교용. */
export function carry(flight) {
  if (!flight) return 0
  const first = flight.hops[0]
  return first.vx * (first.durMs / 1000)
}

/** 튄 것까지 더해 공이 최종적으로 멈추는 거리. 화면 폭을 맞출 때 쓴다. */
export function travel(flight) {
  if (!flight) return 0
  const last = flight.hops[flight.hops.length - 1]
  return last.x0 + last.vx * (last.durMs / 1000)
}
