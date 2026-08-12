import { describe, it, expect } from 'vitest'
import {
  battedFlight, battedBall, carry, travel, clearsFence,
  GRAVITY, FENCE_DIST, FENCE_H, LAUNCH_DY,
} from '../src/game/batted.js'
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

  it('잘 맞은 공은 담장 거리보다 멀리 나간다', () => {
    expect(carry(flight)).toBeGreaterThan(FENCE_DIST)
  })
})

describe('바운드', () => {
  // 담장을 넘긴 공은 화면 밖이라 튀지도 구르지도 않는다 — 담장 앞에 떨어지는 타구로 본다.
  const inPark = () => battedFlight(HIT, 60)

  /** 궤적을 촘촘히 훑어 높이의 변곡을 센다 — 떨어졌다가 다시 올라간 횟수. */
  function bounces(flight) {
    let count = 0
    let prev = battedBall(flight, 0).dy
    let falling = false
    for (let t = 5; t <= flight.lifeMs; t += 5) {
      const { dy } = battedBall(flight, t)
      if (dy < prev) falling = true
      else if (falling && dy > prev) {
        count += 1
        falling = false
      }
      prev = dy
    }
    return count
  }

  it('세게 친 공은 여러 번 튄다', () => {
    expect(bounces(inPark())).toBeGreaterThan(1)
  })

  it('튈수록 낮아지고 간격도 짧아진다', () => {
    const { hops } = inPark()
    expect(hops.length).toBeGreaterThan(2)
    for (let i = 1; i < hops.length - 1; i += 1) {
      expect(hops[i + 1].vy).toBeLessThan(hops[i].vy)
      expect(hops[i + 1].durMs).toBeLessThan(hops[i].durMs)
    }
  })

  it('튀고 나면 앞으로 가는 속도도 깎인다', () => {
    const [first, second] = inPark().hops
    expect(second.vx).toBeLessThan(first.vx)
    expect(second.vx).toBeGreaterThan(0)
  })

  it('약하게 맞은 공은 세게 맞은 공보다 덜 튄다', () => {
    expect(bounces(battedFlight(FOUL, 140))).toBeLessThan(bounces(inPark()))
  })

  it('타격점이 떠 있으면 그만큼 더 떨어져 땅에 닿는다', () => {
    const high = battedFlight(HIT, 60, 0, 0.2)
    const flat = battedFlight(HIT, 60, 0, 0)
    expect(carry(high)).toBeGreaterThan(carry(flat))
    // 땅에 닿는 순간의 높이는 타격점보다 launchDy만큼 낮다.
    expect(battedBall(high, high.hops[1].startMs).dy).toBeCloseTo(-0.2, 5)
  })

  it('튄 거리까지 더하면 처음 닿은 지점보다 멀리 간다', () => {
    const flight = inPark()
    expect(travel(flight)).toBeGreaterThan(carry(flight))
  })

  it('멈춘 뒤에는 그 자리에 서 있는다', () => {
    const flight = inPark()
    const rest = travel(flight)
    expect(battedBall(flight, flight.lifeMs).dx).toBeCloseTo(rest, 5)
    // 땅에 닿아 있으므로 타격점보다 LAUNCH_DY 만큼 낮다.
    expect(battedBall(flight, flight.lifeMs).dy).toBeCloseTo(-LAUNCH_DY, 5)
  })
})

describe('구르기', () => {
  const flight = battedFlight(HIT, 60)
  const { roll } = flight

  it('그만 튀면 땅에 붙어 굴러간다', () => {
    const mid = battedBall(flight, roll.startMs + roll.durMs / 2)
    expect(mid.dy).toBeCloseTo(-LAUNCH_DY, 5)
    expect(mid.dx).toBeGreaterThan(roll.x0)
  })

  it('구르는 동안 점점 느려진다', () => {
    const step = roll.durMs / 4
    const at = (i) => battedBall(flight, roll.startMs + step * i).dx
    const first = at(1) - at(0)
    const last = at(4) - at(3)
    expect(last).toBeGreaterThan(0)
    expect(last).toBeLessThan(first)
  })

  it('스스로 멈춘다 — 끝에서 속도가 0이다', () => {
    const end = roll.startMs + roll.durMs
    const before = battedBall(flight, end - 1).dx
    const after = battedBall(flight, end).dx
    expect(after - before).toBeCloseTo(0, 4)
  })

  it('파울처럼 뒤로 간 공은 뒤로 구르다 멈춘다', () => {
    const foul = battedFlight(FOUL, 120)
    expect(foul.roll.vx).toBeLessThan(0)
    expect(travel(foul)).toBeLessThan(foul.roll.x0)
  })

  it('멈춘 뒤 잠깐 남았다가 수명이 끝난다', () => {
    expect(flight.lifeMs).toBe(Math.round(roll.startMs + roll.durMs) + flight.fadeMs)
    expect(battedBall(flight, flight.lifeMs + 1)).toBeNull()
  })
})

describe('담장', () => {
  it('잘 맞은 공은 담장을 넘어간다', () => {
    const out = battedFlight(HIT, 0)
    expect(out.over).toBe(true)
    expect(clearsFence(out)).toBe(true)
  })

  it('넘어간 공은 화면 밖이라 튀지도 구르지도 않는다', () => {
    expect(battedFlight(HIT, 0).roll.durMs).toBe(0)
  })

  it('담장에 닿을 때 담장보다 낮으면 튕겨 나온다', () => {
    const off = battedFlight(HIT, 42)
    expect(off.over).toBe(false)

    // 담장 자리에 닿는 구간이 있고, 그 다음 구간은 뒤로 간다.
    const at = off.hops.findIndex((h, i) => i > 0 && h.x0 >= FENCE_DIST - 1e-9)
    expect(at).toBeGreaterThan(0)
    expect(off.hops[at].vx).toBeLessThan(0)
  })

  it('튕겨 나온 지점의 높이는 담장보다 낮다', () => {
    const off = battedFlight(HIT, 42)
    const at = off.hops.findIndex((h, i) => i > 0 && h.x0 >= FENCE_DIST - 1e-9)
    expect(off.hops[at].y0).toBeLessThanOrEqual(FENCE_H)
  })

  it('담장을 못 넘고 그 앞에 떨어지는 공은 담장을 건드리지 않는다', () => {
    const weak = battedFlight(HIT, 70)
    expect(carry(weak)).toBeLessThan(FENCE_DIST)
    expect(weak.hops.every((h) => h.vx > 0)).toBe(true)
  })

  it('파울은 뒤로 가니 담장과 무관하다', () => {
    expect(battedFlight(FOUL, 120).over).toBe(false)
  })
})
