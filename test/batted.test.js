import { describe, it, expect } from 'vitest'
import { battedFlight, battedBall, carry, GRAVITY } from '../src/game/batted.js'
import { HOMERUN, HIT, FOUL, WHIFF } from '../src/game/judge.js'

describe('battedFlight', () => {
  it('헛스윙은 날아가는 공이 없다', () => {
    expect(battedFlight(WHIFF, -400)).toBeNull()
  })

  it('타이밍이 어긋날수록 멀리 못 간다', () => {
    const distance = (errorMs) => carry(battedFlight(HIT, errorMs))
    expect(distance(0)).toBeGreaterThan(distance(60))
    expect(distance(60)).toBeGreaterThan(distance(140))
    expect(distance(0)).toBeGreaterThan(distance(-60))
    expect(distance(-60)).toBeGreaterThan(distance(-140))
  })

  it('오차가 1ms만 달라도 궤적이 달라진다', () => {
    const a = battedFlight(HOMERUN, 0)
    const b = battedFlight(HOMERUN, 1)
    expect(b.vx).not.toBe(a.vx)
    expect(b.vy).not.toBe(a.vy)
  })

  it('빠른 스윙은 퍼올려 높이 뜨고, 늦은 스윙은 낮게 깔린다', () => {
    const early = battedFlight(HIT, -70)
    const late = battedFlight(HIT, 70)
    expect(early.vy).toBeGreaterThan(late.vy)
    expect(late.vx / late.vy).toBeGreaterThan(early.vx / early.vy)
  })

  it('낮은 공은 각도가 깎인다', () => {
    const low = battedFlight(HOMERUN, 0, 0.06)
    const high = battedFlight(HOMERUN, 0, -0.06)
    expect(low.vy).toBeLessThan(high.vy)
  })

  it('파울은 뒤로 간다', () => {
    expect(battedFlight(FOUL, 120).vx).toBeLessThan(0)
    expect(battedFlight(FOUL, -120).vx).toBeLessThan(0)
  })

  it('발사각은 극단적인 값에서도 8~62도로 묶인다', () => {
    const deg = (f) => (Math.atan2(f.vy, Math.abs(f.vx)) * 180) / Math.PI
    expect(deg(battedFlight(HIT, 0, 2))).toBeCloseTo(8, 0)
    expect(deg(battedFlight(HIT, 0, -2))).toBeCloseTo(62, 0)
    expect(deg(battedFlight(HIT, 900))).toBeGreaterThan(8)
    expect(deg(battedFlight(HIT, -900))).toBeLessThan(62)
  })

  it('수명은 공이 떠 있는 시간에 맞춰 정해진다', () => {
    const flight = battedFlight(HOMERUN, 0)
    const hang = ((2 * flight.vy) / GRAVITY) * 1000
    expect(flight.lifeMs).toBeGreaterThan(hang)
  })
})

describe('battedBall', () => {
  const flight = battedFlight(HOMERUN, 0)

  it('타격 순간에는 타격점 그대로다', () => {
    expect(battedBall(flight, 0)).toEqual({ dx: 0, dy: 0 })
  })

  it('궤적이 없으면 그릴 것도 없다', () => {
    expect(battedBall(null, 10)).toBeNull()
  })

  it('수명이 지나면 더 그리지 않는다', () => {
    expect(battedBall(flight, flight.lifeMs)).not.toBeNull()
    expect(battedBall(flight, flight.lifeMs + 1)).toBeNull()
  })

  it('올라갔다 내려온다', () => {
    const rising = battedBall(flight, 120)
    const apex = battedBall(flight, Math.round((flight.vy / GRAVITY) * 1000))
    const falling = battedBall(flight, flight.lifeMs)
    expect(apex.dy).toBeGreaterThan(rising.dy)
    expect(apex.dy).toBeGreaterThan(falling.dy)
    expect(falling.dx).toBeGreaterThan(apex.dx)
  })

  it('홈런은 담장(높이 2.3배)을 넘길 만큼 나간다', () => {
    expect(carry(flight)).toBeGreaterThan(2.3)
  })
})
