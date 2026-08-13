# KBO 구단 유니폼 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 타자와 투수에게 KBO 10개 구단의 홈·원정 유니폼을 픽셀 무늬로 입히고, 트레이 메뉴에서 고른 값을 저장한다.

**Architecture:** 검은 실루엣은 그대로 두고 상의·모자 자리에만 덧그린다. 상의는 6×9 격자 비트맵을 오프스크린 캔버스에 한 번 구워 두고, 몸통 캡슐 경로로 클립을 잡은 뒤 `imageSmoothingEnabled = false`로 확대해 얹는다. 유니폼 데이터는 Canvas를 모르는 순수 모듈에 있고, 고르는 곳은 네이티브 셸의 트레이 서브메뉴다.

**Tech Stack:** 순수 ES 모듈 + Canvas 2D, vitest, Swift/AppKit(맥 셸), .NET WinForms(윈도우 셸)

**Spec:** `docs/superpowers/specs/2026-08-13-kbo-uniforms-design.md`

## Global Constraints

- 판정·물리·타구 코드(`src/game/`)는 한 줄도 바꾸지 않는다. 이번 변경은 전부 그리는 쪽이다.
- `src/render/teams.js`는 Canvas도 셸도 `document`도 모른다 — 순수 데이터와 순수 함수만. `test/`는 이런 순수 모듈만 테스트한다.
- 상의 격자는 **가로 6칸 × 세로 9칸** 고정. 격자에 쓰인 글자는 그 키트의 `colors`에 반드시 있어야 한다.
- 키 형식은 `<teamId>-<home|away>` (예: `lg-home`). 저장되는 값도 이 문자열이다. 유니폼 없음은 `null`.
- 기본값은 유니폼 없음(검은 실루엣). 타자와 투수는 독립적으로 고른다.
- 로고·워드마크·등번호는 넣지 않는다. 가슴 글씨 자리는 색 띠 한 줄로만 표현한다.
- 주석과 커밋 메시지는 한국어. 기존 코드의 밀도와 어투를 따른다.
- 각 태스크 끝에서 `npm test`가 통과해야 한다.

---

### Task 1: 유니폼 데이터 (`src/render/teams.js`)

10개 구단 × 홈·원정 = 20벌의 색과 격자. 이 태스크 하나로 데이터가 완성되고, 이후 태스크는 전부 이걸 소비한다.

**Files:**
- Create: `src/render/teams.js`
- Test: `test/teams.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `TEAMS: Array<{ id: string, name: string, kits: { home: Kit, away: Kit } }>`
  - `Kit: { colors: Record<string, string>, torso: string[], cap: { crown: string, bill: string } }`
  - `kitOf(key: string | null | undefined): Kit | null`
  - `GRID_W = 6`, `GRID_H = 9`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/teams.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { TEAMS, kitOf, GRID_W, GRID_H } from '../src/render/teams.js'

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

  it('모자 색이 유효한 hex 다', () => {
    for (const { label, kit } of kits()) {
      expect(kit.cap.crown, label).toMatch(HEX)
      expect(kit.cap.bill, label).toMatch(HEX)
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
```

- [ ] **Step 2: 실패하는 걸 확인한다**

Run: `npm test -- teams`
Expected: FAIL — `Failed to resolve import "../src/render/teams.js"`

- [ ] **Step 3: 데이터를 쓴다**

`src/render/teams.js`. 색과 무늬는 구단 공식 판매처 상품 사진에서 뽑았다(spec 「자료 수집」 참고). 격자 글자: `w` 흰 · `k` 검정 · `n` 네이비 · `r` 빨강 · `b` 파랑 · `i` 아이보리 · `u` 버건디 · `p` 핑크 · `o` 주황 · `g` 금색 · `s` 하늘 · `y` 노랑 · `e` 초록 · `d` 다크.

```js
// KBO 10개 구단의 홈·원정 유니폼. Canvas도 셸도 모르는 순수 데이터다.
//
// 상의는 가로 6 × 세로 9칸 격자다. 1080 화면에서 몸통이 8×14px이라 이 정도가
// 들어간다 — 핀스트라이프, 옆구리 사선, 소매 트림 줄까지는 되고 로고는 안 된다.
// 0번 줄이 어깨, 2번 줄이 가슴 글씨 자리다. 가슴 글씨는 글자 모양이 아니라
// 그 자리의 색 띠로만 표현한다(상표를 그리지 않는다).
//
// 색은 기억이 아니라 구단 공식 판매처 상품 사진의 픽셀에서 뽑았다.

export const GRID_W = 6
export const GRID_H = 9

export const TEAMS = [
  {
    id: 'kia',
    name: 'KIA 타이거즈',
    kits: {
      // 흰 바탕에 옆구리 빨강 사선 패널.
      home: {
        colors: { w: '#F2F2F2', r: '#C80828' },
        torso: [
          'wwwwww',
          'wwwwww',
          'wrrrrw',
          'wwwwww',
          'wwwwww',
          'wwwwwr',
          'wwwwrr',
          'wwwrrr',
          'wwwrrr',
        ],
        cap: { crown: '#C81838', bill: '#C81838' },
      },
      // 검정 바탕에 같은 사선. 홈보다 빨강이 밝다.
      away: {
        colors: { k: '#282828', r: '#E8202C' },
        torso: [
          'kkkkkk',
          'kkkkkk',
          'krrrrk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkr',
          'kkkkrr',
          'kkkrrr',
          'kkkrrr',
        ],
        cap: { crown: '#181818', bill: '#181818' },
      },
    },
  },
  {
    id: 'samsung',
    name: '삼성 라이온즈',
    kits: {
      // 2026년에 빨간 라인을 빼고 파랑·흰색으로 돌아왔다.
      home: {
        colors: { w: '#F2F2F2', b: '#1848A8' },
        torso: [
          'bbbbbb',
          'wwwwww',
          'wbbbbw',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
        ],
        cap: { crown: '#0848A8', bill: '#0848A8' },
      },
      away: {
        colors: { b: '#1848A8', w: '#F2F2F2' },
        torso: [
          'wwwwww',
          'bbbbbb',
          'bwwwwb',
          'bbbbbb',
          'bbbbbb',
          'bbbbbb',
          'bbbbbb',
          'bbbbbb',
          'bbbbbb',
        ],
        cap: { crown: '#0848A8', bill: '#0848A8' },
      },
    },
  },
  {
    id: 'lg',
    name: 'LG 트윈스',
    kits: {
      // 검정 핀스트라이프. 10구단에서 유일한 세로 줄무늬 홈이다.
      home: {
        colors: { w: '#F2F2F2', k: '#181818', r: '#C8102E' },
        torso: [
          'wkwkwk',
          'wkwkwk',
          'wrrrrw',
          'wkwkwk',
          'wkwkwk',
          'wkwkwk',
          'wkwkwk',
          'wkwkwk',
          'wkwkwk',
        ],
        cap: { crown: '#181818', bill: '#181818' },
      },
      away: {
        colors: { k: '#181818', w: '#F2F2F2', r: '#C8102E' },
        torso: [
          'wwwwww',
          'kkkkkk',
          'krrrrk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
        ],
        cap: { crown: '#181818', bill: '#181818' },
      },
    },
  },
  {
    id: 'doosan',
    name: '두산 베어스',
    kits: {
      // 무지에 가깝다. 가슴 스크립트의 남색과 빨강 포인트로만 갈린다.
      home: {
        colors: { w: '#F2F2F2', n: '#182838', r: '#E4022D' },
        torso: [
          'wwwwww',
          'wwwwww',
          'wnnrnw',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
        ],
        cap: { crown: '#282848', bill: '#282848' },
      },
      away: {
        colors: { n: '#182838', w: '#F2F2F2', r: '#E4022D' },
        torso: [
          'nnnnnn',
          'nnnnnn',
          'nwwrwn',
          'nnnnnn',
          'nnnnnn',
          'nnnnnn',
          'nnnnnn',
          'nnnnnn',
          'nnnnnn',
        ],
        cap: { crown: '#282848', bill: '#282848' },
      },
    },
  },
  {
    id: 'kt',
    name: 'kt wiz',
    kits: {
      // 소매 끝 검정 라인 + 가슴 글씨의 빨강 별.
      home: {
        colors: { w: '#F2F2F2', k: '#181818', r: '#E8202C' },
        torso: [
          'kkkkkk',
          'wwwwww',
          'wkkrkw',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
        ],
        cap: { crown: '#181818', bill: '#181818' },
      },
      away: {
        colors: { k: '#181818', w: '#F2F2F2', r: '#E8202C' },
        torso: [
          'wwwwww',
          'kkkkkk',
          'kwwrwk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
          'kkkkkk',
        ],
        cap: { crown: '#181818', bill: '#181818' },
      },
    },
  },
  {
    id: 'ssg',
    name: 'SSG 랜더스',
    kits: {
      // 목·소매 빨강 트림. 가슴 글씨에 노랑 그라데이션이 섞인다.
      home: {
        colors: { w: '#F2F2F2', r: '#C81828', y: '#E8B830' },
        torso: [
          'rrrrrr',
          'wwwwww',
          'wrryrw',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
        ],
        cap: { crown: '#C81828', bill: '#C81828' },
      },
      away: {
        colors: { r: '#C81828', w: '#F2F2F2', e: '#2E8B57' },
        torso: [
          'wwwwww',
          'rrrrrr',
          'rwwewr',
          'rrrrrr',
          'rrrrrr',
          'rrrrrr',
          'rrrrrr',
          'rrrrrr',
          'rrrrrr',
        ],
        cap: { crown: '#C81828', bill: '#C81828' },
      },
    },
  },
  {
    id: 'lotte',
    name: '롯데 자이언츠',
    kits: {
      // 홈이 흰색이 아니라 아이보리다 — 10구단에서 여기뿐이다.
      home: {
        colors: { i: '#E8E8D8', n: '#282838', r: '#D31145' },
        torso: [
          'nnnnnn',
          'iiiiii',
          'irrrri',
          'iiiiii',
          'iiiiii',
          'iiiiii',
          'iiiiii',
          'iiiiii',
          'iiiiii',
        ],
        cap: { crown: '#383848', bill: '#383848' },
      },
      away: {
        colors: { n: '#282838', r: '#D31145' },
        torso: [
          'nnnnnn',
          'nnnnnn',
          'nrrrrn',
          'nnnnnn',
          'nnnnnn',
          'nnnnnn',
          'nnnnnn',
          'nnnnnn',
          'nnnnnn',
        ],
        cap: { crown: '#383848', bill: '#383848' },
      },
    },
  },
  {
    id: 'hanwha',
    name: '한화 이글스',
    kits: {
      // 무지 흰 바탕에 주황 스크립트 하나. 10구단 유일한 주황이다.
      home: {
        colors: { w: '#F2F2F2', o: '#F85818' },
        torso: [
          'wwwwww',
          'wwwwww',
          'woooow',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
        ],
        cap: { crown: '#282838', bill: '#282838' },
      },
      // 상품명은 '다크네이비'지만 실측은 거의 검정이다.
      away: {
        colors: { d: '#282828', w: '#F2F2F2' },
        torso: [
          'dddddd',
          'dddddd',
          'dwwwwd',
          'dddddd',
          'dddddd',
          'dddddd',
          'dddddd',
          'dddddd',
          'dddddd',
        ],
        cap: { crown: '#282838', bill: '#282838' },
      },
    },
  },
  {
    id: 'nc',
    name: 'NC 다이노스',
    kits: {
      // 양 옆구리 패널 + 소매 금색 라인. 옆구리가 양쪽인 건 여기뿐이다.
      home: {
        colors: { w: '#F2F2F2', n: '#183848', g: '#C8A868' },
        torso: [
          'gggggg',
          'wwwwww',
          'wnnnnw',
          'nwwwwn',
          'nwwwwn',
          'nwwwwn',
          'nwwwwn',
          'nwwwwn',
          'nwwwwn',
        ],
        cap: { crown: '#183858', bill: '#183858' },
      },
      away: {
        colors: { n: '#183848', g: '#C8A868', s: '#90B8D8' },
        torso: [
          'gggggg',
          'nnnnnn',
          'nggggn',
          'snnnns',
          'snnnns',
          'snnnns',
          'snnnns',
          'snnnns',
          'snnnns',
        ],
        cap: { crown: '#183858', bill: '#183858' },
      },
    },
  },
  {
    id: 'kiwoom',
    name: '키움 히어로즈',
    kits: {
      // 보조색이 금색에서 핑크로 바뀌었다. 목·소매에 버건디+핑크 두 줄.
      home: {
        colors: { w: '#F2F2F2', u: '#582838', p: '#E890B0' },
        torso: [
          'uuuuuu',
          'pppppp',
          'wuuuuw',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
          'wwwwww',
        ],
        cap: { crown: '#481828', bill: '#481828' },
      },
      away: {
        colors: { u: '#582838', w: '#F2F2F2', p: '#E890B0' },
        torso: [
          'wwwwww',
          'pppppp',
          'uwwwwu',
          'uuuuuu',
          'uuuuuu',
          'uuuuuu',
          'uuuuuu',
          'uuuuuu',
          'uuuuuu',
        ],
        cap: { crown: '#481828', bill: '#481828' },
      },
    },
  },
]

const BY_KEY = new Map()
for (const team of TEAMS) {
  BY_KEY.set(`${team.id}-home`, team.kits.home)
  BY_KEY.set(`${team.id}-away`, team.kits.away)
}

/** 'kia-home' 같은 키를 키트로. 모르는 키는 null — 유니폼 없음(검은 실루엣)으로 떨어진다. */
export function kitOf(key) {
  if (typeof key !== 'string') return null
  return BY_KEY.get(key) ?? null
}
```

- [ ] **Step 4: 테스트가 통과하는 걸 확인한다**

Run: `npm test`
Expected: PASS — `teams.test.js` 8개 포함 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add src/render/teams.js test/teams.test.js
git commit -m "feat: KBO 10개 구단 홈·원정 유니폼 데이터"
```

---

### Task 2: 격자를 픽셀로 (`src/render/kit-bitmap.js`)

격자와 색을 RGBA 바이트로 푸는 순수 함수. Canvas가 없어도 테스트할 수 있게 여기서 잘라 둔다 — 이 바이트를 `ImageData`에 넣는 건 다음 태스크의 일이다.

**Files:**
- Create: `src/render/kit-bitmap.js`
- Test: `test/kit-bitmap.test.js`

**Interfaces:**
- Consumes: `TEAMS`, `kitOf`, `GRID_W`, `GRID_H` from `src/render/teams.js`
- Produces: `kitRGBA(kit: Kit): Uint8ClampedArray` — 길이 `GRID_W * GRID_H * 4`, 행 우선(row-major), 알파는 전부 255

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/kit-bitmap.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { kitRGBA } from '../src/render/kit-bitmap.js'
import { TEAMS, kitOf, GRID_W, GRID_H } from '../src/render/teams.js'

const pixel = (data, col, row) => {
  const i = (row * GRID_W + col) * 4
  return [data[i], data[i + 1], data[i + 2], data[i + 3]]
}

describe('kitRGBA', () => {
  it('격자 크기만큼의 RGBA 바이트를 준다', () => {
    const data = kitRGBA(kitOf('doosan-home'))
    expect(data).toBeInstanceOf(Uint8ClampedArray)
    expect(data).toHaveLength(GRID_W * GRID_H * 4)
  })

  it('글자를 그 자리의 색으로 푼다', () => {
    // 두산 홈 2번 줄은 'wnnrnw' — 0열이 흰색, 1열이 네이비, 3열이 빨강.
    const data = kitRGBA(kitOf('doosan-home'))
    expect(pixel(data, 0, 2)).toEqual([0xF2, 0xF2, 0xF2, 255])
    expect(pixel(data, 1, 2)).toEqual([0x18, 0x28, 0x38, 255])
    expect(pixel(data, 3, 2)).toEqual([0xE4, 0x02, 0x2D, 255])
  })

  it('LG 홈은 세로 줄무늬가 열마다 번갈아 선다', () => {
    const data = kitRGBA(kitOf('lg-home'))
    // 3번 줄 'wkwkwk' — 짝수 열 흰색, 홀수 열 검정.
    expect(pixel(data, 0, 3)).toEqual([0xF2, 0xF2, 0xF2, 255])
    expect(pixel(data, 1, 3)).toEqual([0x18, 0x18, 0x18, 255])
    expect(pixel(data, 2, 3)).toEqual([0xF2, 0xF2, 0xF2, 255])
  })

  it('모든 픽셀이 불투명하다 — 실루엣이 비쳐 보이면 안 된다', () => {
    for (const team of TEAMS) {
      for (const key of [`${team.id}-home`, `${team.id}-away`]) {
        const data = kitRGBA(kitOf(key))
        for (let i = 3; i < data.length; i += 4) expect(data[i], key).toBe(255)
      }
    }
  })

  it('20벌 전부 크기가 같다', () => {
    for (const team of TEAMS) {
      for (const key of [`${team.id}-home`, `${team.id}-away`]) {
        expect(kitRGBA(kitOf(key)), key).toHaveLength(GRID_W * GRID_H * 4)
      }
    }
  })
})
```

- [ ] **Step 2: 실패하는 걸 확인한다**

Run: `npm test -- kit-bitmap`
Expected: FAIL — `Failed to resolve import "../src/render/kit-bitmap.js"`

- [ ] **Step 3: 구현한다**

`src/render/kit-bitmap.js`:

```js
// 유니폼 격자를 RGBA 바이트로 푼다. Canvas를 모르는 순수 함수라 테스트가 된다 —
// 이 바이트를 ImageData 에 담아 캔버스로 굽는 건 draw.js 가 한다.

import { GRID_W, GRID_H } from './teams.js'

/** '#RRGGBB' → [r, g, b] */
function rgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

/**
 * 키트의 상의 격자를 GRID_W × GRID_H RGBA 바이트로. 행 우선이고 전부 불투명하다 —
 * 반투명하면 밑의 검은 실루엣이 비쳐 색이 탁해진다.
 */
export function kitRGBA(kit) {
  const data = new Uint8ClampedArray(GRID_W * GRID_H * 4)
  const palette = new Map()
  for (const [ch, hex] of Object.entries(kit.colors)) palette.set(ch, rgb(hex))

  for (let row = 0; row < GRID_H; row += 1) {
    for (let col = 0; col < GRID_W; col += 1) {
      const [r, g, b] = palette.get(kit.torso[row][col])
      const i = (row * GRID_W + col) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return data
}
```

- [ ] **Step 4: 테스트가 통과하는 걸 확인한다**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/render/kit-bitmap.js test/kit-bitmap.test.js
git commit -m "feat: 유니폼 격자를 RGBA 바이트로 푸는 함수"
```

---

### Task 3: 포즈에 몸통·머리 좌표를 붙인다 (`src/render/sprites.js`)

무늬를 어디에 얹을지 알려면 포즈가 몸통 뼈대와 머리 위치를 밖으로 내줘야 한다. 이 태스크에서는 **화면이 지금과 똑같이 보여야 한다** — 자료 구조만 바뀐다.

**Files:**
- Modify: `src/render/sprites.js` (전면)
- Modify: `src/render/draw.js:14-16` (import), `src/render/draw.js:218-229` (`drawPeople`)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `batterStance`, `batterSwing`, `pitcherWindup`, `pitcherRelease`: `{ silhouette(ctx): void, torsoBone: [ax, ay, bx, by, w], head: [x, y, r] }`
  - `drawFigure(ctx, pose, x, y, height, flip, glow)` — 시그니처는 그대로, `pose`가 함수에서 객체로 바뀐 것만 다르다

- [ ] **Step 1: `sprites.js`를 고친다**

포즈 4개를 객체로 바꾼다. `silhouette` 본문은 지금 함수 본문 **그대로**이고, `torsoBone`·`head`는 그 본문에서 몸통 `bone(...)` 호출과 머리 `blob(...)` 호출의 인자를 그대로 옮겨 적은 것이다.

```js
// 검은 실루엣 포즈. 각 포즈는 키 1.0 = 발끝(y≈0)에서 머리끝(y≈-1)인 단위 공간에 그린다.
//
// 포즈는 실루엣을 그리는 함수 하나로 끝나지 않는다 — 유니폼 무늬를 몸통에 얹으려면
// 몸통 뼈대와 머리 위치를 밖에서도 알아야 해서 같이 내준다. torsoBone 과 head 의 값은
// silhouette 안에서 실제로 그리는 값과 같아야 한다. 어긋나면 무늬가 몸에서 떠 보인다.

/**
 * 포즈를 (x, y) 지점에 height 픽셀 크기로 그린다. flip=-1이면 좌우 반전.
 * glow가 켜져 있으면 흰 번짐을 먼저 깔아 어두운 배경 위에서도 실루엣이 읽히게 한다.
 * 그림자 번짐은 변환 행렬을 타지 않으므로 크기와 무관하게 일정한 두께가 된다.
 */
export function drawFigure(ctx, pose, x, y, height, flip = 1, glow = 0) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(height * flip, height)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (glow) {
    ctx.shadowColor = 'rgba(255, 255, 255, 0.92)'
    ctx.shadowBlur = glow
    // 한 번으로는 옅어서 두 번 겹쳐 깐다.
    pose.silhouette(ctx)
    pose.silhouette(ctx)
    ctx.shadowBlur = 0
  }

  pose.silhouette(ctx)
  ctx.restore()
}

function bone(ctx, ax, ay, bx, by, w) {
  ctx.beginPath()
  ctx.lineWidth = w
  ctx.moveTo(ax, ay)
  ctx.lineTo(bx, by)
  ctx.stroke()
}

function blob(ctx, x, y, r) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

/** 타격 준비. 배트를 뒤로 세우고 무릎을 살짝 굽힌 자세. */
export const batterStance = {
  silhouette(ctx) {
    blob(ctx, 0.02, -0.86, 0.1)
    bone(ctx, 0, -0.74, 0.02, -0.44, 0.17)
    bone(ctx, 0.02, -0.44, -0.13, -0.02, 0.1)
    bone(ctx, 0.02, -0.44, 0.16, -0.02, 0.1)
    bone(ctx, 0, -0.7, 0.16, -0.6, 0.08)
    bone(ctx, 0.16, -0.6, 0.2, -0.78, 0.08)
    bone(ctx, 0.2, -0.78, 0.36, -1.14, 0.055)
  },
  torsoBone: [0, -0.74, 0.02, -0.44, 0.17],
  head: [0.02, -0.86, 0.1],
}

/** 스윙 완료. 배트를 앞으로 뻗어 돌린 자세. */
export const batterSwing = {
  silhouette(ctx) {
    blob(ctx, -0.02, -0.86, 0.1)
    bone(ctx, 0, -0.74, -0.02, -0.44, 0.17)
    bone(ctx, -0.02, -0.44, -0.2, -0.02, 0.1)
    bone(ctx, -0.02, -0.44, 0.16, -0.05, 0.1)
    bone(ctx, 0, -0.7, -0.26, -0.6, 0.08)
    bone(ctx, -0.26, -0.6, -0.66, -0.68, 0.055)
  },
  torsoBone: [0, -0.74, -0.02, -0.44, 0.17],
  head: [-0.02, -0.86, 0.1],
}

/** 세트 포지션. 두 손을 가슴 앞에 모으고 공을 감춘 자세. */
export const pitcherWindup = {
  silhouette(ctx) {
    blob(ctx, 0, -0.84, 0.11)
    bone(ctx, 0, -0.72, 0, -0.42, 0.17)
    bone(ctx, 0, -0.42, -0.09, -0.02, 0.1)
    bone(ctx, 0, -0.42, 0.11, -0.02, 0.1)
    bone(ctx, 0.02, -0.68, -0.14, -0.6, 0.08)
    blob(ctx, -0.16, -0.58, 0.07)
  },
  torsoBone: [0, -0.72, 0, -0.42, 0.17],
  head: [0, -0.84, 0.11],
}

/** 릴리스. 앞으로 내딛으며 던지는 팔을 뻗은 자세. */
export const pitcherRelease = {
  silhouette(ctx) {
    blob(ctx, -0.05, -0.8, 0.11)
    bone(ctx, 0.02, -0.68, -0.02, -0.4, 0.17)
    bone(ctx, -0.02, -0.4, -0.26, -0.02, 0.1)
    bone(ctx, -0.02, -0.4, 0.2, -0.06, 0.1)
    bone(ctx, 0.02, -0.66, -0.14, -0.76, 0.08)
    bone(ctx, -0.14, -0.76, -0.34, -0.66, 0.08)
  },
  torsoBone: [0.02, -0.68, -0.02, -0.4, 0.17],
  head: [-0.05, -0.8, 0.11],
}
```

- [ ] **Step 2: 눈으로 확인한다 — 지금과 똑같이 보여야 한다**

Run: `npm start`

`⌥`를 누르고 있다가 `⌥Space`로 몇 번 쳐 본다.
Expected: 타자·투수·배트가 **변경 전과 완전히 같게** 보인다. 이 태스크는 화면을 바꾸지 않는다. 조금이라도 달라 보이면 `silhouette` 본문이 원본과 다른 것이다 — `git diff`로 대조한다.

- [ ] **Step 3: 기존 테스트가 여전히 통과하는 걸 확인한다**

Run: `npm test`
Expected: PASS — `src/game/`은 안 건드렸으니 전부 그대로 통과

- [ ] **Step 4: 커밋**

```bash
git add src/render/sprites.js
git commit -m "refactor: 포즈가 몸통 뼈대와 머리 위치를 내준다"
```

---

### Task 4: 유니폼을 그린다 (`src/render/sprites.js`)

몸통 캡슐로 클립을 잡고 그 안을 무늬로 채운 뒤, 머리 위에 모자를 얹는다. 여기서 처음으로 화면이 바뀐다.

**Files:**
- Modify: `src/render/sprites.js` (`drawFigure` 확장 + 헬퍼 추가)

**Interfaces:**
- Consumes: `kitRGBA` from `src/render/kit-bitmap.js`, `GRID_W`/`GRID_H` from `src/render/teams.js`, 포즈의 `torsoBone`/`head`
- Produces: `drawFigure(ctx, pose, x, y, height, flip, glow, kit = null)` — `kit`이 `null`이면 지금까지와 완전히 같은 그림

- [ ] **Step 1: `drawFigure`를 확장하고 헬퍼를 더한다**

`src/render/sprites.js` 맨 위 import 를 더한다:

```js
import { kitRGBA } from './kit-bitmap.js'
import { GRID_W, GRID_H } from './teams.js'
```

`drawFigure`를 다음으로 바꾼다:

```js
export function drawFigure(ctx, pose, x, y, height, flip = 1, glow = 0, kit = null) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(height * flip, height)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (glow) {
    ctx.shadowColor = 'rgba(255, 255, 255, 0.92)'
    ctx.shadowBlur = glow
    // 한 번으로는 옅어서 두 번 겹쳐 깐다.
    pose.silhouette(ctx)
    pose.silhouette(ctx)
    ctx.shadowBlur = 0
  }

  pose.silhouette(ctx)
  // 유니폼은 실루엣 위에 덧그린다 — 번짐은 위에서 이미 깔렸으므로 무늬도 그 안에 들어앉는다.
  if (kit) {
    drawJersey(ctx, pose, kit)
    drawCap(ctx, pose, kit)
  }
  ctx.restore()
}
```

파일 끝에 헬퍼를 더한다:

```js
// 구운 유니폼 캔버스를 키트별로 재활용한다. 20벌 × 6×9 픽셀이라 무시할 크기다.
const jerseyCache = new Map()

function jerseyCanvas(kit) {
  let canvas = jerseyCache.get(kit)
  if (canvas) return canvas

  canvas = document.createElement('canvas')
  canvas.width = GRID_W
  canvas.height = GRID_H
  const ctx = canvas.getContext('2d')
  ctx.putImageData(new ImageData(kitRGBA(kit), GRID_W, GRID_H), 0, 0)

  jerseyCache.set(kit, canvas)
  return canvas
}

/**
 * 둥근 끝을 가진 선(lineCap: round)과 같은 모양의 채울 수 있는 경로.
 * 몸통은 선으로 그려지는데 클립은 채우기 경로만 받으므로, 같은 모양을 직접 만든다.
 */
function capsulePath(ctx, ax, ay, bx, by, w) {
  const r = w / 2
  const angle = Math.atan2(by - ay, bx - ax)
  ctx.beginPath()
  ctx.arc(ax, ay, r, angle + Math.PI / 2, angle - Math.PI / 2)
  ctx.arc(bx, by, r, angle - Math.PI / 2, angle + Math.PI / 2)
  ctx.closePath()
}

/**
 * 상의. 몸통 캡슐로 클립을 잡고 그 안을 무늬로 채운다 —
 * 네모난 비트맵을 그냥 얹으면 어깨가 각지는데, 클립을 잡으면 둥근 윤곽이 남는다.
 */
function drawJersey(ctx, pose, kit) {
  const [ax, ay, bx, by, w] = pose.torsoBone
  const r = w / 2

  ctx.save()
  capsulePath(ctx, ax, ay, bx, by, w)
  ctx.clip()

  // 보간을 끄면 확대해도 칸이 또렷한 네모로 남는다 — 이게 픽셀로 보이는 이유다.
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    jerseyCanvas(kit),
    Math.min(ax, bx) - r,
    Math.min(ay, by) - r,
    Math.abs(bx - ax) + w,
    Math.abs(by - ay) + w,
  )
  ctx.restore()
}

/**
 * 모자. 머리 위 절반을 크라운이 덮고, 챙은 로컬 -x 로 뻗는다 —
 * 타자는 flip=-1, 투수는 flip=1이라 양쪽 다 -x 가 바라보는 방향이다.
 */
function drawCap(ctx, pose, kit) {
  const [hx, hy, r] = pose.head

  ctx.save()
  // 머리보다 아주 살짝 크게 그려 실루엣 경계에 검은 선이 한 줄 남게 한다.
  ctx.fillStyle = kit.cap.crown
  ctx.beginPath()
  ctx.arc(hx, hy, r * 0.94, Math.PI, Math.PI * 2)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = kit.cap.bill
  ctx.beginPath()
  ctx.ellipse(hx - r * 0.55, hy - r * 0.12, r * 0.95, r * 0.22, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
```

- [ ] **Step 2: 기존 테스트가 여전히 통과하는 걸 확인한다**

Run: `npm test`
Expected: PASS — `sprites.js`는 테스트가 없고 `src/game/`은 안 건드렸다

- [ ] **Step 3: 브라우저로 눈 확인 — 아직 배선이 안 됐으니 임시로 물려 본다**

`src/render/draw.js`의 `drawPeople`에서 한 줄만 임시로 바꾼다:

```js
import { kitOf } from './teams.js' // 임시
// drawFigure(...) 호출 두 개에 마지막 인자로 kitOf('lg-home'), kitOf('kia-away') 를 넘긴다
```

Run: `npx serve . -l 8123` 후 브라우저에서 `http://localhost:8123/src/renderer/index.html`
(또는 `python3 -m http.server 8123` 후 같은 경로)

Expected:
- 타자 몸통에 **검정 세로 줄무늬**가 또렷한 네모 칸으로 보인다 (LG 홈 핀스트라이프)
- 투수 몸통이 검정 바탕에 **가슴 빨강 띠**, 아래쪽에 **빨강 사선** (KIA 원정)
- 어깨가 각지지 않고 실루엣처럼 둥글다
- 머리 위에 모자와 챙이 있고, 챙은 **둘 다 서로를 향한다**
- 줄무늬가 흐릿하게 번지면 `imageSmoothingEnabled` 가 안 먹은 것이다

확인이 끝나면 임시 변경을 되돌린다: `git checkout src/render/draw.js`

- [ ] **Step 4: 커밋**

```bash
git add src/render/sprites.js
git commit -m "feat: 몸통에 유니폼 무늬를, 머리에 모자를 얹는다"
```

---

### Task 5: 렌더러가 유니폼을 받아 넘긴다

셸이나 쿼리 파라미터로 들어온 키를 키트로 바꿔 `draw`까지 흘린다.

**Files:**
- Modify: `src/render/draw.js:14-16` (import), `src/render/draw.js:87` (`draw` 시그니처), `src/render/draw.js:105` (`drawPeople` 호출), `src/render/draw.js:218-229` (`drawPeople`)
- Modify: `src/renderer/app.js`

**Interfaces:**
- Consumes: `kitOf` from `src/render/teams.js`, `drawFigure(..., kit)` from Task 4
- Produces:
  - `draw(ctx, width, height, state, now, kits)` — `kits`는 `{ batter: Kit|null, pitcher: Kit|null }`. 안 넘기면 둘 다 `null`.
  - 브리지 규약: `window.sneaky.kits = { batter: string|null, pitcher: string|null }`, `window.sneaky.onKit(handler)` — `handler(who, key)`, `who`는 `'batter' | 'pitcher'`

- [ ] **Step 1: `draw.js`를 고친다**

import 에 `kitOf`는 필요 없다 — `draw.js`는 이미 풀린 키트를 받는다. `drawPeople`까지 인자만 흘린다.

`draw.js:87` 시그니처:

```js
export function draw(ctx, width, height, state, now, kits = NO_KITS) {
```

`draw.js` 상단 상수 근처(`const BASE_H = 320` 아래)에 더한다:

```js
// 유니폼을 안 고른 상태. 매 프레임 새 객체를 만들지 않으려고 하나를 돌려 쓴다.
const NO_KITS = { batter: null, pitcher: null }
```

`draw.js:105` 호출:

```js
  drawPeople(ctx, field, spot, ui, state, now, kits)
```

`draw.js:218-229` `drawPeople`:

```js
function drawPeople(ctx, field, spot, ui, state, now, kits) {
  // 타자는 오른쪽(투수)을 본다 — 그래서 좌우 반전.
  const swung = state.phase === RESULT && state.lastResult?.timing !== 'take'
  const recovered = swung && now - state.resultAt > RESULT_MS
  const pose = swung && !recovered ? batterSwing : batterStance

  drawFigure(ctx, pose, field.w * BATTER_X, spot.ground, spot.batterH, -1, ui.glow, kits.batter)

  const throwing = state.phase === PITCHING
  const pitcher = throwing ? pitcherRelease : pitcherWindup
  drawFigure(ctx, pitcher, field.w * PITCHER_X, spot.ground, spot.pitcherH, 1, ui.glow, kits.pitcher)
}
```

- [ ] **Step 2: `app.js`를 고친다**

`src/renderer/app.js` 상단 import 에 더한다:

```js
import { kitOf } from '../render/teams.js'
```

`let holding = ...` 아래에 상태를 더한다:

```js
// 타자·투수 유니폼. 셸이 없으면 쿼리 파라미터로만 정해지고 저장하지 않는다.
let kits = { batter: null, pitcher: null }

function setKit(who, key) {
  if (who !== 'batter' && who !== 'pitcher') return
  kits = { ...kits, [who]: kitOf(key) }
}
```

`frame()`의 `draw` 호출에 넘긴다:

```js
  draw(ctx, size.w, size.h, state, now, kits)
```

`if (window.sneaky) { ... }` 블록 안에 더한다:

```js
  // 유니폼은 트레이 메뉴에서 고른다. 처음 값은 셸이 들고 있다가 브리지에 실어 준다.
  setKit('batter', window.sneaky.kits?.batter)
  setKit('pitcher', window.sneaky.kits?.pitcher)
  window.sneaky.onKit?.(setKit)
```

`window.addEventListener('resize', resize)` 위에 브라우저 경로를 더한다:

```js
// 브라우저에는 트레이 메뉴가 없다. 개발 중 확인용으로 쿼리 파라미터만 읽는다.
// 예: index.html?batter=lg-home&pitcher=kia-away
if (!window.sneaky) {
  const params = new URLSearchParams(location.search)
  setKit('batter', params.get('batter'))
  setKit('pitcher', params.get('pitcher'))
}
```

- [ ] **Step 3: 기존 테스트가 여전히 통과하는 걸 확인한다**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: 브라우저로 눈 확인**

Run: `python3 -m http.server 8123` 후 브라우저에서
`http://localhost:8123/src/renderer/index.html?batter=lg-home&pitcher=kia-away`

Expected:
- 타자가 LG 홈(흰 바탕 검정 세로 줄무늬), 투수가 KIA 원정(검정 + 빨강 사선)
- 쿼리 파라미터를 빼고 `http://localhost:8123/src/renderer/index.html` 만 열면 **예전처럼 검은 실루엣**
- `?batter=nonesuch-home` 같은 엉터리 키를 줘도 실루엣으로 떨어지고 콘솔에 오류가 없다
- 몇 벌 더 바꿔 본다: `?batter=nc-away&pitcher=kiwoom-home`, `?batter=lotte-home&pitcher=hanwha-away`

- [ ] **Step 5: 커밋**

```bash
git add src/render/draw.js src/renderer/app.js
git commit -m "feat: 렌더러가 타자·투수 유니폼을 받아 그린다"
```

---

### Task 6: 맥 셸 — 트레이 서브메뉴와 저장

**Files:**
- Modify: `mac/Sources/main.swift` (상수, 저장 프로퍼티, `bridgeScript`, `refreshMenu`, 메뉴 액션)

**Interfaces:**
- Consumes: Task 5의 브리지 규약 (`window.sneaky.kits`, `window.sneaky.onKit`, `window.__sneakyKit`)
- Produces: `UserDefaults` 키 `batterKit`·`pitcherKit` (String, 없으면 유니폼 없음)

- [ ] **Step 1: 구단 목록과 저장 프로퍼티를 더한다**

`mac/Sources/main.swift`의 `private let recordKey = "bestMeters"` 아래에 더한다:

```swift
private let batterKitKey = "batterKit"
private let pitcherKitKey = "pitcherKit"

/// 메뉴에 세울 구단 목록. src/render/teams.js 의 id·name 과 같아야 한다 —
/// 셸은 게임 코드를 읽지 않으므로 여기 한 벌을 따로 둔다.
private let teams: [(id: String, name: String)] = [
    ("kia", "KIA 타이거즈"),
    ("samsung", "삼성 라이온즈"),
    ("lg", "LG 트윈스"),
    ("doosan", "두산 베어스"),
    ("kt", "kt wiz"),
    ("ssg", "SSG 랜더스"),
    ("lotte", "롯데 자이언츠"),
    ("hanwha", "한화 이글스"),
    ("nc", "NC 다이노스"),
    ("kiwoom", "키움 히어로즈"),
]
```

`App` 클래스 안 `bestMeters` 프로퍼티 아래에 더한다:

```swift
    /// 'lg-home' 같은 키. 없으면 유니폼 없음(검은 실루엣).
    private func kit(_ who: String) -> String? {
        UserDefaults.standard.string(forKey: who == "batter" ? batterKitKey : pitcherKitKey)
    }

    private func setKit(_ who: String, _ key: String?) {
        let defaultsKey = who == "batter" ? batterKitKey : pitcherKitKey
        if let key { UserDefaults.standard.set(key, forKey: defaultsKey) }
        else { UserDefaults.standard.removeObject(forKey: defaultsKey) }

        let literal = key.map { "'\($0)'" } ?? "null"
        webView.evaluateJavaScript("window.__sneakyKit && window.__sneakyKit('\(who)', \(literal))")
        refreshMenu()
    }
```

- [ ] **Step 2: 브리지에 유니폼을 싣는다**

`bridgeScript()` 안 `getRecord` 줄 아래에 더한다. 저장된 값이 없으면 `null` 이어야 하므로 문자열 보간 전에 리터럴을 만든다 — 메서드 맨 앞에 두 줄을 더하고 본문에 끼운다:

```swift
    private func bridgeScript() -> String {
        let batter = kit("batter").map { "'\($0)'" } ?? "null"
        let pitcher = kit("pitcher").map { "'\($0)'" } ?? "null"
        return """
        window.sneaky = {
          keyHint: '⌥ 누르고 SPACE',
          kits: { batter: \(batter), pitcher: \(pitcher) },
          getRecord: () => Promise.resolve({ bestMeters: \(bestMeters) }),
          saveRecord: (record) => window.webkit.messageHandlers.sneaky.postMessage({
            type: 'record', bestMeters: record && record.bestMeters,
          }),
          onSwing: (handler) => { window.__sneakySwing = handler },
          onHold: (handler) => { window.__sneakyHold = handler },
          onKit: (handler) => { window.__sneakyKit = handler },
        }
        // 웹뷰는 콘솔이 안 보인다. 오류만이라도 셸의 stderr 로 흘려보낸다.
        window.addEventListener('error', (e) => window.webkit.messageHandlers.sneaky.postMessage({
          type: 'log', text: `${e.message} (${e.filename}:${e.lineno})`,
        }))
        console.error = (...args) => window.webkit.messageHandlers.sneaky.postMessage({
          type: 'log', text: args.join(' '),
        })
        """
    }
```

- [ ] **Step 3: 서브메뉴를 만든다**

`refreshMenu()`를 고치고 헬퍼를 더한다. `menu.addItem(.separator())` 다음에 두 줄을 끼운다:

```swift
    private func refreshMenu() {
        let menu = NSMenu()
        menu.addItem(disabled("최고 비거리  \(bestMeters)m"))
        menu.addItem(disabled("⌥ 을 누르고 있는 동안 투구"))
        menu.addItem(disabled("스윙  ⌥Space"))
        menu.addItem(.separator())

        menu.addItem(kitMenu(title: "타자 팀", who: "batter"))
        menu.addItem(kitMenu(title: "투수 팀", who: "pitcher"))
        menu.addItem(.separator())

        let toggle = NSMenuItem(title: "숨기기 / 보이기", action: #selector(toggleWindow), keyEquivalent: "b")
        toggle.keyEquivalentModifierMask = [.command, .shift]
        toggle.target = self
        menu.addItem(toggle)

        let quit = NSMenuItem(title: "종료", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.addItem(quit)

        statusItem.menu = menu
    }

    /// 구단 10칸 + 홈·원정 라디오. 고른 팀이 없으면 홈·원정은 회색으로 죽인다.
    private func kitMenu(title: String, who: String) -> NSMenuItem {
        let current = kit(who)
        let teamId = current?.split(separator: "-").first.map(String.init)
        let side = current?.split(separator: "-").last.map(String.init) ?? "home"

        let submenu = NSMenu()

        let none = NSMenuItem(title: "유니폼 없음", action: #selector(pickTeam(_:)), keyEquivalent: "")
        none.target = self
        none.representedObject = [who, ""]
        none.state = current == nil ? .on : .off
        submenu.addItem(none)
        submenu.addItem(.separator())

        for team in teams {
            let item = NSMenuItem(title: team.name, action: #selector(pickTeam(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = [who, team.id]
            item.state = team.id == teamId ? .on : .off
            submenu.addItem(item)
        }
        submenu.addItem(.separator())

        for (value, label) in [("home", "홈"), ("away", "원정")] {
            let item = NSMenuItem(title: label, action: #selector(pickSide(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = [who, value]
            item.state = value == side ? .on : .off
            item.isEnabled = current != nil
            submenu.addItem(item)
        }

        let root = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        root.submenu = submenu
        return root
    }

    /// 팀만 바꾸고 홈·원정은 지금 고른 쪽을 유지한다.
    @objc private func pickTeam(_ sender: NSMenuItem) {
        guard let pair = sender.representedObject as? [String], pair.count == 2 else { return }
        let (who, teamId) = (pair[0], pair[1])
        if teamId.isEmpty { setKit(who, nil); return }
        let side = kit(who)?.split(separator: "-").last.map(String.init) ?? "home"
        setKit(who, "\(teamId)-\(side)")
    }

    /// 홈·원정만 바꾼다. 팀을 안 골랐으면 아무 일도 없다.
    @objc private func pickSide(_ sender: NSMenuItem) {
        guard let pair = sender.representedObject as? [String], pair.count == 2,
              let teamId = kit(pair[0])?.split(separator: "-").first.map(String.init)
        else { return }
        setKit(pair[0], "\(teamId)-\(pair[1])")
    }
```

- [ ] **Step 4: 빌드하고 눈으로 확인한다**

Run: `npm start`

Expected:
- 메뉴바 `⚾` 에 「타자 팀 ▸」「투수 팀 ▸」 두 줄이 생겼다
- 처음엔 「유니폼 없음」에 체크가 있고 화면은 검은 실루엣
- 「타자 팀 ▸ LG 트윈스」를 고르면 **메뉴를 닫자마자** 타자에게 핀스트라이프가 입혀진다
- 「타자 팀 ▸ 원정」으로 바꾸면 검정으로 바뀐다
- 「투수 팀 ▸ 한화 이글스」를 고르면 투수만 바뀌고 타자는 그대로다
- 앱을 껐다 켜도 고른 유니폼이 그대로다
- 「유니폼 없음」으로 되돌리면 검은 실루엣으로 돌아가고 홈·원정 두 칸이 회색으로 죽는다

- [ ] **Step 5: 커밋**

```bash
git add mac/Sources/main.swift
git commit -m "feat: 맥 트레이에서 타자·투수 유니폼을 고른다"
```

---

### Task 7: 윈도우 셸 — 트레이 서브메뉴와 저장

맥과 같은 모양을 .NET 으로. **윈도우에서만 빌드된다** — 맥에서 작업 중이면 코드만 넣고 CI(`.github/workflows/release.yml`)가 컴파일을 확인한다.

**Files:**
- Modify: `windows/Program.cs` (`BuildMenu`, `Overlay`의 저장·브리지)

**Interfaces:**
- Consumes: Task 5의 브리지 규약
- Produces: `state.json` 에 `batterKit`·`pitcherKit` (문자열 또는 없음)

- [ ] **Step 1: `Overlay`에 유니폼 상태와 저장을 더한다**

`windows/Program.cs`의 `public int BestMeters { get; private set; }` 아래에 더한다:

```csharp
    /// <summary>'lg-home' 같은 키. null 이면 유니폼 없음(검은 실루엣).</summary>
    public string? BatterKit { get; private set; }
    public string? PitcherKit { get; private set; }
    public event Action? KitChanged;

    public void SetKit(string who, string? key)
    {
        if (who == "batter") BatterKit = key; else PitcherKit = key;
        WriteState();

        var literal = key is null ? "null" : $"'{key}'";
        // Send 는 숨어 있을 때 삼켜 버린다. 유니폼은 숨긴 채로도 바꿀 수 있어야 하므로
        // 보이는지와 무관하게 밀어 넣는다 — 다시 띄웠을 때 이미 갈아입고 있다.
        if (ready) _ = web.ExecuteScriptAsync($"window.__sneakyKit && window.__sneakyKit('{who}', {literal})");
        KitChanged?.Invoke();
    }

    public string? KitOf(string who) => who == "batter" ? BatterKit : PitcherKit;
```

`Overlay` 생성자 첫 줄 `BestMeters = ReadRecord();` 를 `ReadState();` 로 바꾸고, `ReadRecord`/`WriteRecord` 를 다음으로 갈아 끼운다:

```csharp
    private void ReadState()
    {
        try
        {
            var json = JsonDocument.Parse(File.ReadAllText(statePath)).RootElement;
            BestMeters = json.TryGetProperty("bestMeters", out var m) ? m.GetInt32() : 0;
            BatterKit = json.TryGetProperty("batterKit", out var b) ? b.GetString() : null;
            PitcherKit = json.TryGetProperty("pitcherKit", out var p) ? p.GetString() : null;
        }
        catch { BestMeters = 0; }
    }

    private void WriteState()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(statePath)!);
            File.WriteAllText(statePath, JsonSerializer.Serialize(new
            {
                bestMeters = BestMeters,
                batterKit = BatterKit,
                pitcherKit = PitcherKit,
            }));
        }
        catch { }
    }
```

`OnWebMessage` 안의 `WriteRecord(meters);` 를 `WriteState();` 로 바꾼다.

- [ ] **Step 2: 브리지에 유니폼을 싣는다**

`BridgeScript()` 를 고친다:

```csharp
    /// <summary>렌더러가 기대하는 window.sneaky. mac 셸과 같은 모양이다.</summary>
    private string BridgeScript()
    {
        var batter = BatterKit is null ? "null" : $"'{BatterKit}'";
        var pitcher = PitcherKit is null ? "null" : $"'{PitcherKit}'";
        return $$"""
        window.sneaky = {
          keyHint: 'Alt 누르고 Space',
          kits: { batter: {{batter}}, pitcher: {{pitcher}} },
          getRecord: () => Promise.resolve({ bestMeters: {{BestMeters}} }),
          saveRecord: (record) => window.chrome.webview.postMessage({
            type: 'record', bestMeters: record && record.bestMeters,
          }),
          onSwing: (handler) => { window.__sneakySwing = handler },
          onHold: (handler) => { window.__sneakyHold = handler },
          onKit: (handler) => { window.__sneakyKit = handler },
        }
        """;
    }
```

- [ ] **Step 3: 서브메뉴를 만든다**

`OverlayContext` 생성자의 구독에 한 줄을 더한다:

```csharp
        overlay.RecordChanged += _ => tray.ContextMenuStrip = BuildMenu();
        overlay.KitChanged += () => tray.ContextMenuStrip = BuildMenu();
```

`OverlayContext` 에 구단 목록을 더하고 `BuildMenu` 를 고친다:

```csharp
    /// <summary>메뉴에 세울 구단 목록. src/render/teams.js 의 id·name 과 같아야 한다.</summary>
    private static readonly (string Id, string Name)[] Teams =
    {
        ("kia", "KIA 타이거즈"),
        ("samsung", "삼성 라이온즈"),
        ("lg", "LG 트윈스"),
        ("doosan", "두산 베어스"),
        ("kt", "kt wiz"),
        ("ssg", "SSG 랜더스"),
        ("lotte", "롯데 자이언츠"),
        ("hanwha", "한화 이글스"),
        ("nc", "NC 다이노스"),
        ("kiwoom", "키움 히어로즈"),
    };

    private ContextMenuStrip BuildMenu()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add(new ToolStripMenuItem($"최고 비거리  {overlay.BestMeters}m") { Enabled = false });
        menu.Items.Add(new ToolStripMenuItem("Alt 를 누르고 있는 동안 투구") { Enabled = false });
        menu.Items.Add(new ToolStripMenuItem("스윙  Alt+Space") { Enabled = false });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(KitMenu("타자 팀", "batter"));
        menu.Items.Add(KitMenu("투수 팀", "pitcher"));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("숨기기 / 보이기  Ctrl+Shift+B", null, (_, _) => overlay.ToggleVisible()));
        menu.Items.Add(new ToolStripMenuItem("종료", null, (_, _) => Quit()));
        return menu;
    }

    /// <summary>구단 10칸 + 홈·원정 라디오. 고른 팀이 없으면 홈·원정은 죽인다.</summary>
    private ToolStripMenuItem KitMenu(string title, string who)
    {
        var current = overlay.KitOf(who);
        var parts = current?.Split('-');
        var teamId = parts?[0];
        var side = parts is { Length: 2 } ? parts[1] : "home";

        var root = new ToolStripMenuItem(title);
        root.DropDownItems.Add(new ToolStripMenuItem("유니폼 없음", null,
            (_, _) => overlay.SetKit(who, null)) { Checked = current is null });
        root.DropDownItems.Add(new ToolStripSeparator());

        foreach (var (id, name) in Teams)
        {
            root.DropDownItems.Add(new ToolStripMenuItem(name, null,
                (_, _) => overlay.SetKit(who, $"{id}-{side}")) { Checked = id == teamId });
        }
        root.DropDownItems.Add(new ToolStripSeparator());

        foreach (var (value, label) in new[] { ("home", "홈"), ("away", "원정") })
        {
            root.DropDownItems.Add(new ToolStripMenuItem(label, null,
                (_, _) => overlay.SetKit(who, $"{teamId}-{value}"))
            {
                Checked = value == side,
                Enabled = current is not null,
            });
        }
        return root;
    }
```

- [ ] **Step 4: 컴파일을 확인한다**

윈도우가 있으면: `dotnet build windows/SneakyBaseball.csproj`
Expected: 경고 없이 빌드 성공. 실행해서 Task 6 Step 4와 같은 항목을 확인한다.

윈도우가 없으면: 커밋 후 태그 없이 브랜치를 올려 `.github/workflows/release.yml` 의 윈도우 잡이 컴파일되는지 본다. 그것도 어려우면 이 태스크는 **컴파일 미확인**으로 표시하고 다음 실제 릴리스 전에 반드시 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add windows/Program.cs
git commit -m "feat: 윈도우 트레이에서 타자·투수 유니폼을 고른다"
```

---

### Task 8: 문서 갱신 (`CLAUDE.md`)

**Files:**
- Modify: `CLAUDE.md` (「확정된 결정」의 아트·조작 항목, 「구조」의 `src/render/`)

**Interfaces:**
- Consumes: 앞의 모든 태스크
- Produces: 없음

- [ ] **Step 1: 아트 항목을 고친다**

`CLAUDE.md`의 「**아트**: 배경 없는 검은 실루엣...」 줄을 다음으로 바꾼다:

```markdown
- **아트**: 배경 없는 검은 실루엣. 어두운 앱 위에서도 읽히도록 흰 글로우를 깔고 그린다.
  **상의와 모자 자리에만** KBO 구단 유니폼이 얹힌다 — 색이 아니라 6×9 격자 픽셀 무늬라
  핀스트라이프·옆구리 패널·소매 트림이 8×14px 안에 들어간다(`teams.js`). 로고는 안 쓰고
  가슴 글씨 자리는 색 띠 한 줄로만 표현한다. 기본값은 유니폼 없음(그냥 실루엣).
```

- [ ] **Step 2: 조작 항목에 메뉴를 더한다**

「**단축키**: `Cmd/Ctrl+Shift+B` ...」 줄 아래에 더한다:

```markdown
- **유니폼**: 트레이 `⚾` 메뉴의 「타자 팀 ▸」「투수 팀 ▸」 서브메뉴에서 10개 구단 ×
  홈·원정을 고른다. 타자와 투수는 독립적이고, 고른 값은 셸이 저장한다(맥 `UserDefaults`,
  윈도우 `state.json`). 브라우저로 열었을 땐 메뉴가 없어 `?batter=lg-home&pitcher=kia-away`
  쿼리 파라미터로만 확인한다.
```

- [ ] **Step 3: 구조 항목을 고친다**

「`src/render/` — `sprites.js` 실루엣 포즈, `draw.js` 프레임 렌더」 줄을 바꾼다:

```markdown
- `src/render/` — `sprites.js` 실루엣 포즈·유니폼 덧그리기, `draw.js` 프레임 렌더,
  `teams.js` 10구단 20벌 데이터(순수), `kit-bitmap.js` 격자 → RGBA(순수)
```

「`test/` — `src/game/`만 테스트한다...」 줄을 바꾼다:

```markdown
- `test/` — 순수 모듈만 테스트한다(`src/game/` 전부와 `src/render/teams.js`·`kit-bitmap.js`).
  렌더링과 창 동작(클릭 통과·항상 위·전역 키)은 수동 확인.
```

「설계 문서」 목록에 한 줄을 더한다:

```markdown
- `docs/superpowers/specs/2026-08-13-kbo-uniforms-design.md` (구단 유니폼)
```

- [ ] **Step 4: 전체 테스트와 앱을 마지막으로 확인한다**

Run: `npm test`
Expected: PASS

Run: `npm start`
Expected: 트레이에서 몇 벌 바꿔 보고, 껐다 켜서 유지되는지, 「유니폼 없음」이 실루엣으로 돌아가는지 확인

- [ ] **Step 5: 커밋**

```bash
git add CLAUDE.md
git commit -m "docs: 유니폼 기능을 CLAUDE.md 에 반영"
```

---

## 참고 — 실물 사진

무늬를 손보고 싶을 때 다시 볼 상품 사진은 이 세션의 스크래치패드에 있다:
`/private/tmp/claude-501/-Users-kohjoowon-sneaky-baseball/5ac01398-7383-42af-a78b-a839ba4d9c9f/scratchpad/kits/`
(유니폼 20장 + 모자 11장, `palette.py` 는 사진에서 색을 뽑는 스크립트다.)

세션이 지나 사라졌으면 spec 「자료 수집」에 적힌 출처에서 다시 받는다.
