import { describe, it, expect } from 'vitest'
import {
  createGame, startPitch, swing, tick, settle, progress,
  idle, nextPitchAt, READY, PITCHING, RESULT, RESULT_MS, WINDUP_MS, OUTCOME_MS,
} from '../src/game/engine.js'
import { HOMERUN, HIT, FOUL, WHIFF, WINDOWS } from '../src/game/judge.js'
import { battedFlight, clearsFence, meters } from '../src/game/batted.js'

const PITCH = { type: 'fastball', label: '직구', flightMs: 900, breakX: 0, breakY: 0 }
const T0 = 1_000

/** T0에 던진 공을 오차 offMs로 스윙한 뒤의 상태. */
function swingWith(offMs, initial = {}) {
  const pitching = startPitch(createGame(initial), PITCH, T0)
  return swing(pitching, pitching.plateAt + offMs)
}

describe('startPitch', () => {
  it('플레이트 도달 시각은 비행 시간 뒤다', () => {
    const s = startPitch(createGame(), PITCH, T0)
    expect(s).toMatchObject({ phase: PITCHING, pitchStartedAt: T0, plateAt: T0 + 900, pitches: 1 })
  })

  it('이미 투구 중이면 새 공을 던지지 않는다', () => {
    const s = startPitch(createGame(), PITCH, T0)
    expect(startPitch(s, PITCH, T0 + 100)).toBe(s)
  })

  it('직전 결과를 지우지 않는다 — 친 공은 다음 공이 와도 계속 굴러간다', () => {
    const after = swingWith(0)
    const ready = settle(after, nextPitchAt(after))
    const next = startPitch(ready, PITCH, 9_999)
    expect(next.lastResult).toEqual(after.lastResult)
    expect(next.resultAt).toBe(after.resultAt)
  })

  it('타구가 어떤 높이의 공이었는지 결과에 남긴다', () => {
    const pitching = startPitch(createGame(), { ...PITCH, lane: 0.04 }, T0)
    expect(swing(pitching, pitching.plateAt).lastResult.lane).toBe(0.04)
  })
})

describe('담장이 홈런을 가른다', () => {
  it('담장을 넘긴 타구만 홈런이다', () => {
    expect(clearsFence(battedFlight(HIT, 0, 0))).toBe(true)
    expect(swingWith(0).lastResult.result).toBe(HOMERUN)

    expect(clearsFence(battedFlight(HIT, 60, 0))).toBe(false)
    expect(swingWith(60).lastResult.result).toBe(HIT)
  })

  it('타이밍이 퍼펙트여도 담장을 못 넘으면 안타다', () => {
    // 낮은 공(lane 양수)은 각도가 깎여 담장에 못 미친다.
    const low = startPitch(createGame(), { ...PITCH, lane: 0.06 }, T0)
    const hit = swing(low, low.plateAt + 32)

    expect(hit.lastResult.timing).toBe('perfect')
    expect(clearsFence(battedFlight(HIT, 32, 0.06))).toBe(false)
    expect(hit.lastResult.result).toBe(HIT)
  })

  it('파울은 담장 쪽으로 가지도 않으니 홈런이 될 수 없다', () => {
    expect(swingWith(120).lastResult.result).toBe(FOUL)
  })
})

describe('스코어', () => {
  it('홈런은 홈런·안타·연속을 모두 올린다', () => {
    const s = swingWith(0)
    expect(s.lastResult.result).toBe(HOMERUN)
    expect(s).toMatchObject({ homeRuns: 1, hits: 1, streak: 1 })
  })

  it('안타는 홈런 수를 올리지 않는다', () => {
    const s = swingWith(60)
    expect(s.lastResult.result).toBe(HIT)
    expect(s).toMatchObject({ homeRuns: 0, hits: 1, streak: 1 })
  })

  it('파울은 어떤 기록도 바꾸지 않는다', () => {
    const s = swingWith(120, { homeRuns: 3, hits: 5, streak: 2, bestStreak: 4 })
    expect(s.lastResult.result).toBe(FOUL)
    expect(s).toMatchObject({ homeRuns: 3, hits: 5, streak: 2 })
  })

  it('헛스윙은 연속을 끊는다', () => {
    const s = swingWith(400, { streak: 6 })
    expect(s.lastResult.result).toBe(WHIFF)
    expect(s.streak).toBe(0)
  })
})

describe('최고 비거리', () => {
  it('친 거리를 미터로 남긴다', () => {
    const s = swingWith(0)
    expect(s.lastResult.meters).toBe(meters(battedFlight(HIT, 0, 0)))
    expect(s.lastResult.meters).toBeGreaterThan(100)
  })

  it('더 멀리 쳤을 때만 갱신된다', () => {
    expect(swingWith(60, { bestMeters: 999 }).bestMeters).toBe(999)
    expect(swingWith(0, { bestMeters: 10 }).bestMeters).toBeGreaterThan(10)
  })

  it('약하게 친 공도 비거리는 남는다 — 최고만 못 넘길 뿐', () => {
    const weak = swingWith(120)
    expect(weak.lastResult.meters).toBeGreaterThan(0)
  })

  it('헛스윙은 비거리가 0이라 기록을 건드리지 않는다', () => {
    const s = swingWith(400, { bestMeters: 77 })
    expect(s.lastResult.meters).toBe(0)
    expect(s.bestMeters).toBe(77)
  })
})

describe('swing', () => {
  it('투구 중이 아니면 무시한다', () => {
    const ready = createGame()
    expect(swing(ready, T0)).toBe(ready)

    const after = swingWith(0)
    expect(swing(after, after.resultAt + 10)).toBe(after)
  })
})

describe('tick', () => {
  it('파울 윈도우 안에서는 아직 판정하지 않는다', () => {
    const s = startPitch(createGame(), PITCH, T0)
    expect(tick(s, s.plateAt + WINDOWS.foul)).toBe(s)
  })

  it('파울 윈도우를 지나면 헛스윙으로 끝낸다', () => {
    const s = startPitch(createGame(), PITCH, T0)
    const done = tick(s, s.plateAt + WINDOWS.foul + 1)
    expect(done.phase).toBe(RESULT)
    expect(done.lastResult).toMatchObject({ result: WHIFF, timing: 'take' })
  })

  it('투구 중이 아니면 아무것도 하지 않는다', () => {
    const ready = createGame()
    expect(tick(ready, T0 + 99_999)).toBe(ready)
  })
})

describe('settle', () => {
  it('다음 투구 시각이 되어야 받는다', () => {
    const s = swingWith(0)
    expect(settle(s, nextPitchAt(s) - 1).phase).toBe(RESULT)
    expect(settle(s, nextPitchAt(s)).phase).toBe(READY)
  })

  it('헛스윙은 굴러갈 공이 없으니 결과만 보여주고 바로 다음 공', () => {
    const s = swingWith(400)
    expect(s.restAt).toBe(s.resultAt)
    expect(nextPitchAt(s)).toBe(s.resultAt + RESULT_MS + WINDUP_MS)
  })

  it('결과 글씨가 사라진 뒤에 와인드업을 시작한다', () => {
    const homerun = swingWith(0)
    const whiff = swingWith(400)

    expect(homerun.outcomeEndsAt).toBeGreaterThan(homerun.resultAt + RESULT_MS)
    expect(nextPitchAt(homerun)).toBe(homerun.outcomeEndsAt + WINDUP_MS)
    // 잘 맞을수록 결말이 늦게 나니 다음 공도 늦게 온다.
    expect(nextPitchAt(homerun) - homerun.resultAt)
      .toBeGreaterThan(nextPitchAt(whiff) - whiff.resultAt)
  })

  it('홈런 글씨는 담장을 넘는 순간부터 센다 — 공이 다 날아갈 때까지 기다리지 않는다', () => {
    const homerun = swingWith(0)
    expect(homerun.outcomeEndsAt).toBeLessThan(homerun.restAt + OUTCOME_MS)
  })

  it('공이 아직 구르는 중이면 글씨가 사라져도 기다린다', () => {
    const hit = swingWith(60)
    expect(nextPitchAt(hit)).toBeGreaterThanOrEqual(hit.restAt + WINDUP_MS)
  })

  it('약하게 맞은 공은 금방 멈춰 다음 공이 빨리 온다', () => {
    const solid = swingWith(0)
    const weak = swingWith(140)
    expect(weak.restAt - weak.resultAt).toBeLessThan(solid.restAt - solid.resultAt)
  })
})

describe('idle', () => {
  it('던지던 공을 거두고 대기로 돌아간다', () => {
    const pitching = startPitch(createGame(), PITCH, T0)
    expect(idle(pitching)).toMatchObject({ phase: READY, pitch: null })
  })

  it('거둔 공은 헛스윙으로 기록되지 않는다', () => {
    const pitching = startPitch(createGame({ streak: 4 }), PITCH, T0)
    expect(idle(pitching)).toMatchObject({ streak: 4, lastResult: null })
  })

  it('이미 친 공은 건드리지 않는다 — 계속 굴러가야 한다', () => {
    const after = swingWith(0)
    const stopped = idle(after)
    expect(stopped.lastResult).toBe(after.lastResult)
    expect(stopped.resultAt).toBe(after.resultAt)
  })

  it('이미 대기 중이면 그대로 둔다', () => {
    const ready = createGame()
    expect(idle(ready)).toBe(ready)
  })
})

describe('progress', () => {
  it('릴리스 0, 플레이트 1, 그 뒤로는 1을 넘는다', () => {
    const s = startPitch(createGame(), PITCH, T0)
    expect(progress(s, T0)).toBe(0)
    expect(progress(s, T0 + 450)).toBeCloseTo(0.5)
    expect(progress(s, s.plateAt)).toBe(1)
    expect(progress(s, s.plateAt + 90)).toBeGreaterThan(1)
  })

  it('공이 없으면 0이다', () => {
    expect(progress(createGame(), T0)).toBe(0)
  })
})
