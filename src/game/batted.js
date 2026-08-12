// 맞은 공의 궤적. 순수 모듈.
// 좌표 단위는 둘 다 "필드 높이" — dx는 타격점에서 오른쪽으로, dy는 위로.

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

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * 타이밍 오차와 공의 높낮이로 타구를 만든다. 오차가 연속적으로 반영되므로
 * 같은 홈런도 매번 다른 궤적을 그린다. 헛스윙은 null.
 */
export function battedFlight(result, errorMs, lane = 0) {
  if (result === WHIFF) return null

  const off = clamp(errorMs ?? 0, -WINDOWS.foul, WINDOWS.foul)
  const power = 1 - Math.abs(off) / WINDOWS.foul
  const speed = MAX_SPEED * (MIN_SPEED_RATIO + (1 - MIN_SPEED_RATIO) * power)

  // 빠르게 휘두르면 퍼올려 뜨고, 늦으면 낮게 깔린다.
  const deg = clamp(LAUNCH_DEG - off * DEG_PER_MS - lane * DEG_PER_LANE, MIN_DEG, MAX_DEG)
  const rad = (deg * Math.PI) / 180

  const vy = speed * Math.sin(rad)
  const vx = speed * Math.cos(rad) * (result === FOUL ? FOUL_SPEED_RATIO : 1)

  return { vx, vy, lifeMs: Math.round(((2 * vy) / GRAVITY) * 1000) + 260 }
}

/** 맞은 뒤 ageMs가 지난 시점의 위치. 수명이 지나면 null. */
export function battedBall(flight, ageMs) {
  if (!flight || ageMs < 0 || ageMs > flight.lifeMs) return null

  const s = ageMs / 1000
  return {
    dx: flight.vx * s,
    dy: flight.vy * s - 0.5 * GRAVITY * s * s,
  }
}

/** 타구가 타격 높이로 돌아올 때까지 간 거리 — 궤적 비교용. */
export function carry(flight) {
  if (!flight) return 0
  return (flight.vx * 2 * flight.vy) / GRAVITY
}
