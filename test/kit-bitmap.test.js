import { describe, it, expect } from 'vitest'
import { kitRGBA } from '../src/render/kit-bitmap.js'
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

  it('LG 홈은 세로 줄무늬가 열마다 번갈아 선다', () => {
    const data = kitRGBA(kitOf('lg-home'))
    // 3번 줄 'wkwkwk' — 짝수 열 흰색, 홀수 열 검정.
    expect(pixel(data, 0, 3)).toEqual([0xF2, 0xF2, 0xF2, 255])
    expect(pixel(data, 1, 3)).toEqual([0x18, 0x18, 0x18, 255])
    expect(pixel(data, 2, 3)).toEqual([0xF2, 0xF2, 0xF2, 255])
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
