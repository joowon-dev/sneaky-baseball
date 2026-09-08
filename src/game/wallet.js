// 지갑·응원·소유. 순수 모듈 — 모든 함수는 새 값을 돌려준다.
//
// **통장이 둘이다.**
//   지갑(points)  안타·홈런으로 쌓이고, 배트를 사면 준다.
//   응원(cheer)   같은 값이 구단별로 쌓이고 **절대 안 준다**.
//
// 응원을 소비에서 떼어 놔야 「이 사람이 이 구단에 넣은 총량」이 남는다. 지갑 하나로 두면
// 배트를 살 때마다 응원이 깎여서, 온라인 랭킹이 「안 쓰고 모은 사람」 순위가 되어 버린다.

import { HOMERUN, HIT } from './judge.js'
import { BATS, DEFAULT_BAT, batOf } from './gear.js'

/** 안타가 홈런의 몇 곱절을 받는가. 홈런은 비거리 m 를 그대로 받는다. */
export const HIT_RATE = 0.4

export function createWallet(initial = {}) {
  const owned = Array.isArray(initial.owned) ? initial.owned : []
  return {
    points: Math.max(0, Math.round(initial.points ?? 0)),
    // 맨손 배트는 언제나 가지고 있다 — 저장된 값이 비어 있어도 들 것이 있어야 한다.
    owned: owned.includes(DEFAULT_BAT) ? [...owned] : [DEFAULT_BAT, ...owned],
    equipped: initial.equipped ?? DEFAULT_BAT,
    cheer: { ...(initial.cheer ?? {}) },
  }
}

/**
 * 이 타구가 몇 점인가.
 * **아웃·파울·헛스윙은 0점이다** — 아웃은 여전히 잃는 게 없다. 얻는 것도 없을 뿐이다.
 */
export function pointsFor(result, meters) {
  const m = Math.max(0, Math.round(meters ?? 0))
  if (result === HOMERUN) return m
  if (result === HIT) return Math.round(m * HIT_RATE)
  return 0
}

/** 'lotte-home' → 'lotte'. 유니폼을 안 입었으면 적립할 구단이 없다. */
export function teamIdOf(kitKey) {
  if (typeof kitKey !== 'string' || kitKey === '') return null
  const [team] = kitKey.split('-')
  return team || null
}

/**
 * 타구 하나를 번다. 지갑과 응원에 **같은 값**이 들어간다.
 * teamId 가 없으면(유니폼 없음) 적립처가 없어 지갑만 쌓인다.
 */
export function earn(wallet, result, meters, teamId = null) {
  const gained = pointsFor(result, meters)
  if (gained === 0) return { wallet, gained: 0 }

  const cheer = { ...wallet.cheer }
  if (teamId) cheer[teamId] = (cheer[teamId] ?? 0) + gained

  return { wallet: { ...wallet, points: wallet.points + gained, cheer }, gained }
}

/** 살 수 있는가 — 아직 없고, 돈이 되는가. */
export function canBuy(wallet, key) {
  const bat = BATS.find((b) => b.key === key)
  if (!bat || wallet.owned.includes(key)) return false
  return wallet.points >= bat.price
}

/**
 * 배트를 산다. 사면 **바로 끼운다** — 사 놓고 또 고르게 하면 산 티가 안 난다.
 * 못 사면 지갑이 그대로 돌아온다.
 */
export function buy(wallet, key) {
  if (!canBuy(wallet, key)) return { wallet, bought: false }
  const bat = batOf(key)
  return {
    wallet: {
      ...wallet,
      points: wallet.points - bat.price,
      owned: [...wallet.owned, key],
      equipped: key,
    },
    bought: true,
  }
}

/** 가진 배트만 끼울 수 있다. */
export function equip(wallet, key) {
  if (!wallet.owned.includes(key)) return wallet
  return { ...wallet, equipped: key }
}

/** 지금 낀 배트의 힘 배수. 궤적에 그대로 곱해진다. */
export function powerMul(wallet) {
  return batOf(wallet.equipped).powerMul
}

/**
 * 응원 포인트를 사람에게 보여 주는 모양. **100점이 1.00 이다** —
 * 148 이면 1.48. 원장은 정수로 두고 **보여 줄 때만** 나눈다.
 * 소수로 저장하면 더할 때마다 오차가 끼고, 서버가 매기는 점수와도 어긋난다.
 */
export function formatCheer(points) {
  const value = Math.max(0, Math.round(points ?? 0)) / 100
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 응원 원장을 많이 넣은 구단 순으로. 같으면 구단 키 순 — 순서가 매번 흔들리면 안 된다. */
export function cheerRanking(wallet) {
  return Object.entries(wallet.cheer)
    .filter(([, points]) => points > 0)
    .map(([team, points]) => ({ team, points }))
    .sort((a, b) => b.points - a.points || a.team.localeCompare(b.team))
}
