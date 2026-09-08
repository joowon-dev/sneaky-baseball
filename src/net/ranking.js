// 랭킹 서버(Supabase)와 이야기하는 곳. 게임 로직은 여기 없다.
//
// **표에는 직접 못 닿는다.** 익명 키로 부를 수 있는 것은 아래 함수 여섯 개뿐이고,
// 그 함수들이 서버에서 신분을 확인하고 상한을 건다. 그래서 이 키가 밖에 나가도
// 남의 기록을 고치거나 남의 비밀을 읽을 수 없다.
//
// 보내는 것: 기기가 만든 무작위 uuid, 타구 하나(결과·비거리·구단), 별명.
// **개인을 식별할 수 있는 것은 없고, 점수도 안 보낸다** — 점수는 서버가 매긴다.

export const RANKING_URL = 'https://xajmblrdkdnqoxfvsfrt.supabase.co'
// 공개되도록 만들어진 키다(웹 앱이 브라우저에 담고 다니는 것과 같은 성질).
export const RANKING_KEY = 'sb_publishable_xsEat7HWFPI0td0olEVicw_pxa2Ct5K'

/** 기간 탭. 일간·주간은 **한국 시간**으로 끊는다 — 서버가 그렇게 계산한다. */
export const PERIODS = [
  { key: 'day', label: '일간' },
  { key: 'week', label: '주간' },
  { key: 'year', label: '연간' },
  { key: 'all', label: '전체' },
]

const TIMEOUT_MS = 8000

/**
 * RPC 하나를 부른다. 실패는 예외로 던지고, 부르는 쪽이 조용히 삼킨다 —
 * 랭킹이 안 되는 것과 게임이 안 되는 것은 다른 일이다.
 */
export async function rpc(name, body = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${RANKING_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: RANKING_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`${name} ${res.status} ${text.slice(0, 200)}`)
    }
    // 돌려줄 것이 없는 함수(204)도 있다.
    if (res.status === 204) return null
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

export function registerPlayer(nickname, secret) {
  return rpc('register_player', { p_nickname: nickname, p_secret: secret })
}

export function setNickname(playerId, secret, nickname) {
  return rpc('set_nickname', { p_player: playerId, p_secret: secret, p_nickname: nickname })
}

/**
 * 타구 하나를 그때그때 올린다.
 * **점수는 안 보낸다** — 무슨 결과를 몇 미터 쳤는지만 보내고, 서버가 규칙대로 매긴다.
 * 클라이언트가 계산한 점수를 그대로 받아 적으면 앱을 뜯은 사람이 아무 숫자나 넣을 수 있다.
 */
export function submitHit(playerId, secret, team, result, meters) {
  return rpc('submit_hit', {
    p_player: playerId, p_secret: secret, p_team: team, p_result: result, p_meters: meters,
  })
}

/** 복구 코드가 맞는지만 본다. */
export function verifyCode(playerId, secret) {
  return rpc('verify_code', { p_player: playerId, p_secret: secret })
}

export function teamRanking(period = 'all') {
  return rpc('team_ranking', { p_period: period })
}

export function playerRanking(period = 'all', limit = 20) {
  return rpc('player_ranking', { p_period: period, p_limit: limit })
}

export function myStanding(playerId, period = 'all') {
  return rpc('my_standing', { p_player: playerId, p_period: period })
}

/** 브라우저의 난수. 순수 모듈(sync.js)에 넘겨 준다. */
export function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length))
}
