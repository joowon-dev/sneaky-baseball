import { describe, it, expect } from 'vitest'
import { judgeSwing, judgeTake, HIT, FOUL, WHIFF } from '../src/game/judge.js'

const PLATE = 10_000

describe('judgeSwing', () => {
  it('홈런은 여기서 정하지 않는다 — 맞았는지까지만', () => {
    expect(judgeSwing(PLATE, PLATE)).toMatchObject({ result: HIT, timing: 'perfect', errorMs: 0 })
  })

  it('퍼펙트 윈도우 경계(35ms)까지는 타이밍이 perfect', () => {
    expect(judgeSwing(PLATE - 35, PLATE).timing).toBe('perfect')
    expect(judgeSwing(PLATE + 35, PLATE).timing).toBe('perfect')
  })

  it('퍼펙트를 1ms 벗어나면 빠름/늦음으로 갈린다', () => {
    expect(judgeSwing(PLATE - 36, PLATE)).toMatchObject({ result: HIT, timing: 'early' })
    expect(judgeSwing(PLATE + 36, PLATE)).toMatchObject({ result: HIT, timing: 'late' })
  })

  it('굿 윈도우 경계(80ms)는 안타, 1ms 넘으면 파울', () => {
    expect(judgeSwing(PLATE + 80, PLATE).result).toBe(HIT)
    expect(judgeSwing(PLATE + 81, PLATE).result).toBe(FOUL)
  })

  it('파울 윈도우 경계(150ms)는 파울, 1ms 넘으면 헛스윙', () => {
    expect(judgeSwing(PLATE - 150, PLATE).result).toBe(FOUL)
    expect(judgeSwing(PLATE - 151, PLATE).result).toBe(WHIFF)
  })

  it('오차 부호로 빠름/늦음을 구분한다', () => {
    expect(judgeSwing(PLATE - 300, PLATE)).toMatchObject({ timing: 'early', errorMs: -300 })
    expect(judgeSwing(PLATE + 300, PLATE)).toMatchObject({ timing: 'late', errorMs: 300 })
  })
})

describe('judgeTake', () => {
  it('스윙하지 않으면 헛스윙이고 오차는 없다', () => {
    expect(judgeTake()).toEqual({ result: WHIFF, timing: 'take', errorMs: null })
  })
})
