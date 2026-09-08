import { describe, it, expect } from 'vitest'
import {
  pendingDeltas, hasPending, mergeSent, newSecret, defaultNickname,
  recoveryCode, parseRecoveryCode,
} from '../src/game/sync.js'

/** 정해진 바이트를 돌려주는 난수. 테스트가 결정론이어야 한다. */
const bytesOf = (...values) => (length) =>
  Uint8Array.from({ length }, (_, i) => values[i % values.length])

describe('pendingDeltas', () => {
  it('아직 안 보낸 몫만 준다', () => {
    expect(pendingDeltas({ lotte: 500, kia: 120 }, { lotte: 300 }))
      .toEqual({ lotte: 200, kia: 120 })
  })

  it('다 보냈으면 아무것도 안 준다 — 조용해야 한다', () => {
    expect(pendingDeltas({ lotte: 500 }, { lotte: 500 })).toEqual({})
    expect(hasPending({ lotte: 500 }, { lotte: 500 })).toBe(false)
  })

  it('보낸 값이 더 크면 음수를 만들지 않는다', () => {
    expect(pendingDeltas({ lotte: 100 }, { lotte: 400 })).toEqual({})
  })
})

describe('mergeSent', () => {
  // 이게 이 모듈의 핵심이다. cheer 를 통째로 복사하면 보내는 사이에 쌓인 몫이 사라진다.
  it('보낸 만큼만 더한다 — 보내는 사이에 더 친 몫은 다음에 간다', () => {
    const sent = { lotte: 300 }
    const deltas = { lotte: 200 }
    // 보내는 동안 홈런을 더 쳐서 cheer 는 이미 600 이 됐다고 하자.
    const next = mergeSent(sent, deltas)
    expect(next).toEqual({ lotte: 500 })
    expect(pendingDeltas({ lotte: 600 }, next)).toEqual({ lotte: 100 })
  })

  it('원래 값을 건드리지 않는다', () => {
    const sent = { lotte: 300 }
    mergeSent(sent, { lotte: 200 })
    expect(sent).toEqual({ lotte: 300 })
  })
})

describe('newSecret', () => {
  it('24자이고 헷갈리는 글자(0·1·l·o)가 없다 — 사람이 옮겨 적는 코드다', () => {
    const secret = newSecret(bytesOf(0, 1, 2, 3, 4, 5, 6, 7))
    expect(secret).toHaveLength(24)
    expect(secret).toMatch(/^[abcdefghijkmnpqrstuvwxyz23456789]+$/)
  })

  it('바이트가 다르면 다른 값이 나온다', () => {
    expect(newSecret(bytesOf(0))).not.toBe(newSecret(bytesOf(7)))
  })
})

describe('defaultNickname', () => {
  it('서버의 이름 규칙을 통과하는 이름을 만든다', () => {
    expect(defaultNickname(bytesOf(1, 44))).toBe('몰래타자0300')
    expect(defaultNickname(bytesOf(0, 7))).toBe('몰래타자0007')
  })
})

describe('recoveryCode', () => {
  const id = '45a30b46-1ec5-467c-a2dc-df5491549a34'
  const secret = 'abcdefghijkmnpqrstuvwxyz'

  it('한 줄로 붙였다가 도로 가른다', () => {
    expect(parseRecoveryCode(recoveryCode(id, secret))).toEqual({ playerId: id, secret })
  })

  it('앞뒤 공백은 봐 준다 — 붙여넣기하면 딸려 온다', () => {
    expect(parseRecoveryCode(`  ${recoveryCode(id, secret)}\n`)).toEqual({ playerId: id, secret })
  })

  it('모양이 안 맞으면 null 이다 — 오타를 조용히 받아들이면 안 된다', () => {
    expect(parseRecoveryCode('그냥아무말')).toBeNull()
    expect(parseRecoveryCode(`${id}.짧음`)).toBeNull()
    expect(parseRecoveryCode(`아이디아님.${secret}`)).toBeNull()
    expect(parseRecoveryCode('')).toBeNull()
    expect(parseRecoveryCode(null)).toBeNull()
  })

  it('아직 등록 전이면 보여 줄 코드가 없다', () => {
    expect(recoveryCode(null, secret)).toBe('')
    expect(recoveryCode(id, null)).toBe('')
  })
})
