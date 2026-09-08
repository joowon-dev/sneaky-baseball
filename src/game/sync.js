// 서버에 무엇을 보낼지 정하는 순수 모듈. 네트워크는 모른다 — `src/net/ranking.js` 가 한다.
//
// **타구 하나를 친 그때 하나씩 올린다.** 예전엔 구단별 누적을 5분마다 올렸는데,
// 그러면 클라이언트가 계산해 둔 숫자를 서버가 그대로 받아 적게 된다 —
// 앱을 뜯은 사람이 아무 값이나 넣을 수 있는 자리였다.
// 지금은 「무슨 결과를 몇 미터 쳤는지」만 보내고 점수는 서버가 매긴다.
//
// 못 보낸 타구는 줄을 서서 기다린다. 오프라인에서 친 것도 다음에 올라간다.

/**
 * 줄의 최대 길이. 오래 오프라인이어도 메모리와 저장이 부풀지 않게 막는다.
 * 넘치면 **오래된 것부터 버린다** — 방금 친 타구가 안 올라가는 쪽이 더 이상하다.
 */
export const MAX_PENDING = 200

/** 줄에 세운다. 넘치면 앞에서 버린다. */
export function enqueueHit(queue, hit) {
  const next = [...queue, hit]
  return next.length > MAX_PENDING ? next.slice(next.length - MAX_PENDING) : next
}

/** 맨 앞 하나. 없으면 null. */
export function headHit(queue) {
  return queue.length > 0 ? queue[0] : null
}

/** 맨 앞을 보냈다. 줄에서 뺀다. */
export function dropHead(queue) {
  return queue.slice(1)
}

/**
 * 서버가 받아 주는 모양인가. 여기서 한 번 거르면 서버에 헛걸음을 안 한다.
 * **아웃·파울·헛스윙은 애초에 0점이라 보내지 않는다.**
 */
export function sendableHit(hit) {
  if (!hit) return false
  if (hit.result !== 'homerun' && hit.result !== 'hit') return false
  return Number.isInteger(hit.meters) && hit.meters > 0
}

const SECRET_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'
const SECRET_LEN = 24

/**
 * 기기의 비밀 문자열. 이것과 id 한 쌍이 신분이고, 둘을 이어 붙인 것이 「복구 코드」다.
 * randomBytes 는 길이만큼의 0..255 배열을 주는 함수 — 브라우저는 crypto 가 준다.
 */
export function newSecret(randomBytes) {
  const bytes = randomBytes(SECRET_LEN)
  let out = ''
  for (let i = 0; i < SECRET_LEN; i += 1) {
    out += SECRET_ALPHABET[bytes[i] % SECRET_ALPHABET.length]
  }
  return out
}

/** 이름을 안 정했을 때 쓰는 이름. 상점에서 언제든 바꾼다. */
export function defaultNickname(randomBytes) {
  const bytes = randomBytes(2)
  const number = ((bytes[0] << 8) | bytes[1]) % 10000
  return `몰래타자${String(number).padStart(4, '0')}`
}

/** 사람이 옮겨 적을 한 줄. 다른 기기에 넣으면 기록이 따라온다. */
export function recoveryCode(playerId, secret) {
  if (!playerId || !secret) return ''
  return `${playerId}.${secret}`
}

/** 복구 코드를 도로 가른다. 모양이 안 맞으면 null — 오타를 조용히 받아들이면 안 된다. */
export function parseRecoveryCode(text) {
  const trimmed = String(text ?? '').trim()
  const dot = trimmed.indexOf('.')
  if (dot < 0) return null

  const playerId = trimmed.slice(0, dot)
  const secret = trimmed.slice(dot + 1)
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuid.test(playerId) || secret.length < 16) return null

  return { playerId, secret }
}
