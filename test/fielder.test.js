import { describe, it, expect } from 'vitest'
import { battedFlight, FENCE_DIST } from '../src/game/batted.js'
import { HIT, FOUL } from '../src/game/judge.js'
import { chase, START_X, RUN_SPEED, REACH } from '../src/game/fielder.js'

describe('chase', () => {
  it('담장을 넘긴 공은 야수가 관여하지 않는다', () => {
    const flight = battedFlight(HIT, 0, 0)
    expect(flight.over).toBe(true)
    expect(chase(flight)).toBe(null)
  })

  it('궤적이 없으면 null 이다', () => {
    expect(chase(null)).toBe(null)
  })

  it('뒤로 간 파울은 묻지 않아도 null 이다', () => {
    expect(chase(battedFlight(FOUL, 100, 0))).toBe(null)
  })

  it('낙구 지점이 글러브 안이면 안 달리고 잡는다', () => {
    // START_X 바로 위에 떨어지는 궤적을 손으로 만든다.
    const flight = {
      over: false,
      hops: [{ startMs: 0, durMs: 600, x0: 0, y0: 0, vx: START_X / 0.6, vy: 2 }],
    }
    const got = chase(flight)
    expect(got.needMs).toBe(0)
    expect(got.caught).toBe(true)
    expect(got.spotX).toBeCloseTo(START_X)
    expect(got.hangMs).toBe(600)
  })

  it('체공이 짧으면 못 온다', () => {
    // 야수 한참 앞(0.5)에 0.1초 만에 처박히는 라이너. 담장 앞이지만 너무 가깝고 빠르다.
    const flight = {
      over: false,
      hops: [{ startMs: 0, durMs: 100, x0: 0, y0: 0, vx: 0.5 / 0.1, vy: 0.2 }],
    }
    const got = chase(flight)
    expect(got.caught).toBe(false)
    expect(got.needMs).toBeGreaterThan(got.hangMs)
  })

  it('체공이 길면 달려가 잡는다', () => {
    // 야수에게서 0.3 만큼 떨어진 곳에 1초 걸려 떨어지는 뜬공.
    const flight = {
      over: false,
      hops: [{ startMs: 0, durMs: 1000, x0: 0, y0: 0, vx: START_X + 0.3, vy: 3 }],
    }
    expect(chase(flight).caught).toBe(true)
  })

  it('담장을 직격해 끊긴 궤적은 못 잡는다', () => {
    // 첫 구간이 담장 자리에서 끝난다 = 공중에서 벽에 막혔다.
    const flight = {
      over: false,
      hops: [{ startMs: 0, durMs: 500, x0: 0, y0: 0, vx: FENCE_DIST / 0.5, vy: 2 }],
    }
    expect(chase(flight)).toBe(null)
  })

  it('상수는 양수다', () => {
    expect(START_X).toBeGreaterThan(0)
    expect(RUN_SPEED).toBeGreaterThan(0)
    expect(REACH).toBeGreaterThan(0)
  })
})
