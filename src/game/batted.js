// 맞은 공의 궤적. 순수 모듈.
// 좌표 단위는 둘 다 "필드 높이" — dx는 타격점에서 오른쪽으로, dy는 위로.
// 공은 땅에 닿으면 한 번 튀어오르고, 힘이 빠지면 그 자리에 선다.

import { FOUL, WHIFF, WINDOWS } from './judge.js'

export const GRAVITY = 9 // 필드 높이 / 초²

/** 필드 높이 1 = 몇 미터인가. 비거리를 사람이 아는 단위로 보여주려고 둔다. */
export const METERS_PER_UNIT = 45

/**
 * 궤적 시간 → 실제 시간 배율. 1보다 작으면 실제로는 더 느리게 흐른다.
 * 날아가는 공을 눈으로 따라갈 수 있게 늦춰 뒀다. 그리는 쪽과 투구 간격이 같은 값을 쓴다.
 */
export const TIME_SCALE = 0.65

const LAUNCH_DEG = 32 // 퍼펙트 타이밍의 발사각
const MIN_DEG = 8
const MAX_DEG = 62
const MAX_SPEED = 5.9 // 필드 높이 / 초
const MIN_SPEED_RATIO = 0.35
const POWER_CURVE = 1.25 // 클수록 완벽한 타이밍만 멀리 간다
const DEG_PER_MS = 0.11 // 타이밍 1ms가 발사각을 바꾸는 정도
const DEG_PER_LANE = 40 // 낮은 공일수록 각도가 깎인다
const FOUL_SPEED_RATIO = -0.5 // 파울은 뒤로, 힘도 빠진다

const BOUNCE = 0.42 // 땅에 부딪히고 남는 수직 속도
// 튀고 구르는 거리를 바짝 줄인다 — 전체 거리의 91%가 날아간 거리(캐리)여야
// 홈런이 화면 반대편 끝에 "떨어지는" 것으로 보인다. 튀는 높이는 그대로라,
// 공은 끝에서 제자리에 가깝게 통통 튀고 선다.
const BOUNCE_DRAG = 0.22 // 튈 때마다 앞으로 가는 속도가 깎이는 비율
const MIN_BOUNCE_VY = 0.25 // 이보다 약하게 튀면 더 튀지 않고 구르기 시작한다
const MAX_HOPS = 5
const ROLL_DECEL = 12 // 구를 때의 감속 (필드 높이 / 초²)
const FADE_MS = 350 // 멈춘 공이 사라지기까지

/**
 * 담장. 뚫리지 않는 벽이다 — 넘어가면 홈런, 맞으면 튕겨 나온다.
 * 판정 기준이자 화면에 그리는 그 선이라, 보이는 대로 판정된다.
 */
// 타격점에서 담장까지. 힘의 상한을 올리면 홈런이 그만큼 쉬워지므로 담장도 같이 물렸다 —
// 넘기는 타이밍 여유는 예전 그대로(가운데 공 13ms)고, 잘 맞은 타구만 더 멀리 간다.
export const FENCE_DIST = 2.8
export const FENCE_H = 0.09 // 담장 높이. 여기를 넘겨야 홈런

/**
 * 타격점이 땅에서 떠 있는 높이. 공은 이만큼 더 떨어져야 땅에 닿고, 거기서 튄다.
 * 판정에 들어가는 값이므로 상수다 — 그리는 쪽도 이 값을 그대로 써야
 * 화면에서 담장을 넘긴 공이 홈런으로 판정된다.
 */
export const LAUNCH_DY = 0.023
const WALL_BOUNCE = 0.45 // 담장에 맞고 남는 속도

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * 타이밍 오차와 공의 높낮이로 타구를 만든다. 오차가 연속적으로 반영되므로
 * 같은 홈런도 매번 다른 궤적을 그린다. 헛스윙은 null.
 *
 * launchDy는 타격점 높이 — 기본값(LAUNCH_DY)을 쓰면 판정과 그림이 같은 궤적을 본다.
 */
export function battedFlight(result, errorMs, lane = 0, launchDy = LAUNCH_DY) {
  if (result === WHIFF) return null

  const off = clamp(errorMs ?? 0, -WINDOWS.foul, WINDOWS.foul)
  // 힘은 오차에 **선형이 아니라 더 가파르게** 빠진다. 선형으로 두면 천장을 올린 만큼
  // 어중간하게 맞힌 타구까지 같이 멀리 가서, 잘 맞힌 보람이 없다.
  const power = (1 - Math.abs(off) / WINDOWS.foul) ** POWER_CURVE
  const speed = MAX_SPEED * (MIN_SPEED_RATIO + (1 - MIN_SPEED_RATIO) * power)

  // 빠르게 휘두르면 퍼올려 뜨고, 늦으면 낮게 깔린다.
  const deg = clamp(LAUNCH_DEG - off * DEG_PER_MS - lane * DEG_PER_LANE, MIN_DEG, MAX_DEG)
  const rad = (deg * Math.PI) / 180

  const vy = speed * Math.sin(rad)
  const vx = speed * Math.cos(rad) * (result === FOUL ? FOUL_SPEED_RATIO : 1)

  const { hops, over, overAtMs } = buildPath(vx, vy, launchDy)
  const roll = buildRoll(hops, over)

  return {
    vx,
    vy,
    launchDy,
    over,
    overAtMs,
    hops,
    roll,
    lifeMs: Math.round(roll.startMs + roll.durMs) + FADE_MS,
    fadeMs: FADE_MS,
  }
}

/**
 * 공이 땅이나 담장에 부딪힐 때마다 구간 하나. 각 구간은 땅 높이(y=0) 기준 포물선이다.
 * y0는 그 구간이 시작하는 높이 — 첫 구간만 타격 높이에서 시작한다.
 *
 * 담장은 뚫리지 않는다. 담장 자리(FENCE_DIST)에 닿을 때 높이가 담장보다 낮으면
 * 튕겨 나오고, 높으면 넘어간 것이다(over) — 그게 홈런이다.
 */
function buildPath(vx, vy, launchDy) {
  const hops = []
  let startMs = 0
  let x = 0
  let y = launchDy
  let up = vy
  let along = vx
  let over = false
  let overAtMs = 0

  for (let i = 0; i < MAX_HOPS; i += 1) {
    // 땅에 닿기까지 걸리는 시간.
    const impact = Math.sqrt(Math.max(0, up * up + 2 * GRAVITY * y))
    const toGround = (up + impact) / GRAVITY

    let dur = toGround
    let hitWall = false

    // 담장까지 먼저 닿는가?
    if (along > 0 && x < FENCE_DIST) {
      const toWall = (FENCE_DIST - x) / along
      if (toWall < toGround) {
        const height = y + up * toWall - 0.5 * GRAVITY * toWall * toWall
        if (height > FENCE_H) {
          over = true // 넘어갔다 — 홈런
          overAtMs = startMs + toWall * 1000
        } else {
          dur = toWall
          hitWall = true
        }
      }
    }

    hops.push({ startMs, durMs: dur * 1000, x0: x, y0: y, vx: along, vy: up })

    startMs += dur * 1000
    x += along * dur
    const fallSpeed = up - GRAVITY * dur
    y = hitWall ? y + up * dur - 0.5 * GRAVITY * dur * dur : 0

    if (over) break // 넘어간 공은 그대로 화면 밖으로 사라진다

    if (hitWall) {
      // 벽에 맞고 되튄다. 위아래 속도는 유지한 채 앞뒤만 뒤집힌다.
      along = -along * WALL_BOUNCE
      up = fallSpeed * WALL_BOUNCE
    } else {
      up = Math.abs(fallSpeed) * BOUNCE
      along *= BOUNCE_DRAG
      if (up < MIN_BOUNCE_VY) break
    }
  }

  return { hops, over, overAtMs }
}

/**
 * 그만 튀면 남은 속도로 땅을 굴러간다. 마찰로 일정하게 감속해 스스로 멈춘다.
 * 담장을 넘어간 공은 화면 밖이라 구를 것도 없다.
 */
function buildRoll(hops, over) {
  const last = hops[hops.length - 1]
  const vx = last.vx
  const speed = Math.abs(vx)

  return {
    startMs: last.startMs + last.durMs,
    durMs: over ? 0 : (speed / ROLL_DECEL) * 1000,
    x0: last.x0 + vx * (last.durMs / 1000),
    vx,
    decel: Math.sign(vx) * ROLL_DECEL, // 굴러가는 반대 방향으로 작용한다
  }
}

/** 맞은 뒤 ageMs가 지난 시점의 위치. 수명이 지나면 null. */
export function battedBall(flight, ageMs) {
  if (!flight || ageMs < 0 || ageMs > flight.lifeMs) return null

  const { roll } = flight
  if (ageMs >= roll.startMs) {
    // 다 구르고 나면(FADE 동안) 그 자리에 서 있는다.
    const s = Math.min(ageMs - roll.startMs, roll.durMs) / 1000
    return {
      dx: roll.x0 + roll.vx * s - 0.5 * roll.decel * s * s,
      dy: -flight.launchDy,
    }
  }

  const hop = hopAt(flight.hops, ageMs)
  const s = (ageMs - hop.startMs) / 1000

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

/**
 * 비거리 — 담장이 없었다면 공이 떨어졌을 지점까지의 거리.
 * 벽에 맞아 끊긴 궤적도 "얼마나 멀리 칠 뻔했는지"를 그대로 말해 준다.
 */
export function distance(flight) {
  if (!flight) return 0
  const { vx, vy, launchDy } = flight
  const hang = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * GRAVITY * launchDy))) / GRAVITY
  return vx * hang
}

/** 비거리를 미터로. 화면에 띄우고 최고 기록으로 남긴다. */
export function meters(flight) {
  return Math.round(Math.abs(distance(flight)) * METERS_PER_UNIT)
}

/** 첫 구간이 끝나는 거리 — 땅에 닿거나 담장에 맞은 지점. 궤적 비교용. */
export function carry(flight) {
  if (!flight) return 0
  const first = flight.hops[0]
  return first.vx * (first.durMs / 1000)
}

/** 공이 다 굴러 멈추기까지 걸리는 실제 시간. 다음 투구를 언제 던질지 정할 때 쓴다. */
export function restMs(flight) {
  if (!flight) return 0
  return (flight.roll.startMs + flight.roll.durMs) / TIME_SCALE
}

/** 담장을 넘겼는가 — 홈런 판정. */
export function clearsFence(flight) {
  return flight?.over === true
}

/** 튀고 구른 것까지 더해 공이 최종적으로 멈추는 거리. 화면 폭을 맞출 때 쓴다. */
export function travel(flight) {
  if (!flight) return 0
  const { roll } = flight
  const s = roll.durMs / 1000
  return roll.x0 + roll.vx * s - 0.5 * roll.decel * s * s
}
