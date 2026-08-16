import { describe, it, expect } from 'vitest'
import { kitRGBA, jerseyBase } from '../src/render/kit-bitmap.js'
import { TEAMS, kitOf, GRID_W, GRID_H } from '../src/render/teams.js'

const pixel = (data, col, row) => {
  const i = (row * GRID_W + col) * 4
  return [data[i], data[i + 1], data[i + 2], data[i + 3]]
}

describe('kitRGBA', () => {
  it('격자 크기만큼의 RGBA 바이트를 준다', () => {
    const data = kitRGBA(kitOf('doosan-home'))
    expect(data).toBeInstanceOf(Uint8ClampedArray)
    expect(data).toHaveLength(GRID_W * GRID_H * 4)
  })

  it('글자를 그 자리의 색으로 푼다', () => {
    // 두산 홈 2번 줄은 'wnnrnw' — 0열이 흰색, 1열이 네이비, 3열이 빨강.
    const data = kitRGBA(kitOf('doosan-home'))
    expect(pixel(data, 0, 2)).toEqual([0xF2, 0xF2, 0xF2, 255])
    expect(pixel(data, 1, 2)).toEqual([0x18, 0x28, 0x38, 255])
    expect(pixel(data, 3, 2)).toEqual([0xE4, 0x02, 0x2D, 255])
  })

  it('LG 홈 몸통은 격자에서 무지 흰색이다 — 핀스트라이프는 격자 밖에서 긋는다', () => {
    const data = kitRGBA(kitOf('lg-home'))
    for (const col of [0, 1, 2, 3, 4, 5]) {
      expect(pixel(data, col, 3), `col ${col}`).toEqual([0xF2, 0xF2, 0xF2, 255])
    }
    // 어깨 3선은 격자에 남아 있다.
    expect(pixel(data, 2, 0)).toEqual([0x18, 0x18, 0x18, 255])
  })

  it('모든 픽셀이 불투명하다 — 실루엣이 비쳐 보이면 안 된다', () => {
    for (const team of TEAMS) {
      for (const key of [`${team.id}-home`, `${team.id}-away`]) {
        const data = kitRGBA(kitOf(key))
        for (let i = 3; i < data.length; i += 4) expect(data[i], key).toBe(255)
      }
    }
  })

  it('20벌 전부 크기가 같다', () => {
    for (const team of TEAMS) {
      for (const key of [`${team.id}-home`, `${team.id}-away`]) {
        expect(kitRGBA(kitOf(key)), key).toHaveLength(GRID_W * GRID_H * 4)
      }
    }
  })
})

describe('jerseyBase', () => {
  it('옷감 색을 준다', () => {
    expect(jerseyBase(kitOf('doosan-home'))).toBe('#F2F2F2')
    expect(jerseyBase(kitOf('doosan-away'))).toBe('#182838')
    // 롯데 홈 바탕은 흰색이 아니라 아이보리다.
    expect(jerseyBase(kitOf('lotte-home'))).toBe('#E8E8D8')
    // LG 홈은 검정 칸이 흰 칸보다 많지만(핀스트라이프 + 어깨 3선) 옷감은 흰색이다.
    expect(jerseyBase(kitOf('lg-home'))).toBe('#F2F2F2')
  })

  it('20벌 모두 그 키트가 실제로 쓰는 색을 준다', () => {
    for (const team of TEAMS) {
      for (const key of [`${team.id}-home`, `${team.id}-away`]) {
        const kit = kitOf(key)
        expect(Object.values(kit.colors), key).toContain(jerseyBase(kit))
      }
    }
  })
})
