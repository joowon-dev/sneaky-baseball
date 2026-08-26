# 야수 · 화면을 쓰는 타구 · 투수 드래그 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 외야수가 뛰어가 뜬공을 잡는 `OUT` 판정을 넣고, 홈런·파울이 화면을 쓰게 만들고, 투수를 드래그해 난이도를 조절하게 한다.

**Architecture:** 야수는 `src/game/fielder.js`라는 다섯 번째 **순수 모듈**로 독립한다 — `batted.js`가 이미 내주는 `carry(flight)`와 `hops[0].durMs`만 보고 「사람이 거기 닿는가」에 답한다. `engine.js`는 홈런을 정하는 그 자리에서 아웃도 정하고, 잡힌 공은 홈런이 `overAtMs`에서 끝나듯 `hangMs`에서 끝난 것으로 친다. 드래그는 **셸이 문만 여닫고 웹뷰가 처리한다** — 셸은 이미 도는 60Hz 폴링에서 `커서가 히트박스 안 && 수식키 누름`일 때만 클릭 통과를 끄고, 실제 포인터 처리는 `app.js`에 있다.

**Tech Stack:** 순수 ESM JavaScript, vitest, Canvas 2D, Swift+WKWebView(맥), .NET WinForms+WebView2(윈도우)

**Spec:** `docs/superpowers/specs/2026-08-26-fielder-flight-and-pitcher-drag-design.md`

## Global Constraints

- **`src/game/`은 Canvas·셸을 모른다.** 시간은 항상 인자(`now`)로 받고, 모든 함수는 순수하다.
- **아웃은 잃는 게 없다.** `streak`을 올리지도 끊지도 않고, `hits`도 안 올린다. 아웃카운트는 넣지 않는다.
- **`judgeSwing`은 `OUT`을 반환하지 않는다.** 홈런과 같이 engine이 궤적을 보고 정한다.
- **판정에 쓰는 값과 그리는 값은 언제나 같다.** 렌더가 물리를 다시 계산하지 않는다.
- **담장은 `FENCE_EDGE = 0.97` 그대로.** 이 계획에서 건드리지 않는다.
- **클릭 통과 예외는 딱 한 군데** — `커서가 투수 히트박스 안 && 수식키 누름`인 순간뿐.
- **셸 두 개는 같은 모양의 `window.sneaky`를 만든다.** 맥에 넣은 브리지 키는 윈도우에도 똑같이 넣는다.
- 테스트는 `npm test` (vitest). 순수 모듈만 테스트한다 — 렌더·창 동작은 수동 확인.
- 커밋 메시지는 이 저장소 관례대로 **한국어 현재형 한 줄**(`feat:` / `fix:` / `docs:`).

---

## File Structure

**새로 만드는 파일**
- `src/game/fielder.js` — 외야수. 궤적 하나를 받아 「닿는가」만 답한다. 상수 3개 + 함수 1개.
- `test/fielder.test.js` — 위 모듈의 단위 테스트.

**고치는 파일**
- `src/game/judge.js` — `OUT` 상수와 이름.
- `src/game/engine.js` — 아웃 판정, 잡힌 공의 `restAt`·`outcomeEndsAt`.
- `src/game/pitches.js` — 투수 위치 상수와 `distanceRatio`, `nextPitch`의 거리 반영.
- `src/game/batted.js` — 팝파울(발사각·뒤로 가는 힘).
- `src/render/sprites.js` — 외야수 포즈 3개.
- `src/render/draw.js` — 야수 그리기, 결과별 잔상, 아웃 글씨, 투수 위치, 히트박스 보고.
- `src/renderer/app.js` — 드래그 처리, 브리지 연결.
- `mac/Sources/main.swift` — 커서 폴링 + `ignoresMouseEvents` 토글 + `pitcherX` 저장.
- `windows/Program.cs` — 같은 일.
- `CLAUDE.md` — 확정 결정 갱신.

---

## Task 1: `fielder.js` — 외야수 판정

**Files:**
- Create: `src/game/fielder.js`
- Test: `test/fielder.test.js`

**Interfaces:**
- Consumes: `src/game/batted.js`의 `carry(flight)`, `FENCE_DIST`. `flight`는 `battedFlight()`의 반환값 — `{ vx, vy, launchDy, over, overAtMs, hops, roll, lifeMs, fadeMs }`, `hops[0]`은 `{ startMs, durMs, x0, y0, vx, vy }`.
- Produces: `chase(flight)` → `{ caught: boolean, spotX: number, needMs: number, hangMs: number }` 또는 `null`. 상수 `START_X`, `RUN_SPEED`, `REACH`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/fielder.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { battedFlight, FENCE_DIST } from '../src/game/batted.js'
import { HIT, FOUL } from '../src/game/judge.js'
import { chase, START_X, RUN_SPEED, REACH } from '../src/game/fielder.js'

describe('chase', () => {
  it('담장을 넘긴 공은 야수가 관여하지 않는다', () => {
    const flight = battedFlight(HIT, 0, 0)
    expect(flight.over).toBe(true)
    expect(chase(flight)).toBe(null)
  })

  it('궤적이 없으면 null 이다', () => {
    expect(chase(null)).toBe(null)
  })

  it('뒤로 간 파울은 묻지 않아도 null 이다', () => {
    expect(chase(battedFlight(FOUL, 100, 0))).toBe(null)
  })

  it('낙구 지점이 글러브 안이면 안 달리고 잡는다', () => {
    // START_X 바로 위에 떨어지는 궤적을 손으로 만든다.
    const flight = {
      over: false,
      hops: [{ startMs: 0, durMs: 600, x0: 0, y0: 0, vx: START_X, vy: 2 }],
    }
    const got = chase(flight)
    expect(got.needMs).toBe(0)
    expect(got.caught).toBe(true)
    expect(got.spotX).toBeCloseTo(START_X)
    expect(got.hangMs).toBe(600)
  })

  it('체공이 짧으면 못 온다', () => {
    // 야수에게서 1.0 만큼 떨어진 곳에 0.1초 만에 떨어지는 라이너.
    const flight = {
      over: false,
      hops: [{ startMs: 0, durMs: 100, x0: 0, y0: 0, vx: (START_X + 1) / 0.1, vy: 0.2 }],
    }
    const got = chase(flight)
    expect(got.caught).toBe(false)
    expect(got.needMs).toBeGreaterThan(got.hangMs)
  })

  it('체공이 길면 달려가 잡는다', () => {
    // 야수에게서 0.3 만큼 떨어진 곳에 1초 걸려 떨어지는 뜬공.
    const flight = {
      over: false,
      hops: [{ startMs: 0, durMs: 1000, x0: 0, y0: 0, vx: START_X + 0.3, vy: 3 }],
    }
    const got = chase(flight)
    expect(got.caught).toBe(true)
  })

  it('담장을 직격해 끊긴 궤적은 못 잡는다', () => {
    // 첫 구간이 담장 자리에서 끝난다 = 공중에서 벽에 막혔다.
    const flight = {
      over: false,
      hops: [{ startMs: 0, durMs: 500, x0: 0, y0: 0, vx: FENCE_DIST / 0.5, vy: 2 }],
    }
    expect(chase(flight)).toBe(null)
  })

  it('상수는 양수다', () => {
    expect(START_X).toBeGreaterThan(0)
    expect(RUN_SPEED).toBeGreaterThan(0)
    expect(REACH).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run test/fielder.test.js`
Expected: FAIL — `Failed to resolve import "../src/game/fielder.js"`

- [ ] **Step 3: 모듈을 만든다**

`src/game/fielder.js`:

```js
// 외야수. 궤적 하나를 받아 **사람이 거기 닿는가**에만 답하는 순수 모듈.
// batted.js 가 이미 낙구 지점(carry)과 체공 시간(hops[0].durMs)을 내주므로
// 여기서 새로 푸는 물리는 없다.

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
  if (spotX >= FENCE_DIST - EPS) return null // 담장 직격

  const hangMs = first.durMs
  const run = Math.max(0, Math.abs(spotX - START_X) - REACH)
  const needMs = (run / RUN_SPEED) * 1000

  return { caught: needMs <= hangMs, spotX, needMs, hangMs }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run test/fielder.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/game/fielder.js test/fielder.test.js
git commit -m "feat: 외야수가 뜬공에 닿는지 판정하는 순수 모듈을 만든다"
```

---

## Task 2: `OUT` 판정과 잡힌 공의 시간

**Files:**
- Modify: `src/game/judge.js`
- Modify: `src/game/engine.js:99-148` (`outcomeLife`, `applyResult`)
- Test: `test/engine.test.js`

**Interfaces:**
- Consumes: Task 1의 `chase(flight)`.
- Produces: `judge.js`가 `OUT = 'out'`을 export하고 `LABELS[OUT] = '아웃'`. `engine`의 `state.lastResult.result`가 `OUT`일 수 있고, 그때 `restAt`·`outcomeEndsAt`이 `chase().hangMs` 기준이다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/engine.test.js` 끝에 붙인다:

```js
import { chase, START_X } from '../src/game/fielder.js'
import { OUT } from '../src/game/judge.js'
import { battedFlight } from '../src/game/batted.js'

/** 야수에게 잡히는 타이밍 오차를 하나 찾아 둔다 — 상수를 조율해도 테스트가 안 깨진다. */
function caughtErrorMs() {
  for (let off = 1; off <= 150; off += 1) {
    const flight = battedFlight('hit', off, 0)
    if (!flight.over && chase(flight)?.caught) return off
  }
  throw new Error('잡히는 타구가 하나도 없다 — fielder 상수를 다시 봐야 한다')
}

describe('아웃', () => {
  const off = caughtErrorMs()

  it('담장을 못 넘기고 야수에게 닿은 타구는 아웃이다', () => {
    let state = startPitch(createGame(), { flightMs: 900, lane: 0, drop: 0 }, 0)
    state = swing(state, state.plateAt + off)
    expect(state.lastResult.result).toBe(OUT)
  })

  it('아웃은 streak 을 올리지도 끊지도 않는다', () => {
    let state = createGame({ streak: 3 })
    state = startPitch(state, { flightMs: 900, lane: 0, drop: 0 }, 0)
    state = swing(state, state.plateAt + off)
    expect(state.streak).toBe(3)
  })

  it('아웃은 안타로 세지 않는다', () => {
    let state = startPitch(createGame(), { flightMs: 900, lane: 0, drop: 0 }, 0)
    state = swing(state, state.plateAt + off)
    expect(state.hits).toBe(0)
  })

  it('아웃도 최고 비거리를 갱신한다', () => {
    let state = startPitch(createGame(), { flightMs: 900, lane: 0, drop: 0 }, 0)
    state = swing(state, state.plateAt + off)
    expect(state.bestMeters).toBeGreaterThan(0)
  })

  it('잡힌 공은 거기서 멈춘다 — 다 굴렀을 때보다 이르다', () => {
    let state = startPitch(createGame(), { flightMs: 900, lane: 0, drop: 0 }, 0)
    const now = state.plateAt + off
    state = swing(state, now)

    const flight = battedFlight('hit', off, 0)
    const rolled = (flight.roll.startMs + flight.roll.durMs) / TIME_SCALE
    const hung = chase(flight).hangMs / TIME_SCALE

    expect(state.restAt - now).toBeCloseTo(hung, 5)
    expect(hung).toBeLessThan(rolled)
  })

  it('아웃 글씨도 잡히는 순간을 기준으로 뜬다', () => {
    let state = startPitch(createGame(), { flightMs: 900, lane: 0, drop: 0 }, 0)
    const now = state.plateAt + off
    state = swing(state, now)

    const hung = chase(battedFlight('hit', off, 0)).hangMs / TIME_SCALE
    expect(state.outcomeEndsAt - now).toBeCloseTo(hung + OUTCOME_MS, 5)
  })
})
```

`test/engine.test.js` 맨 위 import 줄에 `TIME_SCALE`과 `OUTCOME_MS`가 없으면 더한다:

```js
import { TIME_SCALE } from '../src/game/batted.js'
// OUTCOME_MS 는 engine 에서 온다 — 기존 import 목록에 더한다.
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run test/engine.test.js`
Expected: FAIL — `OUT` import 실패, 또는 `expect(...).toBe('out')`이 `'hit'`을 받는다.

- [ ] **Step 3: `judge.js`에 이름을 더한다**

`src/game/judge.js`의 상수 옆에 붙인다:

```js
export const HOMERUN = 'homerun'
export const HIT = 'hit'
export const OUT = 'out'
export const FOUL = 'foul'
export const WHIFF = 'whiff'

export const LABELS = {
  [HOMERUN]: 'HOME RUN!',
  [HIT]: '안타',
  [OUT]: '아웃',
  [FOUL]: '파울',
  [WHIFF]: '헛스윙',
}
```

`judgeSwing` 위 주석에 한 줄을 더한다:

```js
/**
 * ...
 * 여기서는 **맞았는지(hit) / 파울인지 / 헛쳤는지**까지만 정한다.
 * 홈런은 타이밍이 아니라 **타구가 담장을 넘었는지**로 갈린다 — engine이 정한다.
 * **아웃도 마찬가지다** — 궤적을 만들어 봐야 야수가 닿는지 알 수 있으므로
 * 이 함수는 절대 OUT을 반환하지 않는다.
 */
```

- [ ] **Step 4: `engine.js`를 고친다**

import 줄:

```js
import { HOMERUN, HIT, OUT, FOUL, WHIFF, WINDOWS, judgeSwing, judgeTake } from './judge.js'
import { battedFlight, restMs, clearsFence, meters, TIME_SCALE } from './batted.js'
import { chase } from './fielder.js'
```

`outcomeLife`를 궤적이 끝나는 시각을 인자로 받게 바꾼다:

```js
/**
 * 결과 글씨가 사라지기까지 걸리는 시간.
 * 궤적이 끝나는 순간에 떠서 OUTCOME_MS 동안 머문다 — 홈런은 담장을 넘는 순간,
 * **아웃은 야수에게 잡히는 순간**, 나머지는 다 굴러 멈추는 순간이다.
 * 친 공이 없으면(헛스윙) 타이밍 표시가 사라지는 것으로 끝이다.
 */
function outcomeLife(flight, endMs) {
  if (!flight) return RESULT_MS
  return endMs / TIME_SCALE + OUTCOME_MS
}
```

`applyResult`를 이렇게 바꾼다:

```js
function applyResult(state, verdict, now) {
  const lane = state.pitch?.lane ?? 0
  // 타격 높이(launchDy)는 그리는 쪽 사정이고 멈추는 시각에 미치는 영향은 몇 ms라 여기선 뺀다.
  const flight = battedFlight(verdict.result, verdict.errorMs, lane)

  // 홈런은 타이밍이 아니라 담장을 넘었는지로 갈린다. 화면에 그려진 그 선 그대로다.
  // 못 넘겼으면 야수에게 묻는다 — 닿으면 아웃이다.
  const caught = verdict.result === HIT ? chase(flight) : null
  let result = verdict.result
  if (verdict.result === HIT) {
    if (clearsFence(flight)) result = HOMERUN
    else if (caught?.caught) result = OUT
  }

  // 궤적이 끝나는 시각. 잡힌 공은 야수 글러브 안에서 멈춘다 —
  // 홈런이 담장을 넘으며 끝나는 것과 같은 자리다.
  const endMs = result === OUT
    ? caught.hangMs
    : flight ? flight.roll.startMs + flight.roll.durMs : 0

  const flownM = meters(flight)

  const next = {
    ...state,
    phase: RESULT,
    // 공의 높낮이를 함께 남긴다 — 다음 공이 와도 이 타구의 궤적은 그대로여야 한다.
    lastResult: { ...verdict, result, lane, meters: flownM },
    resultAt: now,
    restAt: now + (result === OUT ? caught.hangMs / TIME_SCALE : restMs(flight)),
    outcomeEndsAt: now + outcomeLife(flight, endMs),
  }

  switch (result) {
    case HOMERUN:
      next.homeRuns += 1
      next.hits += 1
      next.streak += 1
      break
    case HIT:
      next.hits += 1
      next.streak += 1
      break
    case WHIFF:
      next.streak = 0
      break
    // 아웃은 잃는 게 없다 — streak 을 올리지도 끊지도 않고 안타로 세지도 않는다.
    case OUT:
    case FOUL:
      break
  }

  // 최고 기록은 연속이 아니라 가장 멀리 친 거리다. 잡힌 타구도 얼마나 멀리
  // 칠 뻔했는지는 말해 준다.
  next.bestMeters = Math.max(state.bestMeters, flownM)
  return next
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npm test`
Expected: PASS — 기존 테스트 전부 + 아웃 6개.
기존 `engine.test.js`가 「굿 윈도우 안이면 안타」를 단언하고 있다면, 그 타이밍이 이제 아웃일 수 있다. 그런 테스트는 **야수가 못 닿는 오차**(위 `caughtErrorMs`의 반대 — 굿 윈도우 끝쪽, 예: 78ms)로 옮기고 주석을 남긴다:

```js
// 야수가 못 닿는 힘없는 타구여야 안타로 남는다. 잘 맞으면 홈런 아니면 아웃이다.
```

- [ ] **Step 6: 커밋**

```bash
git add src/game/judge.js src/game/engine.js test/engine.test.js
git commit -m "feat: 담장을 못 넘긴 뜬공을 야수가 잡으면 아웃이 된다"
```

---

## Task 3: 타구 밴드 튜닝

**Files:**
- Modify: `src/game/fielder.js:9-13` (상수 3개)
- Test: `test/fielder.test.js`

**Interfaces:**
- Consumes: Task 1·2 전부.
- Produces: 바뀌지 않는다 — 상수 값만 조율한다.

야수가 너무 잘 잡으면 안타가 사라지고, 못 잡으면 세운 의미가 없다. **밴드를 테스트로 못 박아** 튜닝이 검증 가능하게 만든다.

- [ ] **Step 1: 밴드 테스트를 쓴다**

`test/fielder.test.js` 끝에 붙인다:

```js
import { HOMERUN, OUT, HIT as HIT_R } from '../src/game/judge.js'
import { clearsFence } from '../src/game/batted.js'

/** 타이밍 오차 하나가 어떤 결과가 되는지 — engine 과 같은 순서로 판정한다. */
function outcomeAt(off) {
  const flight = battedFlight(HIT, off, 0)
  if (clearsFence(flight)) return HOMERUN
  return chase(flight)?.caught ? OUT : HIT_R
}

describe('타구 밴드', () => {
  const band = (want) => {
    let n = 0
    for (let off = 0; off <= 80; off += 1) if (outcomeAt(off) === want) n += 1
    return n
  }

  it('완벽에 가까우면 홈런이다', () => {
    expect(outcomeAt(0)).toBe(HOMERUN)
  })

  it('굿 윈도우 안에서 아웃이 절반을 넘지 않는다', () => {
    // 넘으면 잘 맞힌 타구가 죄다 잡혀서 안타가 사라진다.
    expect(band(OUT)).toBeLessThanOrEqual(40)
  })

  it('굿 윈도우 안에 아웃도 안타도 충분히 있다', () => {
    expect(band(OUT)).toBeGreaterThanOrEqual(10)
    expect(band(HIT_R)).toBeGreaterThanOrEqual(10)
  })

  it('힘없이 맞은 공은 야수가 못 온다', () => {
    expect(outcomeAt(78)).toBe(HIT_R)
  })
})
```

- [ ] **Step 2: 실행해서 지금 값이 어디 있는지 본다**

Run: `npx vitest run test/fielder.test.js`
Expected: 통과할 수도, 실패할 수도 있다. 실패하면 어느 단언이 깨지는지 본다.

- [ ] **Step 3: 밴드를 눈으로 확인한다**

Run:
```bash
node -e "
import('./src/game/batted.js').then(async (B) => {
  const F = await import('./src/game/fielder.js')
  let out = ''
  for (let off = 0; off <= 150; off += 5) {
    const f = B.battedFlight('hit', off, 0)
    const r = B.clearsFence(f) ? 'HR ' : (F.chase(f)?.caught ? 'OUT' : 'HIT')
    out += off + 'ms ' + r + '  ' + B.meters(f) + 'm\n'
  }
  console.log(out)
})
"
```
Expected: 0ms부터 홈런, 중간에 아웃, 끝에 안타로 이어지는 표.

- [ ] **Step 4: 상수를 조율한다**

`src/game/fielder.js`의 세 값만 움직인다. 방향은 이렇다:

- **아웃이 너무 많다** → `START_X`를 키운다(야수가 멀리 서면 가까운 타구를 못 잡는다) 또는 `RUN_SPEED`를 줄인다.
- **아웃이 너무 적다** → 반대로.
- `REACH`는 마지막에 미세 조정한다.

Step 2·3을 밴드 테스트가 전부 통과할 때까지 반복한다.

- [ ] **Step 5: 통과를 확인한다**

Run: `npm test`
Expected: PASS 전부

- [ ] **Step 6: 커밋**

```bash
git add src/game/fielder.js test/fielder.test.js
git commit -m "fix: 야수 상수를 조율해 안타와 아웃이 함께 나오게 한다"
```

---

## Task 4: 팝파울 — 파울이 화면을 쓴다

**Files:**
- Modify: `src/game/batted.js:19-27` (상수), `src/game/batted.js:63-80` (`battedFlight`)
- Test: `test/batted.test.js`

**Interfaces:**
- Consumes: 없음.
- Produces: `battedFlight(FOUL, ...)`의 궤적이 거의 수직으로 솟는다. 반환 형태는 안 바뀐다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/batted.test.js` 끝에 붙인다:

```js
describe('팝파울', () => {
  it('파울은 거의 수직으로 솟는다', () => {
    const foul = battedFlight(FOUL, 100, 0)
    // 위로 가는 속도가 앞뒤로 가는 속도보다 압도적으로 크다.
    expect(foul.vy).toBeGreaterThan(Math.abs(foul.vx) * 5)
  })

  it('파울은 뒤로 간다', () => {
    expect(battedFlight(FOUL, 100, 0).vx).toBeLessThan(0)
  })

  it('파울은 화면 밖으로 밀려나지 않는다', () => {
    // 다 굴러 멈춘 자리가 타격점에서 0.4(필드 높이) 안쪽이어야 화면에 남는다.
    const foul = battedFlight(FOUL, 100, 0)
    expect(Math.abs(travel(foul))).toBeLessThan(0.4)
  })

  it('파울은 눈에 띄게 높이 솟는다', () => {
    // 최고 높이 = vy² / 2g. 화면 높이 단위이므로 0.35 면 화면의 35% 다.
    const foul = battedFlight(FOUL, 100, 0)
    expect((foul.vy * foul.vy) / (2 * GRAVITY)).toBeGreaterThan(0.35)
  })

  it('안타 궤적은 그대로다', () => {
    const hit = battedFlight(HIT, 60, 0)
    expect(hit.vx).toBeGreaterThan(0)
    expect(hit.vy).toBeLessThan(hit.vx) // 32도 근처는 가로가 더 크다
  })
})
```

`test/batted.test.js` 맨 위 import에 `FOUL`, `travel`, `GRAVITY`가 없으면 더한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run test/batted.test.js`
Expected: FAIL — `foul.vy`가 `|vx|*5`보다 작다 (지금은 32도 근처에 뒤로 0.5배).

- [ ] **Step 3: 상수와 발사각을 바꾼다**

`src/game/batted.js`의 상수 블록에서 `FOUL_SPEED_RATIO`를 바꾸고 `FOUL_DEG`를 더한다:

```js
// 파울은 **거의 수직으로 솟는 팝파울**이다. 예전엔 뒤로 0.5배 힘으로 나갔는데,
// 타격점이 화면 왼쪽 끝에서 50px밖에 안 떨어져 있어 뜨자마자 화면 밖으로 사라졌다 —
// 파울이라는 결과가 화면에서 아무 일도 안 일으켰다.
const FOUL_SPEED_RATIO = -0.06 // 파울이 뒤로 밀리는 정도. 화면에 남을 만큼만.
const FOUL_DEG = 80 // 팝파울의 발사각. MAX_DEG 를 일부러 넘긴다.
```

`battedFlight` 안에서 발사각을 정하는 줄을 바꾼다:

```js
  // 빠르게 휘두르면 퍼올려 뜨고, 늦으면 낮게 깔린다.
  // 파울만은 타이밍과 무관하게 팝파울이다 — 그래서 clamp 밖에 둔다.
  const deg = result === FOUL
    ? FOUL_DEG
    : clamp(LAUNCH_DEG - off * DEG_PER_MS - lane * DEG_PER_LANE, MIN_DEG, MAX_DEG)
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npm test`
Expected: PASS 전부. 기존 파울 테스트가 「뒤로 절반 힘」을 단언하고 있으면 팝파울에 맞게 고치고 주석을 남긴다.

- [ ] **Step 5: 커밋**

```bash
git add src/game/batted.js test/batted.test.js
git commit -m "feat: 파울을 화면 위로 솟는 팝파울로 바꾼다"
```

---

## Task 5: 투수 위치와 거리 반영

**Files:**
- Modify: `src/game/pitches.js`
- Test: `test/pitches.test.js`

**Interfaces:**
- Consumes: 없음.
- Produces: `PITCHER_X_BASE = 0.87`, `PITCHER_X_MIN`, `PITCHER_X_MAX`, `CONTACT_X`, `clampPitcherX(x)`, `distanceRatio(pitcherX)`. `nextPitch(homeRuns, rand, ratio = 1)`.

투수 위치는 이제 판정에 들어가므로 `draw.js`의 그림 상수가 아니라 순수 모듈이 갖는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`test/pitches.test.js` 끝에 붙인다:

```js
import {
  PITCHER_X_BASE, PITCHER_X_MIN, PITCHER_X_MAX, clampPitcherX, distanceRatio,
} from '../src/game/pitches.js'

describe('투수 위치', () => {
  it('기본 자리는 거리 비율이 1이다', () => {
    expect(distanceRatio(PITCHER_X_BASE)).toBeCloseTo(1)
  })

  it('당기면 공이 일찍 오고, 밀면 늦게 온다', () => {
    expect(distanceRatio(PITCHER_X_MIN)).toBeLessThan(1)
    expect(distanceRatio(PITCHER_X_MAX)).toBeGreaterThan(1)
  })

  it('범위는 좁다 — 기록이 하나뿐이라 넓히면 왜곡된다', () => {
    expect(distanceRatio(PITCHER_X_MIN)).toBeGreaterThan(0.8)
    expect(distanceRatio(PITCHER_X_MAX)).toBeLessThan(1.2)
  })

  it('범위 밖은 잘라 낸다', () => {
    expect(clampPitcherX(0)).toBe(PITCHER_X_MIN)
    expect(clampPitcherX(2)).toBe(PITCHER_X_MAX)
    expect(clampPitcherX(PITCHER_X_BASE)).toBe(PITCHER_X_BASE)
    expect(clampPitcherX(NaN)).toBe(PITCHER_X_BASE)
  })

  it('거리 비율이 날아오는 시간에 그대로 반영된다', () => {
    const base = nextPitch(0, fakeRand(0.9, 0.5))
    const near = nextPitch(0, fakeRand(0.9, 0.5), 0.85)
    expect(near.flightMs).toBe(Math.round(base.flightMs * 0.85))
  })

  it('비율을 안 주면 지금과 같다', () => {
    expect(nextPitch(0, fakeRand(0.9, 0.5)).flightMs)
      .toBe(nextPitch(0, fakeRand(0.9, 0.5), 1).flightMs)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run test/pitches.test.js`
Expected: FAIL — `PITCHER_X_BASE` import 실패

- [ ] **Step 3: `pitches.js`에 더한다**

파일 끝에 붙인다:

```js
/**
 * 투수가 서는 자리. 필드 상자 가로 비율이고, 그림과 판정이 **같은 값**을 본다.
 * 플레이어가 드래그해서 옮기면 던지는 거리가 바뀌고, 거리가 바뀌면 공이 오는
 * 시간도 그만큼 바뀐다 — 그래야 이름만 난이도가 아니라 진짜 난이도가 된다.
 *
 * 범위는 **좁다.** 최고 비거리 기록을 하나로 두기 때문이다 — 넓히면 멀찍이
 * 밀어 두고 세운 기록이 판을 차지한다. 범위를 넓히려면 기록을 갈라야 한다.
 */
export const PITCHER_X_BASE = 0.87
export const PITCHER_X_MIN = 0.78
export const PITCHER_X_MAX = 0.93

/** 타격점과 릴리스 지점 — draw.js 의 geometry() 와 같은 식이다. */
export const CONTACT_X = 0.215 // BATTER_X(0.19) + 0.025
const RELEASE_BACK = 0.06 // 릴리스는 투수 몸통보다 이만큼 앞이다

const BASE_DIST = PITCHER_X_BASE - RELEASE_BACK - CONTACT_X

/** 범위 밖은 잘라 낸다. 값이 아니면 기본 자리로. */
export function clampPitcherX(x) {
  if (!Number.isFinite(x)) return PITCHER_X_BASE
  return Math.min(PITCHER_X_MAX, Math.max(PITCHER_X_MIN, x))
}

/** 기본 자리 대비 던지는 거리의 비율. 그대로 flightMs 에 곱한다. */
export function distanceRatio(pitcherX) {
  return (clampPitcherX(pitcherX) - RELEASE_BACK - CONTACT_X) / BASE_DIST
}
```

`nextPitch`를 고친다:

```js
/**
 * 다음 투구를 만든다.
 * rand는 [0,1) 두 개를 뽑는 함수 — 구종과 높낮이에 쓰인다. 테스트에서 주입한다.
 * ratio는 투수가 선 자리의 거리 비율(distanceRatio) — 가까우면 공이 일찍 온다.
 */
export function nextPitch(homeRuns, rand = Math.random, ratio = 1) {
  const def = rand() < curveRatio(homeRuns) ? DEFS[CURVE] : DEFS[FASTBALL]
  return {
    ...def,
    flightMs: Math.round(def.flightMs * speedFactor(homeRuns) * ratio),
    lane: (rand() - 0.5) * LANE_SPREAD,
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npm test`
Expected: PASS 전부

- [ ] **Step 5: 커밋**

```bash
git add src/game/pitches.js test/pitches.test.js
git commit -m "feat: 투수 위치를 순수 모듈로 내리고 거리를 투구 시간에 반영한다"
```

---

## Task 6: 외야수 스프라이트

**Files:**
- Modify: `src/render/sprites.js` (`pitcherRelease` 아래에 붙인다)

**Interfaces:**
- Consumes: 같은 파일의 `blob`, `bone`, `torsoSilhouette`.
- Produces: `fielderStand`, `fielderRun`, `fielderCatch` — `drawFigure(ctx, pose, x, y, height, flip, glow, kit)`가 그대로 받는 포즈 객체.

포즈 객체의 형식은 `pitcherWindup`과 같다 — `silhouette(ctx)`, `torsoBone`, `sleeveBone`, `hands`, `legBones`, `head`, `helmet`. 좌표는 발밑이 원점(0,0)이고 위가 `-y`, 키 1 기준이다.

- [ ] **Step 1: 포즈 3개를 쓴다**

`src/render/sprites.js`의 `pitcherRelease` 정의 바로 아래에 붙인다:

```js
/**
 * 외야수. 담장 앞에 서서 뜬공을 기다린다. 투수보다 조금 작게 그려질 뿐
 * 만드는 법은 같다 — 검은 실루엣 위에 살색과 유니폼을 얹는다.
 */
export const fielderStand = {
  silhouette(ctx) {
    blob(ctx, 0, -0.86, 0.11)
    torsoSilhouette(ctx, [0, -0.74, 0, -0.44, 0.16])
    bone(ctx, 0, -0.44, -0.08, -0.02, 0.1)
    bone(ctx, 0, -0.44, 0.09, -0.02, 0.1)
    bone(ctx, -0.04, -0.7, -0.16, -0.5, 0.08)
    bone(ctx, 0.04, -0.7, 0.16, -0.5, 0.08)
    blob(ctx, -0.17, -0.47, 0.07)
  },
  torsoBone: [0, -0.74, 0, -0.44, 0.16],
  sleeveBone: [-0.04, -0.7, -0.16, -0.5, 0.08],
  foreBone: [0.04, -0.7, 0.16, -0.5, 0.08],
  hands: [[-0.17, -0.47, 0.056], [0.17, -0.49, 0.05]],
  legBones: [[0, -0.44, -0.08, -0.02, 0.1], [0, -0.44, 0.09, -0.02, 0.1]],
  head: [0, -0.86, 0.11],
  helmet: false,
}

/** 낙구 지점으로 달린다. 몸을 앞으로 기울이고 다리를 벌린다. */
export const fielderRun = {
  silhouette(ctx) {
    blob(ctx, -0.08, -0.84, 0.11)
    torsoSilhouette(ctx, [-0.05, -0.72, 0.02, -0.42, 0.16])
    bone(ctx, 0.02, -0.42, -0.2, -0.02, 0.1)
    bone(ctx, 0.02, -0.42, 0.22, -0.06, 0.1)
    bone(ctx, -0.06, -0.68, -0.24, -0.58, 0.08)
    bone(ctx, -0.02, -0.68, 0.16, -0.76, 0.08)
    blob(ctx, -0.26, -0.57, 0.07)
  },
  torsoBone: [-0.05, -0.72, 0.02, -0.42, 0.16],
  sleeveBone: [-0.06, -0.68, -0.24, -0.58, 0.08],
  foreBone: [-0.02, -0.68, 0.16, -0.76, 0.08],
  hands: [[-0.26, -0.57, 0.056], [0.17, -0.77, 0.05]],
  legBones: [[0.02, -0.42, -0.2, -0.02, 0.1], [0.02, -0.42, 0.22, -0.06, 0.1]],
  head: [-0.08, -0.84, 0.11],
  helmet: false,
}

/** 잡는 순간. 글러브를 머리 위로 뻗는다. */
export const fielderCatch = {
  silhouette(ctx) {
    blob(ctx, 0, -0.86, 0.11)
    torsoSilhouette(ctx, [0, -0.74, 0, -0.44, 0.16])
    bone(ctx, 0, -0.44, -0.1, -0.02, 0.1)
    bone(ctx, 0, -0.44, 0.11, -0.02, 0.1)
    bone(ctx, -0.02, -0.72, -0.08, -0.98, 0.08)
    bone(ctx, 0.04, -0.72, 0.1, -0.96, 0.08)
    blob(ctx, -0.09, -1.02, 0.08)
  },
  torsoBone: [0, -0.74, 0, -0.44, 0.16],
  sleeveBone: [-0.02, -0.72, -0.08, -0.98, 0.08],
  foreBone: [0.04, -0.72, 0.1, -0.96, 0.08],
  hands: [[-0.09, -1.02, 0.062], [0.11, -0.98, 0.05]],
  legBones: [[0, -0.44, -0.1, -0.02, 0.1], [0, -0.44, 0.11, -0.02, 0.1]],
  head: [0, -0.86, 0.11],
  helmet: false,
}
```

- [ ] **Step 2: 문법과 기존 테스트를 확인한다**

Run: `npm test && node -e "import('./src/render/sprites.js').then(m => console.log(Object.keys(m)))"`
Expected: PASS, 그리고 `fielderStand`·`fielderRun`·`fielderCatch`가 목록에 있다.

- [ ] **Step 3: 커밋**

```bash
git add src/render/sprites.js
git commit -m "feat: 외야수 포즈 세 개를 그린다"
```

---

## Task 7: 야수·잔상·아웃 글씨 그리기

**Files:**
- Modify: `src/render/draw.js`

**Interfaces:**
- Consumes: Task 1의 `chase`, Task 2의 `OUT`, Task 6의 포즈 3개, Task 5의 `PITCHER_X_BASE`.
- Produces: `draw(ctx, width, height, state, now, kits, pitcherX = PITCHER_X_BASE)` — 7번째 인자가 늘었다.

- [ ] **Step 1: import를 정리한다**

`src/render/draw.js` 맨 위:

```js
import { HOMERUN, OUT, FOUL, WHIFF, LABELS, WINDOWS } from '../game/judge.js'
import { chase, START_X } from '../game/fielder.js'
import { PITCHER_X_BASE } from '../game/pitches.js'
import {
  batterStance, batterSwing, pitcherWindup, pitcherRelease,
  fielderStand, fielderRun, fielderCatch, drawFigure,
} from './sprites.js'
```

기존 `const PITCHER_X = 0.87` 줄을 지운다 — 이제 `pitches.js`가 갖는다. 지우면서 주석을 남긴다:

```js
// 투수 X 는 pitches.js 가 갖는다 — 플레이어가 드래그로 옮기면 판정(투구 시간)에
// 들어가는 값이 되므로, 그림 상수가 아니라 순수 모듈의 값이다.
const FIELDER_H = 0.46 // 외야수 키. 투수(0.5)보다 조금 작아 멀리 있는 티가 난다.
```

- [ ] **Step 2: 결과별 잔상 길이를 만든다**

`const TRAIL_MS = 130` 을 지우고 대신:

```js
/**
 * 공 뒤에 남는 잔상의 길이 (궤적 시간 기준). 결과마다 다르다.
 * **홈런만 길다** — 짧은 꼬리로는 공만 보이고 포물선이 안 보여서,
 * 「작업 중인 창 위로 포물선을 그리며 날아간다」가 화면에 안 나타났다.
 * **파울은 아예 없다** — 헛스윙 다음으로 흔한 결과라 조용해야 한다.
 */
const TRAIL_MS = { [HOMERUN]: 500, [FOUL]: 0, default: 130 }
const trailOf = (result) => TRAIL_MS[result] ?? TRAIL_MS.default
```

`drawFlight` 안에서 `drawTrail`에 길이를 넘긴다:

```js
  drawTrail(ctx, at, flightAge, ui, fade, trailOf(state.lastResult.result))
```

`drawTrail` 시그니처와 루프:

```js
function drawTrail(ctx, at, flightAge, ui, fade, trailMs) {
  if (trailMs <= 0) return // 파울은 잔상을 안 남긴다
  ...
  for (let back = trailMs; back > 0; back -= 8) {
```

- [ ] **Step 3: 잡힌 공은 거기서 멈추게 한다**

`drawFlight` 안, `const fade = ...` 앞에 넣는다:

```js
  // 잡힌 공은 야수 글러브 안에서 멈춘다 — 홈런이 담장을 넘으며 끝나는 것과 같다.
  const caught = result === OUT ? chase(flight) : null
  const endMs = caught ? caught.hangMs : Infinity
```

그리고 공과 잔상을 그리는 시각을 잘라 준다:

```js
  const shownAge = Math.min(flightAge, endMs)

  drawTrail(ctx, at, shownAge, ui, fade, trailOf(result))

  const head = at(shownAge)
  if (head && flightAge <= endMs + 1) ball(ctx, head.x, head.y, ui.ballR, ui, fade)
```

- [ ] **Step 4: 야수를 그린다**

`drawPeople` 아래에 새 함수를 더하고, `draw()`에서 부른다.

`draw()` 안에서 지면을 그린 **직후**, 필드 상자로 `translate` 하기 **전**에 넣는다 (야수는 상자 밖 화면 좌표에 선다):

```js
  drawGround(ctx, field, spot, ui, space)
  drawFielder(ctx, ui, space, state, now, kits)
```

새 함수:

```js
/**
 * 외야수. 타구가 뜨면 낙구 지점으로 달려가고, 닿으면 잡는다.
 * **판정에 쓴 값을 그대로 그린다** — 여기서 물리를 다시 풀지 않는다.
 * 담장·지면과 마찬가지로 필드 상자 밖, 화면 좌표에 선다.
 */
function drawFielder(ctx, ui, space, state, now, kits) {
  const flight = flightOf(state)
  const run = flight ? chase(flight) : null

  let x = START_X
  let pose = fielderStand

  if (run) {
    const age = (now - state.resultAt) * TIME_SCALE
    if (age > 0) {
      // 낙구 지점까지 needMs 동안 달린다. 도착하면 거기 서 있는다.
      const t = run.needMs > 0 ? clamp(age / run.needMs, 0, 1) : 1
      x = START_X + (run.spotX - START_X) * t
      if (t < 1) pose = fielderRun
      else if (run.caught && age >= run.hangMs && age < run.hangMs + 600) pose = fielderCatch
    }
  }

  const height = space.unitY * FIELDER_H * 0.14
  drawFigure(
    ctx,
    pose,
    space.origin.x + x * space.unitX,
    space.ground,
    height,
    1,
    ui.glow,
    kits.pitcher,
  )
}

/** 지금 굴러가는 타구의 궤적. 없으면 null. draw 안에서 두 번 만들지 않으려고 모아 둔다. */
function flightOf(state) {
  if (!state.lastResult) return null
  const { result, errorMs, lane } = state.lastResult
  return battedFlight(result, errorMs, lane ?? 0)
}
```

`draw()` 아래쪽의 기존 궤적 계산도 이 함수를 쓰게 바꾼다:

```js
  // 맞은 공만 상자 밖 — 화면 전체를 쓴다. 페이즈와 무관하게 제 수명만큼 굴러간다.
  if (state.lastResult) {
    const flight = flightOf(state)
    drawFlight(ctx, field, spot, ui, space, state, now, flight)
    drawOutcome(ctx, space, ui, state, now, flight)
  }
```

- [ ] **Step 5: 아웃 글씨를 잡힌 자리에 띄운다**

`drawOutcome` 안의 `atMs`·`spot` 계산을 바꾼다:

```js
  const homer = result === HOMERUN
  const caught = result === OUT ? chase(flight) : null

  // 홈런은 담장을 넘는 순간, 아웃은 잡히는 순간, 나머지는 다 굴러 멈추는 순간.
  const atMs = homer
    ? flight.overAtMs
    : caught
      ? caught.hangMs
      : flight.roll.startMs + flight.roll.durMs
  const age = (now - state.resultAt) * TIME_SCALE - atMs
  if (age < 0) return

  const shownFor = age / TIME_SCALE
  if (shownFor > OUTCOME_MS) return

  const spot = homer
    ? { x: space.fenceX, y: space.ground - FENCE_H * space.unitY - ui.label * 1.4 }
    : {
        x: space.origin.x + (caught ? caught.spotX : travel(flight)) * space.unitX,
        y: space.ground - ui.label * 1.2,
      }
```

- [ ] **Step 6: 투수 위치를 인자로 받는다**

`draw` 시그니처와 `drawPeople`:

```js
export function draw(ctx, width, height, state, now, kits = NO_KITS, pitcherX = PITCHER_X_BASE) {
  ...
  drawPeople(ctx, field, spot, ui, state, now, kits, pitcherX)
```

`geometry(field)`는 릴리스 지점에 투수 X를 쓰므로 인자를 받게 바꾼다:

```js
function geometry(field, pitcherX) {
  const ground = field.h * GROUND_Y
  const batterH = field.h * BATTER_H
  const pitcherH = field.h * PITCHER_H

  return {
    ground,
    batterH,
    pitcherH,
    contact: { x: field.w * (BATTER_X + 0.025), y: ground - batterH * 0.52 },
    release: { x: field.w * (pitcherX - 0.06), y: ground - pitcherH * 0.88 },
  }
}
```

`draw()` 안의 호출: `const spot = geometry(field, pitcherX)`

`drawPeople` 안의 투수:

```js
function drawPeople(ctx, field, spot, ui, state, now, kits, pitcherX) {
  ...
  drawFigure(ctx, pitcher, field.w * pitcherX, spot.ground, spot.pitcherH, 1, ui.glow, kits.pitcher)
}
```

- [ ] **Step 7: 눈으로 확인한다**

Run: `npm test`
Expected: PASS 전부 (렌더는 테스트하지 않지만 import 오류가 있으면 여기서 터진다)

Run: `open src/renderer/index.html`
브라우저에서 Space를 눌러 여러 번 쳐 본다. 확인할 것:
- 야수가 담장 앞에 서 있다가 뜬공에 달려간다
- 잡히면 「아웃」이 야수 자리에 뜬다
- 홈런은 긴 포물선 잔상이 남는다
- 파울은 위로 솟고 잔상이 없다

- [ ] **Step 8: 커밋**

```bash
git add src/render/draw.js
git commit -m "feat: 야수를 그리고, 홈런에 긴 잔상을, 아웃 글씨를 잡힌 자리에 띄운다"
```

---

## Task 8: 브라우저에서 투수 드래그

**Files:**
- Modify: `src/renderer/app.js`

**Interfaces:**
- Consumes: Task 5의 `clampPitcherX`, `distanceRatio`, `PITCHER_X_BASE`. Task 7의 7번째 `draw` 인자.
- Produces: `window.sneaky`가 있을 때 쓰는 브리지 계약 —
  `sneaky.pitcherX`(초기값, number|null), `sneaky.savePitcherX(x)`, `sneaky.onPitcherX(handler)`,
  `sneaky.setHitbox({ x, y, w, h })`. 좌표는 **CSS 픽셀, 창 왼쪽 위 기준**이다.

셸이 없을 때(브라우저)도 그대로 드래그되어야 한다. 먼저 여기서 만들고, 셸은 문만 열어 준다.

- [ ] **Step 1: import와 상태를 더한다**

```js
import { nextPitch, clampPitcherX, distanceRatio, PITCHER_X_BASE } from '../game/pitches.js'
```

`let kits = ...` 아래에:

```js
// 투수가 선 자리. 드래그로 옮기면 던지는 거리가 바뀌고 공이 오는 시간도 바뀐다.
let pitcherX = PITCHER_X_BASE
const PITCHER_KEY = 'sneaky-baseball:pitcherX'

function setPitcherX(x, { save = false } = {}) {
  const next = clampPitcherX(typeof x === 'number' ? x : Number(x))
  if (next === pitcherX) return
  pitcherX = next
  if (save) persistPitcherX()
}

function persistPitcherX() {
  if (window.sneaky?.savePitcherX) {
    window.sneaky.savePitcherX(pitcherX)
    return
  }
  try {
    localStorage.setItem(PITCHER_KEY, String(pitcherX))
  } catch {
    // 저장에 실패해도 게임은 계속된다.
  }
}
```

- [ ] **Step 2: 투구에 거리를 반영한다**

```js
function pitch(now) {
  state = startPitch(state, nextPitch(state.homeRuns, Math.random, distanceRatio(pitcherX)), now)
}
```

- [ ] **Step 3: 그리는 쪽에 넘긴다**

`frame()` 안:

```js
  draw(ctx, size.w, size.h, state, now, kits, pitcherX)
  reportHitbox()
```

- [ ] **Step 4: 히트박스를 셸에 알려준다**

`draw.js`가 아는 좌표를 셸에 밀어 준다. `app.js`에 더한다:

```js
/**
 * 투수를 잡을 수 있는 자리. **셸이 이 값을 보고 클릭 통과를 잠깐 끈다** —
 * 화면 어디에 그려지는지는 draw.js 만 알기 때문에 게임이 알려줘야 한다.
 * 드래그 중에는 필드 전체로 넓힌다. 안 그러면 커서가 투수보다 빨리 움직이는
 * 순간 문이 닫혀 드래그가 끊긴다.
 */
const FIELD_W = 240
const MARGIN_X = 16
const MARGIN_Y = 8

let dragging = false
let sentHitbox = ''

function fieldBox() {
  const w = Math.min(FIELD_W, size.w - MARGIN_X * 2)
  const h = Math.round(w * 0.43) // draw.js 의 layout() 과 같은 비율
  return { x: MARGIN_X, y: size.h - MARGIN_Y - h, w, h }
}

function hitbox() {
  const box = fieldBox()
  if (dragging) return box

  // 투수 실루엣 언저리. 키의 절반쯤을 가로로 잡아 준다.
  const cx = box.x + box.w * pitcherX
  const half = box.h * 0.16
  return { x: cx - half, y: box.y + box.h * 0.4, w: half * 2, h: box.h * 0.55 }
}

function reportHitbox() {
  if (!window.sneaky?.setHitbox) return
  const box = hitbox()
  const key = `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.w)},${Math.round(box.h)}`
  if (key === sentHitbox) return // 매 프레임 브리지를 두드리지 않는다
  sentHitbox = key
  window.sneaky.setHitbox(box)
}
```

- [ ] **Step 5: 포인터로 드래그한다**

```js
/** 화면 x(CSS 픽셀) → 필드 상자 비율. */
function toPitcherX(clientX) {
  const box = fieldBox()
  return (clientX - box.x) / box.w
}

function inHitbox(x, y) {
  const box = hitbox()
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h
}

canvas.addEventListener('pointerdown', (event) => {
  if (!inHitbox(event.clientX, event.clientY)) return
  dragging = true
  canvas.setPointerCapture(event.pointerId)
  setPitcherX(toPitcherX(event.clientX))
  event.preventDefault()
})

canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return
  setPitcherX(toPitcherX(event.clientX))
})

function endDrag(event) {
  if (!dragging) return
  dragging = false
  try {
    canvas.releasePointerCapture(event.pointerId)
  } catch {
    // 이미 놓였으면 그만이다.
  }
  persistPitcherX()
}

canvas.addEventListener('pointerup', endDrag)
canvas.addEventListener('pointercancel', endDrag)
```

- [ ] **Step 6: 저장된 값을 읽고 브리지를 잇는다**

`boot()` 안, `savedBest`를 읽는 자리 옆:

```js
async function boot() {
  const record = await loadRecord()
  savedBest = record.bestMeters ?? 0
  state = createGame({ bestMeters: savedBest })

  if (window.sneaky) setPitcherX(window.sneaky.pitcherX ?? PITCHER_X_BASE)
  else {
    try {
      setPitcherX(localStorage.getItem(PITCHER_KEY) ?? PITCHER_X_BASE)
    } catch {
      // 못 읽으면 기본 자리.
    }
  }

  resize()
  requestAnimationFrame(frame)
}
```

`window.sneaky` 블록 안에 한 줄 더한다:

```js
  window.sneaky.onPitcherX?.((x) => setPitcherX(x))
```

`canvas`가 포인터 이벤트를 받으려면 CSS가 막고 있지 않아야 한다.
`src/renderer/style.css`에 `pointer-events: none`이 있으면 **canvas에서는 지운다**
(오버레이의 클릭 통과는 창 수준에서 셸이 하므로 CSS로 막을 필요가 없다).

- [ ] **Step 7: 브라우저에서 확인한다**

Run: `npm test && open src/renderer/index.html`
확인할 것:
- 투수를 잡아 좌우로 끌면 따라온다
- 범위 밖으로는 안 나간다
- 당기면 공이 눈에 띄게 빨리 온다
- 새로고침해도 옮긴 자리를 기억한다

- [ ] **Step 8: 커밋**

```bash
git add src/renderer/app.js src/renderer/style.css
git commit -m "feat: 투수를 드래그해 옮기면 던지는 거리와 시간이 함께 바뀐다"
```

---

## Task 9: 잡을 수 있다는 표시

**Files:**
- Modify: `src/render/draw.js`, `src/renderer/app.js`

**Interfaces:**
- Consumes: Task 7·8 전부.
- Produces: `draw(ctx, w, h, state, now, kits, pitcherX, grabbable = false)` — 8번째 인자.

표시가 없으면 드래그가 가능한지 알 길이 없다.

- [ ] **Step 1: `draw.js`에 표시를 더한다**

`drawPeople` 아래:

```js
/**
 * 잡을 수 있다는 표시. 수식키를 누른 채 커서가 투수 위에 왔을 때만 뜬다 —
 * 이게 없으면 투수를 옮길 수 있다는 걸 알 길이 없다.
 */
function drawGrabHint(ctx, field, spot, ui, pitcherX) {
  const x = field.w * pitcherX
  const y = spot.ground + ui.tick * 0.8
  const arm = ui.tick * 1.6

  ctx.save()
  ctx.shadowColor = HALO
  ctx.shadowBlur = ui.glow
  ctx.strokeStyle = INK
  ctx.lineWidth = Math.max(1, ui.k)
  ctx.lineCap = 'round'

  ctx.beginPath()
  ctx.moveTo(x - arm, y)
  ctx.lineTo(x + arm, y)
  // 양끝 화살촉 — 좌우로 움직인다는 뜻이다.
  ctx.moveTo(x - arm + ui.k * 3, y - ui.k * 3)
  ctx.lineTo(x - arm, y)
  ctx.lineTo(x - arm + ui.k * 3, y + ui.k * 3)
  ctx.moveTo(x + arm - ui.k * 3, y - ui.k * 3)
  ctx.lineTo(x + arm, y)
  ctx.lineTo(x + arm - ui.k * 3, y + ui.k * 3)
  ctx.stroke()
  ctx.restore()
}
```

`draw` 시그니처와 호출:

```js
export function draw(ctx, width, height, state, now, kits = NO_KITS,
                     pitcherX = PITCHER_X_BASE, grabbable = false) {
  ...
  drawPeople(ctx, field, spot, ui, state, now, kits, pitcherX)
  if (grabbable) drawGrabHint(ctx, field, spot, ui, pitcherX)
```

- [ ] **Step 2: `app.js`가 커서를 따라간다**

```js
// 커서가 투수 위에 있나. 표시를 띄울지 정하는 데만 쓴다.
let hovering = false

canvas.addEventListener('pointermove', (event) => {
  hovering = dragging || inHitbox(event.clientX, event.clientY)
})

canvas.addEventListener('pointerleave', () => {
  hovering = false
})
```

기존 `pointermove` 핸들러와 합치지 말고 따로 둔다 — 하나는 드래그, 하나는 표시다.

`frame()`:

```js
  draw(ctx, size.w, size.h, state, now, kits, pitcherX, hovering || dragging)
```

- [ ] **Step 3: 확인한다**

Run: `npm test && open src/renderer/index.html`
Expected: 커서를 투수 위에 올리면 발밑에 좌우 화살표가 뜨고, 치우면 사라진다.

- [ ] **Step 4: 커밋**

```bash
git add src/render/draw.js src/renderer/app.js
git commit -m "feat: 커서가 투수 위에 오면 잡을 수 있다는 표시를 띄운다"
```

---

## Task 10: 맥 셸 — 문을 여닫는다

**Files:**
- Modify: `mac/Sources/main.swift` (상수 블록, `bridgeScript`, `pollKeys`, 메시지 핸들러)

**Interfaces:**
- Consumes: Task 8의 브리지 계약.
- Produces: `window.sneaky.pitcherX`, `savePitcherX(x)`, `onPitcherX`, `setHitbox(box)`.

셸이 하는 일은 **`ignoresMouseEvents` 토글 하나뿐**이다. 드래그는 웹뷰가 한다.

- [ ] **Step 1: 저장 키를 더한다**

`private let recordKey = "bestMeters"` 옆:

```swift
private let pitcherXKey = "pitcherX"
private let defaultPitcherX = 0.87
```

- [ ] **Step 2: 프로퍼티와 히트박스 상태를 더한다**

`App` 클래스 안, `bestMeters` 프로퍼티 옆:

```swift
    /// 투수가 선 자리(필드 상자 가로 비율). 플레이어가 드래그로 옮긴다.
    private var pitcherX: Double {
        get {
            let v = UserDefaults.standard.double(forKey: pitcherXKey)
            return v == 0 ? defaultPitcherX : v
        }
        set { UserDefaults.standard.set(newValue, forKey: pitcherXKey) }
    }

    /// 투수를 잡을 수 있는 자리 — **게임이 알려준다**(CSS 픽셀, 창 왼쪽 위 기준).
    /// 커서가 여기 있고 수식키를 누르고 있을 때만 클릭 통과를 잠깐 끈다.
    private var hitbox: CGRect = .zero
    private var passingThrough = true
```

- [ ] **Step 3: 브리지에 네 가지를 더한다**

`bridgeScript()`의 `window.sneaky = {` 안:

```swift
          pitcherX: \(pitcherX),
          savePitcherX: (x) => window.webkit.messageHandlers.sneaky.postMessage({
            type: 'pitcherX', value: x,
          }),
          setHitbox: (box) => window.webkit.messageHandlers.sneaky.postMessage({
            type: 'hitbox', x: box.x, y: box.y, w: box.w, h: box.h,
          }),
          onPitcherX: (handler) => { window.__sneakyPitcherX = handler },
```

- [ ] **Step 4: 메시지를 받는다**

`userContentController(_:didReceive:)`의 `record` 처리 **앞**에 넣는다:

```swift
        if body["type"] as? String == "hitbox" {
            let x = body["x"] as? Double ?? 0
            let y = body["y"] as? Double ?? 0
            let w = body["w"] as? Double ?? 0
            let h = body["h"] as? Double ?? 0
            hitbox = CGRect(x: x, y: y, width: w, height: h)
            return
        }

        if body["type"] as? String == "pitcherX", let x = body["value"] as? Double {
            pitcherX = x
            return
        }
```

- [ ] **Step 5: 폴링에서 문을 여닫는다**

`pollKeys()`를 바꾼다:

```swift
    /// 투구 키를 누르고 있는 동안만 던지고, 그 상태에서 스페이스를 누르면 휘두른다.
    /// 둘 다 **상태를 물어봐서** 안다 — 키 이벤트를 가로채지 않으므로 권한도 필요 없고,
    /// 다른 앱의 단축키(윈도우 Alt+Space 창 메뉴 같은)를 건드리지도 않는다.
    ///
    /// 같은 자리에서 **커서도 물어본다**. 커서가 투수 히트박스 안에 있고 수식키를
    /// 누르고 있는 그 순간에만 클릭 통과를 끈다 — 그래야 투수를 잡아 끌 수 있다.
    /// 그 밖의 모든 순간·모든 자리는 지금처럼 전부 밑의 앱으로 통과한다.
    private func pollKeys() {
        let down = window.isVisible && NSEvent.modifierFlags.isSuperset(of: controlKey.flags)
        if down != holding {
            holding = down
            debugLog("hold \(down)")
            webView.evaluateJavaScript("window.__sneakyHold && window.__sneakyHold(\(down))")
        }
        updateMousePass(holding: down)
    }

    /// 커서가 투수 위에 있고 수식키를 누르고 있으면 마우스를 받는다.
    private func updateMousePass(holding: Bool) {
        let wantPass = !(holding && cursorInHitbox())
        guard wantPass != passingThrough else { return }
        passingThrough = wantPass
        window.ignoresMouseEvents = wantPass
        debugLog("pass \(wantPass)")
    }

    /// NSEvent.mouseLocation 은 전역 좌표(왼쪽 아래 원점)다. 히트박스는 웹뷰가 준
    /// CSS 픽셀(창 왼쪽 위 원점)이라 창 기준으로 뒤집어 맞춘다. 권한은 필요 없다.
    private func cursorInHitbox() -> Bool {
        guard hitbox.width > 0, window.isVisible else { return false }
        let mouse = NSEvent.mouseLocation
        let frame = window.frame
        let local = CGPoint(x: mouse.x - frame.minX, y: frame.maxY - mouse.y)
        return hitbox.contains(local)
    }
```

`toggleWindow()`에서 창을 숨길 때 문도 닫는다 — `holding = false` 옆에:

```swift
            updateMousePass(holding: false)
```

- [ ] **Step 6: 빌드해서 확인한다**

Run: `npm start`
확인할 것:
- 수식키를 안 누르면 **어디를 클릭해도 밑의 앱으로 간다** (투수 자리 포함)
- 수식키를 누른 채 투수 위에 커서를 올리면 화살표가 뜨고, 끌면 투수가 따라온다
- 손을 떼면 그 자리에서 다시 전부 통과한다
- 앱을 껐다 켜면 옮긴 자리를 기억한다

`SNEAKY_DEBUG=1`로 띄우면 `pass true/false`가 stderr에 흐른다:
```bash
SNEAKY_DEBUG=1 'dist/mac/Sneaky Baseball.app/Contents/MacOS/SneakyBaseball'
```

- [ ] **Step 7: 커밋**

```bash
git add mac/Sources/main.swift
git commit -m "feat: 맥 셸이 투수 위에서만 클릭 통과를 잠깐 연다"
```

---

## Task 11: 윈도우 셸 — 같은 문

**Files:**
- Modify: `windows/Program.cs`

**Interfaces:**
- Consumes: Task 8의 브리지 계약.
- Produces: 맥과 **같은 모양**의 `window.sneaky`.

윈도우는 클릭 통과가 `WS_EX_TRANSPARENT` 스타일이다. 그 비트만 껐다 켠다.

- [ ] **Step 1: P/Invoke와 상태를 더한다**

`GetAsyncKeyState` 선언 옆:

```csharp
    [StructLayout(LayoutKind.Sequential)] private struct POINT { public int X, Y; }
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out POINT p);
```

`private bool holding;` 옆:

```csharp
    /// <summary>투수를 잡을 수 있는 자리 — <b>게임이 알려준다</b>(CSS 픽셀, 창 왼쪽 위 기준).</summary>
    private Rectangle hitbox = Rectangle.Empty;
    private bool passingThrough = true;

    private const double DefaultPitcherX = 0.87;
    public double PitcherX { get; private set; } = DefaultPitcherX;
```

`ReadState()`/`WriteState()`가 다루는 항목에 `PitcherX`를 더한다 — 기존 `ScreenName`·`BatterKit`과 같은 방식으로 읽고 쓴다. `ReadState()`에서 값이 없으면 `DefaultPitcherX`를 쓴다.

- [ ] **Step 2: 브리지에 네 가지를 더한다**

`BridgeScript()`의 `window.sneaky = {` 안 — **맥과 같은 이름·같은 모양**이다:

```csharp
          pitcherX: {{PitcherX}},
          savePitcherX: (x) => window.chrome.webview.postMessage({
            type: 'pitcherX', value: x,
          }),
          setHitbox: (box) => window.chrome.webview.postMessage({
            type: 'hitbox', x: box.x, y: box.y, w: box.w, h: box.h,
          }),
          onPitcherX: (handler) => { window.__sneakyPitcherX = handler },
```

- [ ] **Step 3: 메시지를 받는다**

웹뷰 메시지 핸들러(`record`를 처리하는 곳)에 두 가지를 더한다. 기존 JSON 파싱 방식을 그대로 따른다:

```csharp
        if (type == "hitbox")
        {
            hitbox = new Rectangle(
                (int)GetDouble(root, "x"), (int)GetDouble(root, "y"),
                (int)GetDouble(root, "w"), (int)GetDouble(root, "h"));
            return;
        }

        if (type == "pitcherX")
        {
            PitcherX = GetDouble(root, "value");
            WriteState();
            return;
        }
```

`GetDouble`이 없으면 그 파일의 JSON 읽는 방식에 맞춰 더한다 (`System.Text.Json`의 `JsonElement.GetDouble()`).

- [ ] **Step 4: 폴링에서 문을 여닫는다**

`PollKeys()`를 바꾼다:

```csharp
    /// <summary>
    /// 투구 키를 누르고 있는 동안만 던지고, 그 상태에서 스페이스를 누르면 휘두른다.
    /// 둘 다 상태를 물어봐서 안다 — 키를 가로채지 않으므로 아래 앱의 입력이 그대로 산다.
    ///
    /// 같은 자리에서 <b>커서도 물어본다</b>. 커서가 투수 히트박스 안에 있고 수식키를
    /// 누르고 있는 그 순간에만 클릭 통과를 끈다 — 그래야 투수를 잡아 끌 수 있다.
    /// </summary>
    private void PollKeys()
    {
        var down = Visible && Array.TrueForAll(HoldKey.Vks, vk => (GetAsyncKeyState(vk) & 0x8000) != 0);
        if (down != holding)
        {
            holding = down;
            Send($"window.__sneakyHold && window.__sneakyHold({(down ? "true" : "false")})");
        }
        UpdateMousePass(down);
    }

    /// <summary>커서가 투수 위에 있고 수식키를 누르고 있으면 마우스를 받는다.</summary>
    private void UpdateMousePass(bool down)
    {
        var wantPass = !(down && CursorInHitbox());
        if (wantPass == passingThrough) return;
        passingThrough = wantPass;

        var style = GetWindowLong(Handle, GWL_EXSTYLE);
        SetWindowLong(Handle, GWL_EXSTYLE,
            wantPass ? style | WS_EX_TRANSPARENT : style & ~WS_EX_TRANSPARENT);
    }

    /// <summary>GetCursorPos 는 화면 좌표다. 히트박스는 창 왼쪽 위 기준이라 옮겨 맞춘다.</summary>
    private bool CursorInHitbox()
    {
        if (hitbox.Width <= 0 || !Visible) return false;
        if (!GetCursorPos(out var p)) return false;
        var local = new Point(p.X - Bounds.Left, p.Y - Bounds.Top);
        return hitbox.Contains(local);
    }
```

창을 숨기는 자리(`window.__sneakyHold && ... (false)`를 보내는 곳)에서 문도 닫는다:

```csharp
        UpdateMousePass(false);
```

- [ ] **Step 5: 컴파일을 확인한다**

윈도우 빌드는 윈도우에서만 된다. 여기서는 **CI가 확인한다** — `.github/workflows/release.yml`이 PR에서도 윈도우 셸을 컴파일하도록 이미 되어 있다(커밋 `7efd26c`).

Run: `git push` 후 CI의 윈도우 컴파일 잡이 통과하는지 본다.
맥에서 문법만 훑으려면: `grep -c "UpdateMousePass" windows/Program.cs` → 3 (정의 1 + 호출 2)

- [ ] **Step 6: 커밋**

```bash
git add windows/Program.cs
git commit -m "feat: 윈도우 셸도 투수 위에서만 클릭 통과를 잠깐 연다"
```

---

## Task 12: 확정 결정 갱신

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: 앞 태스크 전부.
- Produces: 없음 — 문서다.

- [ ] **Step 1: 「창」 항목의 클릭 통과 문장을 고친다**

```markdown
- **창**: 창틀 없는 **전체 화면 투명 오버레이**. 주 디스플레이 작업 영역을 덮고, 마우스는
  전부 밑의 앱으로 통과시킨다(`setIgnoreMouseEvents`). **예외는 딱 한 군데** —
  커서가 투수 히트박스 안에 있고 수식키를 누르고 있는 그 순간에만 창이 마우스를 받아
  투수를 끌 수 있다. 히트박스는 게임이 브리지로 알려주고(`setHitbox`), 셸은 이미 도는
  60Hz 폴링에서 커서를 읽어(`NSEvent.mouseLocation` / `GetCursorPos`, 권한 불필요)
  문만 여닫는다. 드래그 자체는 웹뷰가 처리한다.
  항상 위(`screen-saver` 레벨), 전체화면 앱 위에도 뜬다. Dock 아이콘 없음 —
  조작 창구는 메뉴바 트레이(`⚾`)뿐.
```

- [ ] **Step 2: 「배치」 항목을 사실에 맞게 고친다**

```markdown
- **배치**: **타자·투수·투구**만 화면 왼쪽 아래 구석의 작은 필드 상자(`draw.js`의
  `FIELD_W`×`FIELD_H`) 안에 있다. **지면·담장·야수와 맞은 공은 상자를 벗어나**
  화면 좌표로 그려진다 — 지면선은 담장(화면 폭 97%)까지 뻗고, 외야수는 그 선 위
  `fielder.js`의 `START_X` 자리에 선다.
```

- [ ] **Step 3: 「판정」 항목에 아웃을 더한다**

```markdown
- **판정**: 타이밍은 **맞았는지**까지만 정한다 — 굿(≤80ms) 안타 / 파울(≤150ms) /
  그 외 헛스윙. **홈런은 타구가 담장을 넘어갔는지로, 아웃은 야수가 닿았는지로 갈린다** —
  둘 다 궤적을 만들어 봐야 알 수 있으므로 `judgeSwing`이 아니라 `engine`이 정한다.
  **아웃은 잃는 게 없다** — 연속 기록을 올리지도 끊지도 않고, 다음 공은 똑같이 온다.
  이건 몰래 손 푸는 게임이지 지고 이기는 게임이 아니다. 아웃카운트는 없다.
  잘 맞힐수록 홈런 아니면 아웃이고, 힘없이 맞은 공이 안타가 된다.
  공의 높낮이도 결과에 영향을 준다 — 낮은 공은 각도가 깎여 덜 날아간다.
  대략 13ms(높은 공 17ms, 낮은 공 8ms) 안쪽으로 맞혀야 넘어간다. 볼·스트라이크 카운트 없음.
```

- [ ] **Step 4: 「야수」 항목을 새로 더한다** (「담장」 바로 아래)

```markdown
- **야수**: 외야수 한 명이 `START_X`에 서 있다가 **타구가 뜨면 낙구 지점으로 달려간다.**
  체공 시간 안에 닿으면 아웃이다. **잡는 건 뜬공뿐** — 바운드된 공도, 담장을 직격해
  공중에서 끊긴 라이너도 안 잡는다. 못 박아 두면 담장과 똑같은 「구멍 뚫린 벽」이 되어
  몇 판이면 「저기만 피하면 된다」로 굳으므로 뛰게 했다. 달리는 속도가 상수 하나라
  여전히 결정론적이고 「보이는 그대로 판정된다」도 안 깨진다.
  **잡힌 공은 거기서 멈춘다** — 홈런이 `overAtMs`에서 끝나듯 아웃은 `hangMs`에서 끝난다.
  다음 투구 시각과 글씨 위치가 모두 이 시각을 본다.
```

- [ ] **Step 5: 「타구」와 「결과 표시」에 연출을 반영한다**

「타구」 항목 끝에:

```markdown
  **파울은 거의 수직으로 솟는 팝파울이다**(`FOUL_DEG`). 예전엔 뒤로 0.5배 힘으로
  나갔는데 타격점이 화면 왼쪽 끝에 붙어 있어 뜨자마자 화면 밖으로 사라졌다 —
  파울이라는 결과가 화면에서 아무 일도 안 일으켰다.
  **잔상은 결과마다 다르다**(`TRAIL_MS`) — 홈런만 길고(500ms) 파울은 아예 없다.
  짧은 꼬리로는 공만 보이고 포물선이 안 보인다. 파울은 흔한 결과라 조용해야 한다.
```

「결과 표시」 항목에:

```markdown
  **아웃은 잡힌 자리에** 뜬다.
```

- [ ] **Step 6: 「투수 위치」를 「조작」 항목 아래에 더한다**

```markdown
- **투수 위치**: 플레이어가 **투수를 드래그해서** 앞뒤로 옮긴다. 옮기면 던지는 거리가
  바뀌고, **거리가 곧 투구 시간**이다(`distanceRatio`) — 당기면 공이 일찍 와서 어려워지고,
  밀면 늦게 와서 쉬워진다. 그래야 이름만 난이도가 아니다. 값은 `pitches.js`가 갖는다 —
  판정에 들어가므로 그림 상수가 아니다.
  **범위는 좁다**(`PITCHER_X_MIN`~`MAX`). 최고 비거리 기록을 하나로 두기 때문이다 —
  넓히면 멀찍이 밀어 두고 세운 기록이 판을 차지한다. **범위를 넓히려면 기록을 갈라야 한다.**
  고른 값은 셸이 저장한다.
```

- [ ] **Step 7: 「구조」의 파일 목록에 `fielder.js`를 더한다**

```markdown
- `src/game/` — 순수 모듈. Electron·Canvas를 모른다. 시간은 항상 인자(`now`)로 받는다.
  - `pitches.js` 구종·궤적·난이도·투수 위치 / `judge.js` 판정 / `batted.js` 타구
  - `fielder.js` 외야수 — 궤적 하나를 받아 「사람이 거기 닿는가」에만 답한다
  - `engine.js` 상태 전이
```

「`test/`」 줄에 `fielder.js`를 더한다.

- [ ] **Step 8: 확인하고 커밋**

Run: `npm test`
Expected: PASS 전부

```bash
git add CLAUDE.md
git commit -m "docs: 야수·팝파울·투수 드래그를 CLAUDE.md 에 반영한다"
```

---

## Task 13: 전체 확인

**Files:** 없음 — 검증만 한다.

- [ ] **Step 1: 테스트 전체**

Run: `npm test`
Expected: PASS 전부, 실패 0

- [ ] **Step 2: 브라우저에서 손으로 쳐 본다**

Run: `open src/renderer/index.html`

30번쯤 쳐 보며 확인한다:
- [ ] 홈런·안타·아웃·파울·헛스윙이 **모두** 나온다 (하나라도 안 나오면 Task 3으로 돌아간다)
- [ ] 야수가 뜬공에 달려가고, 잡으면 공이 거기서 멈춘다
- [ ] 「아웃」이 야수 자리에, 「안타」가 공 멈춘 자리에, 「HOME RUN!」이 담장 위에 뜬다
- [ ] 홈런에 화면을 가로지르는 포물선 잔상이 남는다
- [ ] 파울이 화면 위로 솟고 잔상이 없다
- [ ] 투수를 끌면 따라오고, 당기면 공이 눈에 띄게 빨리 온다
- [ ] 아웃이 연속 기록을 안 끊는다

- [ ] **Step 3: 맥 앱에서 확인한다**

Run: `npm start`
- [ ] 수식키를 안 누르면 **어디를 클릭해도** 밑의 앱으로 간다
- [ ] 수식키 + 투수 위 → 화살표가 뜨고 끌 수 있다
- [ ] 끌고 나서 손을 떼면 그 자리도 다시 통과된다
- [ ] `Cmd+Shift+B`로 숨기면 드래그도 같이 막힌다
- [ ] 껐다 켜면 투수 자리를 기억한다

- [ ] **Step 4: 남은 판단을 기록한다**

튜닝하며 정한 값(`START_X`·`RUN_SPEED`·`REACH`, `PITCHER_X_MIN`/`MAX`, `FOUL_DEG`)이
스펙의 「남은 판단」과 다르면 스펙 문서를 실제 값으로 고친다.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "docs: 튜닝으로 정해진 값을 설계 문서에 반영한다"
```

---

## Self-Review 결과

**스펙 커버리지** — 스펙의 모든 절이 태스크로 덮인다:

| 스펙 절 | 태스크 |
|---|---|
| 1. 새 결과 `OUT` | Task 2 |
| 1-1. 잡힌 공은 거기서 멈춘다 | Task 2 (Step 4), Task 7 (Step 3·5) |
| 2. `fielder.js` | Task 1, Task 3(튜닝) |
| 3. 렌더 — 야수 | Task 6(포즈), Task 7(위치·그리기) |
| 4. 연출 — 홈런 잔상 | Task 7 (Step 2) |
| 4. 연출 — 팝파울 | Task 4 |
| 5. 투수 드래그 — 거리가 곧 시간 | Task 5 |
| 5. 투수 드래그 — 문/웹뷰 분업 | Task 8(웹뷰), Task 10(맥), Task 11(윈도우) |
| 5. 잡을 수 있다는 표시 | Task 9 |
| 5. 저장 | Task 8·10·11 |
| 6. 기록은 하나로 둔다 | 변경 없음 — Task 5가 범위를 좁게 잡아 지킨다 |
| 테스트 | Task 1·2·3·4·5에 분산, Task 13이 수동 확인 |
| CLAUDE.md 갱신 대상 | Task 12 |

**이름 일관성** — 태스크를 가로질러 쓰는 이름:
`chase(flight)` → `{ caught, spotX, needMs, hangMs }` (Task 1 정의, Task 2·7에서 사용),
`OUT` (Task 2 정의, Task 7 사용), `clampPitcherX`/`distanceRatio`/`PITCHER_X_BASE`
(Task 5 정의, Task 7·8 사용), `fielderStand`/`fielderRun`/`fielderCatch`
(Task 6 정의, Task 7 사용), 브리지 `pitcherX`/`savePitcherX`/`onPitcherX`/`setHitbox`
(Task 8 정의, Task 10·11이 같은 이름으로 구현).
