// 배트 데이터. 순수 모듈 — teams.js 가 유니폼 데이터를 갖는 것과 같은 자리다.
//
// 한 줄에 **값(price)·힘(powerMul)·생김새(wood/grip/tip)** 가 같이 있다.
// 숫자만 다르고 그림이 같으면 산 보람이 눈에 안 보인다.
//
// 가격과 배수는 **손맛으로 정하는 값**이다. 배수 1.16 이면 발사 속도가 16% 늘고,
// 비거리는 대략 그 제곱을 따라 35%쯤 늘어난다.
//
// 길이(batBone)는 건드리지 않는다 — 포즈 뼈대 좌표라 자세를 다시 그려야 한다.

/**
 * 배럴이 손잡이보다 몇 배 굵은가. **맨손 배트의 1.8 은 예전 그림 그대로다** —
 * 이 값이 바뀌면 아무 배트도 안 산 사람의 화면이 달라진다.
 */
const BARE_TIP = 1.8

export const BATS = [
  {
    key: 'bare',
    name: '맨손 배트',
    note: '처음부터 들고 있는 것',
    price: 0,
    powerMul: 1.0,
    wood: '#B87A3C',
    grip: '#6B4420',
    tip: BARE_TIP,
  },
  {
    key: 'ash',
    name: '물푸레',
    note: '결이 흰 보급형',
    price: 800,
    powerMul: 1.04,
    wood: '#D9B382',
    grip: '#7A5A34',
    tip: 1.9,
  },
  {
    key: 'maple',
    name: '메이플',
    note: '단단하고 붉다',
    price: 2500,
    powerMul: 1.08,
    wood: '#A8552A',
    grip: '#5A2E15',
    tip: 2.0,
  },
  {
    key: 'birch',
    name: '자작',
    note: '가볍고 하얗다',
    price: 6000,
    powerMul: 1.12,
    wood: '#EBD6B0',
    grip: '#8A6A3A',
    tip: 2.1,
  },
  {
    key: 'carbon',
    name: '카본',
    // 검정 실루엣 위에 얹히므로 순수한 검정은 못 쓴다 — 배트가 사라진다.
    note: '나무가 아니다',
    price: 15000,
    powerMul: 1.16,
    wood: '#3A4048',
    grip: '#1B1E22',
    tip: 2.2,
  },
]

/** 아무것도 안 샀을 때 들고 있는 배트. */
export const DEFAULT_BAT = 'bare'

/** 키로 배트를 찾는다. 모르는 키는 맨손이다 — 저장된 값이 깨져도 게임은 돈다. */
export function batOf(key) {
  return BATS.find((bat) => bat.key === key) ?? BATS[0]
}

/** 힘 배수만. 궤적을 만들 때 쓴다. */
export function powerMulOf(key) {
  return batOf(key).powerMul
}
