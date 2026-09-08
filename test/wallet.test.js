import { describe, it, expect } from 'vitest'
import {
  createWallet, pointsFor, teamIdOf, earn, canBuy, buy, equip, powerMul, cheerRanking,
  formatCheer,
} from '../src/game/wallet.js'
import { HOMERUN, HIT, OUT, FOUL, WHIFF } from '../src/game/judge.js'

describe('createWallet', () => {
  it('빈 지갑은 맨손 배트를 들고 시작한다', () => {
    expect(createWallet()).toEqual({ points: 0, owned: ['bare'], equipped: 'bare', cheer: {} })
  })

  it('저장된 값을 그대로 되살린다', () => {
    const saved = { points: 1200, owned: ['bare', 'ash'], equipped: 'ash', cheer: { lotte: 3000 } }
    expect(createWallet(saved)).toEqual(saved)
  })

  it('맨손 배트가 빠진 채로 저장돼 있어도 도로 넣는다', () => {
    expect(createWallet({ owned: ['maple'] }).owned).toEqual(['bare', 'maple'])
  })
})

describe('pointsFor', () => {
  // 값을 못 박는다 — 홈런은 비거리 m 그대로, 안타는 그 0.4배.
  it('홈런 100m는 100점, 안타 100m는 40점', () => {
    expect(pointsFor(HOMERUN, 100)).toBe(100)
    expect(pointsFor(HIT, 100)).toBe(40)
    expect(pointsFor(HIT, 55)).toBe(22)
  })

  it('아웃·파울·헛스윙은 0점 — 아웃은 잃는 게 없고 얻는 것도 없다', () => {
    expect(pointsFor(OUT, 150)).toBe(0)
    expect(pointsFor(FOUL, 40)).toBe(0)
    expect(pointsFor(WHIFF, 0)).toBe(0)
  })
})

describe('teamIdOf', () => {
  it('유니폼 키에서 구단만 뽑는다', () => {
    expect(teamIdOf('lotte-home')).toBe('lotte')
    expect(teamIdOf('kia-away')).toBe('kia')
  })

  it('유니폼이 없으면 적립할 구단이 없다', () => {
    expect(teamIdOf(null)).toBeNull()
    expect(teamIdOf('')).toBeNull()
  })
})

describe('earn', () => {
  it('지갑과 응원에 같은 값이 들어간다', () => {
    const { wallet, gained } = earn(createWallet(), HOMERUN, 120, 'lotte')
    expect(gained).toBe(120)
    expect(wallet.points).toBe(120)
    expect(wallet.cheer).toEqual({ lotte: 120 })
  })

  it('응원은 구단별로 따로 쌓인다', () => {
    let w = createWallet()
    w = earn(w, HOMERUN, 100, 'lotte').wallet
    w = earn(w, HOMERUN, 60, 'kia').wallet
    w = earn(w, HIT, 50, 'lotte').wallet // 20점
    expect(w.cheer).toEqual({ lotte: 120, kia: 60 })
    expect(w.points).toBe(180)
  })

  it('유니폼을 안 입었으면 지갑만 쌓인다', () => {
    const { wallet } = earn(createWallet(), HOMERUN, 100, null)
    expect(wallet.points).toBe(100)
    expect(wallet.cheer).toEqual({})
  })

  it('0점짜리 타구는 지갑을 건드리지 않는다', () => {
    const before = createWallet({ points: 10 })
    const { wallet, gained } = earn(before, OUT, 150, 'lotte')
    expect(gained).toBe(0)
    expect(wallet).toBe(before) // 같은 값이 아니라 같은 것이어야 한다
  })
})

describe('buy', () => {
  it('돈이 되면 사고, 산 배트는 바로 낀다', () => {
    const { wallet, bought } = buy(createWallet({ points: 1000 }), 'ash')
    expect(bought).toBe(true)
    expect(wallet.points).toBe(200) // 1000 - 800
    expect(wallet.owned).toEqual(['bare', 'ash'])
    expect(wallet.equipped).toBe('ash')
  })

  it('돈이 모자라면 안 사진다', () => {
    const before = createWallet({ points: 799 })
    const { wallet, bought } = buy(before, 'ash')
    expect(bought).toBe(false)
    expect(wallet).toBe(before)
  })

  it('이미 가진 배트는 다시 안 사진다', () => {
    const before = createWallet({ points: 99999, owned: ['bare', 'ash'] })
    expect(canBuy(before, 'ash')).toBe(false)
    expect(buy(before, 'ash').wallet.points).toBe(99999)
  })

  it('없는 배트는 못 산다', () => {
    expect(canBuy(createWallet({ points: 99999 }), '없는배트')).toBe(false)
  })

  // 이게 통장을 둘로 나눈 이유다. 하나로 두면 랭킹이 「안 쓰고 모은 사람」 순위가 된다.
  it('배트를 사도 응원 포인트는 한 점도 안 준다', () => {
    let w = earn(createWallet(), HOMERUN, 20000, 'lotte').wallet
    w = buy(w, 'carbon').wallet
    expect(w.points).toBe(5000) // 20000 - 15000
    expect(w.cheer.lotte).toBe(20000)
  })
})

describe('equip', () => {
  it('가진 배트만 낀다', () => {
    const w = createWallet({ owned: ['bare', 'maple'] })
    expect(equip(w, 'maple').equipped).toBe('maple')
    expect(equip(w, 'carbon').equipped).toBe('bare')
  })

  it('낀 배트의 힘 배수가 궤적으로 간다', () => {
    expect(powerMul(createWallet())).toBe(1)
    expect(powerMul(createWallet({ owned: ['bare', 'carbon'], equipped: 'carbon' }))).toBe(1.16)
  })
})

describe('cheerRanking', () => {
  it('많이 넣은 구단 순으로 준다', () => {
    const w = createWallet({ cheer: { kia: 300, lotte: 1200, lg: 0 } })
    expect(cheerRanking(w)).toEqual([
      { team: 'lotte', points: 1200 },
      { team: 'kia', points: 300 },
    ])
  })

  it('같은 점수면 순서가 흔들리지 않는다', () => {
    const w = createWallet({ cheer: { nc: 100, kia: 100 } })
    expect(cheerRanking(w).map((r) => r.team)).toEqual(['kia', 'nc'])
  })
})

describe('formatCheer', () => {
  // 100점이 1.00 이다. 값을 못 박는다 — 「나눈 값과 같다」는 단언은 어떤 나눗수로도 통과한다.
  it('148 은 1.48 이다', () => {
    expect(formatCheer(148)).toBe('1.48')
    expect(formatCheer(100)).toBe('1.00')
    expect(formatCheer(5)).toBe('0.05')
    expect(formatCheer(0)).toBe('0.00')
  })

  it('커지면 천 단위를 끊는다', () => {
    expect(formatCheer(1234567)).toBe('12,345.67')
  })

  it('없거나 이상한 값은 0.00 이다', () => {
    expect(formatCheer(null)).toBe('0.00')
    expect(formatCheer(undefined)).toBe('0.00')
    expect(formatCheer(-500)).toBe('0.00')
  })
})
