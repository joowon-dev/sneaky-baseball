import { describe, it, expect } from 'vitest'
import { BATS, DEFAULT_BAT, batOf, powerMulOf } from '../src/game/gear.js'

describe('BATS', () => {
  // 값을 못 박는다. 「목록에서 읽은 값과 같다」는 단언은 어떤 숫자를 넣어도 통과한다.
  it('배트 다섯 자루의 키·가격·힘 배수', () => {
    expect(BATS.map((b) => [b.key, b.price, b.powerMul])).toEqual([
      ['bare', 0, 1.0],
      ['ash', 800, 1.04],
      ['maple', 2500, 1.08],
      ['birch', 6000, 1.12],
      ['carbon', 15000, 1.16],
    ])
  })

  it('맨손 배트는 공짜이고 힘이 그대로다 — 아무것도 안 산 사람의 게임이 안 변한다', () => {
    expect(BATS[0].key).toBe(DEFAULT_BAT)
    expect(BATS[0].price).toBe(0)
    expect(BATS[0].powerMul).toBe(1)
    // 배럴 굵기도 예전 그림 그대로여야 한다.
    expect(BATS[0].tip).toBe(1.8)
  })

  it('비쌀수록 세다 — 가격과 힘이 같은 순서다', () => {
    for (let i = 1; i < BATS.length; i += 1) {
      expect(BATS[i].price).toBeGreaterThan(BATS[i - 1].price)
      expect(BATS[i].powerMul).toBeGreaterThan(BATS[i - 1].powerMul)
    }
  })

  it('배트마다 색과 굵기가 다르다 — 숫자만 다르면 산 보람이 안 보인다', () => {
    expect(new Set(BATS.map((b) => b.wood)).size).toBe(BATS.length)
    expect(new Set(BATS.map((b) => b.tip)).size).toBe(BATS.length)
  })
})

describe('batOf', () => {
  it('키로 찾는다', () => {
    expect(batOf('maple').name).toBe('메이플')
  })

  it('모르는 키는 맨손이다 — 저장된 값이 깨져도 들 것은 있어야 한다', () => {
    expect(batOf('없는배트').key).toBe('bare')
    expect(batOf(null).key).toBe('bare')
    expect(batOf(undefined).key).toBe('bare')
  })
})

describe('powerMulOf', () => {
  it('낀 배트의 배수를 준다', () => {
    expect(powerMulOf('carbon')).toBe(1.16)
    expect(powerMulOf('bare')).toBe(1)
    expect(powerMulOf('없는배트')).toBe(1)
  })
})
