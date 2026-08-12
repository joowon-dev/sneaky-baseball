import { describe, it, expect } from 'vitest'
import {
  createGame, startPitch, swing, tick, settle, progress,
  nextPitchAt, READY, PITCHING, RESULT, RESULT_MS, WINDUP_MS, IDLE_AFTER_TAKES,
} from '../src/game/engine.js'
import { HOMERUN, HIT, FOUL, WHIFF, WINDOWS } from '../src/game/judge.js'

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

describe('스코어', () => {
  it('홈런은 홈런·안타·연속을 모두 올린다', () => {
    const s = swingWith(0)
    expect(s.lastResult.result).toBe(HOMERUN)
    expect(s).toMatchObject({ homeRuns: 1, hits: 1, streak: 1, bestStreak: 1 })
  })

  it('안타는 홈런 수를 올리지 않는다', () => {
    const s = swingWith(60)
    expect(s.lastResult.result).toBe(HIT)
    expect(s).toMatchObject({ homeRuns: 0, hits: 1, streak: 1 })
  })

  it('파울은 어떤 기록도 바꾸지 않는다', () => {
    const s = swingWith(120, { homeRuns: 3, hits: 5, streak: 2, bestStreak: 4 })
    expect(s.lastResult.result).toBe(FOUL)
    expect(s).toMatchObject({ homeRuns: 3, hits: 5, streak: 2, bestStreak: 4 })
  })

  it('헛스윙은 연속을 끊지만 최고 기록은 남긴다', () => {
    const s = swingWith(400, { streak: 6, bestStreak: 6 })
    expect(s.lastResult.result).toBe(WHIFF)
    expect(s).toMatchObject({ streak: 0, bestStreak: 6 })
  })

  it('최고 연속은 현재 연속이 넘어설 때만 갱신된다', () => {
    expect(swingWith(0, { streak: 2, bestStreak: 9 }).bestStreak).toBe(9)
    expect(swingWith(0, { streak: 9, bestStreak: 9 }).bestStreak).toBe(10)
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

  it('친 공이 다 굴러 멈춘 뒤에 와인드업을 시작한다', () => {
    const homerun = swingWith(0)
    const whiff = swingWith(400)

    expect(homerun.restAt).toBeGreaterThan(homerun.resultAt + RESULT_MS)
    expect(nextPitchAt(homerun)).toBe(homerun.restAt + WINDUP_MS)
    // 잘 맞을수록 공이 멀리 굴러가니 다음 공도 늦게 온다.
    expect(nextPitchAt(homerun) - homerun.resultAt)
      .toBeGreaterThan(nextPitchAt(whiff) - whiff.resultAt)
  })

  it('약하게 맞은 공은 금방 멈춰 다음 공이 빨리 온다', () => {
    const solid = swingWith(0)
    const weak = swingWith(140)
    expect(weak.restAt - weak.resultAt).toBeLessThan(solid.restAt - solid.resultAt)
  })
})

/** 공 하나를 그냥 보내고(스윙 없음) 다음 투구를 받을 수 있는 상태까지 진행한다. */
function takeOne(state) {
  const pitching = startPitch(state, PITCH, state.resultAt + 10_000)
  const done = tick(pitching, pitching.plateAt + WINDOWS.foul + 1)
  return settle(done, nextPitchAt(done))
}

describe('거르면 멈춘다', () => {
  it('스윙하지 않은 횟수를 센다', () => {
    let s = createGame()
    for (let i = 1; i < IDLE_AFTER_TAKES; i += 1) {
      s = takeOne(s)
      expect(s.takes).toBe(i)
      expect(s.pitch).not.toBeNull() // 아직은 자동으로 계속 던진다
    }
  })

  it(`${IDLE_AFTER_TAKES}번 연속으로 거르면 공을 비우고 기다린다`, () => {
    let s = createGame()
    for (let i = 0; i < IDLE_AFTER_TAKES; i += 1) s = takeOne(s)
    expect(s).toMatchObject({ phase: READY, pitch: null, takes: 0 })
  })

  it('중간에 한 번이라도 휘두르면 카운트가 풀린다', () => {
    let s = createGame()
    for (let i = 0; i < IDLE_AFTER_TAKES - 1; i += 1) s = takeOne(s)

    const pitching = startPitch(s, PITCH, s.resultAt + 10_000)
    const swung = swing(pitching, pitching.plateAt + 400) // 헛스윙이어도 휘두른 건 휘두른 것
    expect(swung.lastResult).toMatchObject({ result: WHIFF, timing: 'late' })
    expect(swung.takes).toBe(0)

    const ready = settle(swung, nextPitchAt(swung))
    expect(ready.pitch).not.toBeNull()
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
