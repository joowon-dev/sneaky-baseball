// 구종 정의, 궤적, 난이도. Electron·Canvas를 모르는 순수 모듈.
// 측면 2D 뷰라서 변화는 위아래(drop)로만 나타난다.

export const FASTBALL = 'fastball'
export const CURVE = 'curve'

const DEFS = {
  [FASTBALL]: { type: FASTBALL, label: '직구', flightMs: 900, drop: 0 },
  [CURVE]: { type: CURVE, label: '변화구', flightMs: 1150, drop: 0.18 },
}

const MIN_SPEED_FACTOR = 0.62
const MAX_CURVE_RATIO = 0.55
const LANE_SPREAD = 0.12

/** 홈런을 많이 칠수록 공이 빨라진다. 1에서 시작해 MIN_SPEED_FACTOR까지 줄어든다. */
export function speedFactor(homeRuns) {
  return Math.max(MIN_SPEED_FACTOR, 1 - homeRuns * 0.02)
}

/** 홈런을 많이 칠수록 변화구가 잦아진다. */
export function curveRatio(homeRuns) {
  return Math.min(MAX_CURVE_RATIO, 0.25 + homeRuns * 0.03)
}

/**
 * 다음 투구를 만든다.
 * rand는 [0,1) 두 개를 뽑는 함수 — 구종과 높낮이에 쓰인다. 테스트에서 주입한다.
 */
export function nextPitch(homeRuns, rand = Math.random) {
  const def = rand() < curveRatio(homeRuns) ? DEFS[CURVE] : DEFS[FASTBALL]
  return {
    ...def,
    flightMs: Math.round(def.flightMs * speedFactor(homeRuns)),
    lane: (rand() - 0.5) * LANE_SPREAD,
  }
}

const clamp01 = (v) => Math.min(1, Math.max(0, v))

/**
 * 진행률 t(0..1)에서 공의 위치.
 * travel은 릴리스(0)에서 타격점(1)까지의 진행,
 * offset은 기준선에서 아래로 벗어난 양(필드 높이 비율, 양수가 아래).
 * 변화는 t³에 비례해 후반에 몰린다. 도달 시각은 바꾸지 않는다 — 눈속임 전용.
 */
export function ballPosition(pitch, t) {
  const p = clamp01(t)
  return {
    travel: p,
    offset: pitch.lane + pitch.drop * p * p * p,
  }
}
