import { describe, it, expect } from 'vitest'
import {
  speedFactor, curveRatio, nextPitch, ballPosition, FASTBALL, CURVE,
  PITCHER_X_BASE, PITCHER_X_MIN, PITCHER_X_MAX, PITCHER_X_STEPS,
  clampPitcherX, distanceRatio, nearestStep,
} from '../src/game/pitches.js'

/** 정해진 값들을 순서대로 내주는 가짜 난수. */
function fakeRand(...values) {
  let i = 0
  return () => values[i++]
}

describe('speedFactor', () => {
  it('처음에는 원래 속도다', () => {
    expect(speedFactor(0)).toBe(1)
  })

  it('홈런마다 2%씩 빨라진다', () => {
    expect(speedFactor(10)).toBeCloseTo(0.8)
  })

  it('0.62 아래로는 내려가지 않는다', () => {
    expect(speedFactor(19)).toBeCloseTo(0.62)
    expect(speedFactor(500)).toBe(0.62)
  })
})

describe('curveRatio', () => {
  it('25%에서 시작해 홈런마다 3%씩 오른다', () => {
    expect(curveRatio(0)).toBeCloseTo(0.25)
    expect(curveRatio(5)).toBeCloseTo(0.4)
  })

  it('55%를 넘지 않는다', () => {
    expect(curveRatio(10)).toBeCloseTo(0.55)
    expect(curveRatio(500)).toBe(0.55)
  })
})

describe('nextPitch', () => {
  it('난수가 변화구 비율보다 작으면 변화구다', () => {
    expect(nextPitch(0, fakeRand(0.24, 0.5)).type).toBe(CURVE)
    expect(nextPitch(0, fakeRand(0.26, 0.5)).type).toBe(FASTBALL)
  })

  it('직구는 떨어지지 않고 변화구는 떨어진다', () => {
    expect(nextPitch(0, fakeRand(0.99, 0.5)).drop).toBe(0)
    expect(nextPitch(0, fakeRand(0.01, 0.5)).drop).toBeGreaterThan(0)
  })

  it('두 번째 난수가 공의 높낮이를 정한다', () => {
    expect(nextPitch(0, fakeRand(0.5, 0.5)).lane).toBe(0)
    expect(nextPitch(0, fakeRand(0.5, 0)).lane).toBeCloseTo(-0.06)
    expect(nextPitch(0, fakeRand(0.5, 1)).lane).toBeCloseTo(0.06)
  })

  it('비행 시간에 난이도가 반영된다', () => {
    expect(nextPitch(0, fakeRand(0.99, 0.5)).flightMs).toBe(900)
    expect(nextPitch(10, fakeRand(0.99, 0.5)).flightMs).toBe(720)
  })
})

describe('ballPosition', () => {
  const curve = { flightMs: 1000, drop: 0.18, lane: 0.02 }

  it('릴리스에서는 진행 0이고 높낮이만 반영된다', () => {
    expect(ballPosition(curve, 0)).toEqual({ travel: 0, offset: 0.02 })
  })

  it('타격점에서는 변화가 다 적용된다', () => {
    const at = ballPosition(curve, 1)
    expect(at.travel).toBe(1)
    expect(at.offset).toBeCloseTo(0.2)
  })

  it('변화는 후반에 몰린다', () => {
    const half = ballPosition(curve, 0.5)
    expect(half.offset - curve.lane).toBeLessThan(curve.drop * 0.5)
    expect(half.offset).toBeGreaterThan(curve.lane)
  })

  it('직구는 끝까지 같은 높이로 온다', () => {
    const straight = { flightMs: 900, drop: 0, lane: -0.03 }
    expect(ballPosition(straight, 0).offset).toBe(-0.03)
    expect(ballPosition(straight, 1).offset).toBe(-0.03)
  })

  it('릴리스 이전은 릴리스로 잘라낸다', () => {
    expect(ballPosition(curve, -1)).toEqual(ballPosition(curve, 0))
  })

  it('타격점을 지나도 멈추지 않고 계속 간다 — 안 친 공은 뒤로 빠져야 한다', () => {
    expect(ballPosition(curve, 1.3).travel).toBeCloseTo(1.3)
  })

  it('타격점을 지나면 더 휘지는 않는다', () => {
    expect(ballPosition(curve, 1.3).offset).toBeCloseTo(ballPosition(curve, 1).offset)
  })
})

describe('투수 위치', () => {
  it('기본 자리는 거리 비율이 1이다', () => {
    expect(distanceRatio(PITCHER_X_BASE)).toBeCloseTo(1)
  })

  it('당기면 공이 일찍 오고, 밀면 늦게 온다', () => {
    expect(distanceRatio(PITCHER_X_MIN)).toBeLessThan(1)
    expect(distanceRatio(PITCHER_X_MAX)).toBeGreaterThan(1)
  })

  it('범위는 좁다 — 기록이 하나뿐이라 넓히면 왜곡된다', () => {
    expect(distanceRatio(PITCHER_X_MIN)).toBeGreaterThan(0.8)
    expect(distanceRatio(PITCHER_X_MAX)).toBeLessThan(1.2)
  })

  it('범위 밖은 잘라 낸다', () => {
    expect(clampPitcherX(0)).toBe(PITCHER_X_MIN)
    expect(clampPitcherX(2)).toBe(PITCHER_X_MAX)
    expect(clampPitcherX(PITCHER_X_BASE)).toBe(PITCHER_X_BASE)
    expect(clampPitcherX(NaN)).toBe(PITCHER_X_BASE)
    expect(clampPitcherX(undefined)).toBe(PITCHER_X_BASE)
  })

  it('거리 비율이 날아오는 시간에 그대로 반영된다', () => {
    const base = nextPitch(0, fakeRand(0.9, 0.5))
    const near = nextPitch(0, fakeRand(0.9, 0.5), 0.85)
    expect(near.flightMs).toBe(Math.round(base.flightMs * 0.85))
  })

  it('비율을 안 주면 지금과 같다', () => {
    expect(nextPitch(0, fakeRand(0.9, 0.5)).flightMs)
      .toBe(nextPitch(0, fakeRand(0.9, 0.5), 1).flightMs)
  })
})

describe('트레이가 고르는 단계', () => {
  it('양 끝이 범위와 같다', () => {
    expect(PITCHER_X_STEPS[0]).toBe(PITCHER_X_MIN)
    expect(PITCHER_X_STEPS.at(-1)).toBe(PITCHER_X_MAX)
  })

  it('기본값이 정확히 가운데 단계다', () => {
    expect(PITCHER_X_STEPS[(PITCHER_X_STEPS.length - 1) / 2]).toBe(PITCHER_X_BASE)
  })

  it('단계 간격이 고르다', () => {
    const gaps = PITCHER_X_STEPS.slice(1).map((v, i) => +(v - PITCHER_X_STEPS[i]).toFixed(4))
    expect(new Set(gaps).size).toBe(1)
  })

  it('범위가 기본값을 중심으로 대칭이다', () => {
    expect(distanceRatio(PITCHER_X_MIN) + distanceRatio(PITCHER_X_MAX)).toBeCloseTo(2)
  })

  it('가장 가까운 단계를 찾는다 — 드래그한 값은 단계 사이에 있을 수 있다', () => {
    expect(nearestStep(0.87)).toBe(0.87)
    expect(nearestStep(0.853)).toBe(0.84)
    expect(nearestStep(0.862)).toBe(0.87)
    expect(nearestStep(0)).toBe(PITCHER_X_MIN)
    expect(nearestStep(9)).toBe(PITCHER_X_MAX)
  })
})
