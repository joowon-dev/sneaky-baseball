import { describe, it, expect } from 'vitest'
import {
  enqueueHit, headHit, dropHead, sendableHit, MAX_PENDING,
  newSecret, defaultNickname, recoveryCode, parseRecoveryCode,
} from '../src/game/sync.js'

/** 정해진 바이트를 돌려주는 난수. 테스트가 결정론이어야 한다. */
const bytesOf = (...values) => (length) =>
  Uint8Array.from({ length }, (_, i) => values[i % values.length])

const hit = (meters, result = 'homerun') => ({ team: 'lotte', result, meters })

describe('보낼 줄', () => {
  it('친 순서대로 줄을 선다', () => {
    const queue = enqueueHit(enqueueHit([], hit(100)), hit(120))
    expect(queue).toEqual([hit(100), hit(120)])
    expect(headHit(queue)).toEqual(hit(100))
    expect(dropHead(queue)).toEqual([hit(120)])
  })

  it('빈 줄에는 보낼 것이 없다', () => {
    expect(headHit([])).toBeNull()
    expect(dropHead([])).toEqual([])
  })

  it('원래 줄을 건드리지 않는다', () => {
    const queue = [hit(100)]
    enqueueHit(queue, hit(120))
    dropHead(queue)
    expect(queue).toEqual([hit(100)])
  })

  // 오래 오프라인이어도 저장이 부풀면 안 된다. 그리고 버릴 것은 **오래된 쪽**이다.
  it('줄이 넘치면 오래된 것부터 버린다', () => {
    let queue = []
    for (let i = 0; i < MAX_PENDING + 5; i += 1) queue = enqueueHit(queue, hit(i + 1))
    expect(queue).toHaveLength(MAX_PENDING)
    expect(queue[0].meters).toBe(6)
    expect(queue[MAX_PENDING - 1].meters).toBe(MAX_PENDING + 5)
  })
})

describe('sendableHit', () => {
  it('홈런과 안타만 보낸다 — 나머지는 애초에 0점이다', () => {
    expect(sendableHit(hit(158))).toBe(true)
    expect(sendableHit(hit(80, 'hit'))).toBe(true)
    expect(sendableHit(hit(150, 'out'))).toBe(false)
    expect(sendableHit(hit(20, 'foul'))).toBe(false)
    expect(sendableHit(hit(0, 'whiff'))).toBe(false)
  })

  it('비거리가 0이거나 정수가 아니면 안 보낸다', () => {
    expect(sendableHit(hit(0))).toBe(false)
    expect(sendableHit(hit(-5))).toBe(false)
    expect(sendableHit(hit(12.5))).toBe(false)
    expect(sendableHit(null)).toBe(false)
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
