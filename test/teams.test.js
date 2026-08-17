import { describe, it, expect } from 'vitest'
import { TEAMS, kitOf, GRID_W, GRID_H, PANTS } from '../src/render/teams.js'

const HEX = /^#[0-9A-F]{6}$/
const kits = () => TEAMS.flatMap((team) => [
  { label: `${team.id}-home`, kit: team.kits.home },
  { label: `${team.id}-away`, kit: team.kits.away },
])

describe('TEAMS', () => {
  it('10개 구단이 각각 홈·원정 한 벌씩 갖는다', () => {
    expect(TEAMS).toHaveLength(10)
    expect(kits()).toHaveLength(20)
    expect(new Set(TEAMS.map((t) => t.id)).size).toBe(10)
  })

  it('모든 격자가 9줄 × 6칸이다', () => {
    for (const { label, kit } of kits()) {
      expect(kit.torso, label).toHaveLength(GRID_H)
      for (const row of kit.torso) expect(row.length, `${label} "${row}"`).toBe(GRID_W)
    }
  })

  it('격자에 쓰인 글자가 전부 colors 에 있다', () => {
    for (const { label, kit } of kits()) {
      for (const row of kit.torso) {
        for (const ch of row) expect(kit.colors[ch], `${label} '${ch}'`).toMatch(HEX)
      }
    }
  })

  it('colors 에 안 쓰이는 색을 남겨두지 않는다', () => {
    for (const { label, kit } of kits()) {
      const used = new Set(kit.torso.join(''))
      expect(Object.keys(kit.colors).sort(), label).toEqual([...used].sort())
    }
  })

  it('모자·옷감 색이 유효한 hex 다', () => {
    for (const { label, kit } of kits()) {
      expect(kit.cap.crown, label).toMatch(HEX)
      expect(kit.cap.bill, label).toMatch(HEX)
      expect(kit.base, label).toMatch(HEX)
    }
  })

  it('바지는 구단과 무관하게 흰 긴바지 한 색이다', () => {
    expect(PANTS).toMatch(HEX)
    expect(PANTS).toBe('#F2F2F2')
  })

  it('격자 밖에서 그리는 것들은 색이 유효하다', () => {
    // 평평한 색면만 격자로 간다. 곡선인 것 — 줄무늬·옆구리 패널·목·소매 트림 — 은
    // 격자에 넣으면 계단이 지거나 가슴을 가로지르는 띠가 되어 버린다.
    expect(kits().filter(({ kit }) => kit.stripe).map((s) => s.label)).toEqual(['lg-home'])
    expect(kits().filter(({ kit }) => kit.panel).map((s) => s.label))
      .toEqual(['kia-home', 'kia-away', 'nc-home', 'nc-away'])

    for (const { label, kit } of kits()) {
      if (kit.stripe) expect(kit.stripe, label).toMatch(HEX)
      if (kit.panel) {
        expect(kit.panel.color, label).toMatch(HEX)
        expect(['sash', 'sides'], label).toContain(kit.panel.style)
      }
      if (kit.trim) {
        expect(kit.trim.length, label).toBeGreaterThan(0)
        for (const c of kit.trim) expect(c, label).toMatch(HEX)
      }
      // 목 트림은 트림 색이 있어야 그릴 수 있다.
      if (kit.collar) expect(kit.trim, label).toBeTruthy()
    }
  })

  it('옷감 색은 그 격자가 실제로 쓰는 색이다', () => {
    for (const { label, kit } of kits()) {
      expect(Object.values(kit.colors), label).toContain(kit.base)
    }
  })

  it('20벌이 서로 다르게 보인다', () => {
    const shapes = kits().map(({ kit }) => JSON.stringify([
      kit.torso.map((row) => [...row].map((ch) => kit.colors[ch]).join(',')),
      kit.cap,
    ]))
    expect(new Set(shapes).size).toBe(20)
  })
})

describe('kitOf', () => {
  it('키로 키트를 찾는다', () => {
    expect(kitOf('lg-home')).toBe(TEAMS.find((t) => t.id === 'lg').kits.home)
    expect(kitOf('nc-away')).toBe(TEAMS.find((t) => t.id === 'nc').kits.away)
  })

  it('모든 구단의 두 벌이 다 찾아진다', () => {
    for (const team of TEAMS) {
      expect(kitOf(`${team.id}-home`), team.id).toBeTruthy()
      expect(kitOf(`${team.id}-away`), team.id).toBeTruthy()
    }
  })

  it('없는 키는 null 이다 — 유니폼 없음으로 떨어진다', () => {
    expect(kitOf(null)).toBeNull()
    expect(kitOf(undefined)).toBeNull()
    expect(kitOf('')).toBeNull()
    expect(kitOf('lg')).toBeNull()
    expect(kitOf('lg-third')).toBeNull()
    expect(kitOf('nonesuch-home')).toBeNull()
  })
})
