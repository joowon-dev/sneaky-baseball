// 서버에 무엇을 보낼지 정하는 순수 모듈. 네트워크는 모른다 — `src/net/ranking.js` 가 한다.
//
// **총량이 아니라 델타를 보낸다.** 총량을 그대로 올리면 재시도 한 번이 곧 중복 적립이고,
// 기기를 두 대 쓰는 사람의 값이 서로를 덮어쓴다. 그래서 「지금까지 보낸 값」(sent)을 따로
// 들고, 그 차이만 올린 뒤 성공했을 때만 옮겨 적는다.

/** 아직 안 보낸 몫. 구단별로 `cheer - sent` 다. */
export function pendingDeltas(cheer = {}, sent = {}) {
  const out = {}
  for (const [team, total] of Object.entries(cheer)) {
    const delta = Math.floor(total) - Math.floor(sent[team] ?? 0)
    if (delta > 0) out[team] = delta
  }
  return out
}

/** 보낼 것이 있는가. 없으면 아예 부르지 않는다 — 조용한 앱이어야 한다. */
export function hasPending(cheer, sent) {
  return Object.keys(pendingDeltas(cheer, sent)).length > 0
}

/**
 * 보내기가 **성공한 뒤에만** 부른다. 보낸 만큼을 sent 에 더한다.
 * cheer 를 그대로 복사하지 않는다 — 보내는 사이에 더 쌓였을 수 있고,
 * 그 몫까지 보냈다고 적으면 영영 사라진다.
 */
export function mergeSent(sent = {}, deltas = {}) {
  const out = { ...sent }
  for (const [team, points] of Object.entries(deltas)) {
    out[team] = (out[team] ?? 0) + points
  }
  return out
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
