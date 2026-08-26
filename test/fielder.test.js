import { describe, it, expect } from 'vitest'
import { battedFlight, clearsFence, FENCE_DIST } from '../src/game/batted.js'
import { HOMERUN, HIT, OUT, FOUL } from '../src/game/judge.js'
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

/** 타이밍 오차 하나가 어떤 결과가 되는지 — engine 과 같은 순서로 판정한다. */
function outcomeAt(off) {
  const flight = battedFlight(HIT, off, 0)
  if (clearsFence(flight)) return HOMERUN
  return chase(flight)?.caught ? OUT : HIT
}

/**
 * 상수 셋(START_X·RUN_SPEED·REACH)이 만드는 결과 분포를 못 박는다.
 * 야수가 너무 잘 잡으면 안타가 사라지고, 못 잡으면 세운 의미가 없다.
 */
describe('타구 밴드', () => {
  const band = (want) => {
    let n = 0
    for (let off = 0; off <= 80; off += 1) if (outcomeAt(off) === want) n += 1
    return n
  }

  it('완벽에 가까우면 홈런이다', () => {
    expect(outcomeAt(0)).toBe(HOMERUN)
  })

  it('굿 윈도우 안에서 아웃이 절반을 넘지 않는다', () => {
    // 넘으면 잘 맞힌 타구가 죄다 잡혀서 안타가 사라진다.
    expect(band(OUT)).toBeLessThanOrEqual(40)
  })

  it('굿 윈도우 안에 아웃도 안타도 충분히 있다', () => {
    expect(band(OUT)).toBeGreaterThanOrEqual(10)
    expect(band(HIT)).toBeGreaterThanOrEqual(10)
  })

  it('힘없이 맞은 공은 야수가 못 온다', () => {
    expect(outcomeAt(78)).toBe(HIT)
  })

  it('담장을 직격한 타구는 야수가 못 잡는다 — 공중에서 벽에 막혔다', () => {
    // 홈런 문턱 바로 밖. 넘기진 못했지만 야수 머리 위로 벽까지 날아간다.
    expect(outcomeAt(15)).toBe(HIT)
  })
})
