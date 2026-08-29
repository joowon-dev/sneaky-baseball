// 외야수. 궤적 하나를 받아 **사람이 거기 닿는가**에만 답하는 순수 모듈.
// batted.js 가 이미 낙구 지점(carry)과 체공 시간(hops[0].durMs)을 내주므로
// 여기서 새로 푸는 물리는 없다.
//
// 야수를 못 박아 두면 담장과 똑같은 물건 — 구멍 뚫린 낮은 벽 — 이 되어 몇 판이면
// 「저기만 피하면 된다」로 굳는다. 그래서 뛰게 했다. 달리는 속도가 상수 하나라
// 여전히 결정론적이고, 「보이는 그대로 판정된다」도 안 깨진다.

import { carry, FENCE_DIST } from './batted.js'

/** 처음 서 있는 자리 — 타격점에서, 필드 높이 단위. */
export const START_X = 2.2
/** 달리는 속도 — 필드 높이 / 초. */
export const RUN_SPEED = 1.0
/** 글러브가 닿는 반경. 이 안에 떨어지면 안 달리고 잡는다. */
export const REACH = 0.14

/** 담장에 닿았는지 볼 때 쓰는 여유. 부동소수 오차만 걷어낸다. */
const EPS = 1e-9

/**
 * 잡는 건 **뜬공뿐이다.** 바운드된 공은 안 잡고, 담장을 넘긴 공은 애초에 관여하지 않는다.
 * 담장을 직격해 첫 구간이 끊긴 라이너도 공중에서 벽에 막힌 것이라 못 잡는다.
 *
 * 반환값의 hangMs 는 **궤적이 끝나는 시각**이기도 하다 — 잡힌 공은 거기서 멈춘다.
 * 홈런이 overAtMs 에서 끝나는 것과 같은 자리다.
 */
export function chase(flight) {
  if (!flight || flight.over) return null

  const first = flight.hops?.[0]
  if (!first || first.vx <= 0) return null // 파울처럼 뒤로 간 공

  const spotX = carry(flight)
  if (spotX >= FENCE_DIST - EPS) return null // 담장 직격 — 공중에서 막혔다

  const hangMs = first.durMs
  const run = Math.max(0, Math.abs(spotX - START_X) - REACH)
  const needMs = (run / RUN_SPEED) * 1000

  return { caught: needMs <= hangMs, spotX, needMs, hangMs }
}
