// 게임 상태 전이. 모든 함수는 새 상태를 반환하는 순수 함수다.

import { HOMERUN, HIT, FOUL, WHIFF, WINDOWS, judgeSwing, judgeTake } from './judge.js'
import { battedFlight, restMs, clearsFence } from './batted.js'

export const READY = 'ready'
export const PITCHING = 'pitching'
export const RESULT = 'result'

/**
 * 결과를 보여주는 시간, 그리고 와인드업 시간 (ms).
 * 투수는 결과를 다 보여주고 **친 공이 다 굴러 멈춘 뒤에** 와인드업을 시작한다.
 */
export const RESULT_MS = 700
export const WINDUP_MS = 500

export function createGame(initial = {}) {
  return {
    phase: READY,
    homeRuns: 0,
    hits: 0,
    streak: 0,
    bestStreak: 0,
    pitches: 0,
    restAt: 0,
    pitch: null,
    pitchStartedAt: 0,
    plateAt: 0,
    lastResult: null,
    resultAt: 0,
    ...initial,
  }
}

export function startPitch(state, pitch, now) {
  if (state.phase === PITCHING) return state
  return {
    ...state,
    phase: PITCHING,
    pitch,
    pitchStartedAt: now,
    plateAt: now + pitch.flightMs,
    pitches: state.pitches + 1,
    // lastResult는 지우지 않는다 — 직전 타구는 다음 공이 오는 동안에도 계속 굴러간다.
  }
}

export function swing(state, now) {
  if (state.phase !== PITCHING) return state
  return applyResult(state, judgeSwing(now, state.plateAt), now)
}

/** 공이 파울 윈도우까지 지나갔는데 스윙이 없으면 헛스윙 처리한다. */
export function tick(state, now) {
  if (state.phase !== PITCHING) return state
  if (now <= state.plateAt + WINDOWS.foul) return state
  return applyResult(state, judgeTake(), now)
}

/**
 * 다음 공을 던질 수 있는 시각. 결과를 다 보여주고, 친 공이 멈추기를 기다린 뒤 와인드업한다.
 * 그래서 잘 맞은 타구일수록 다음 공이 늦게 온다 — 끝까지 굴러가는 걸 보고 던진다.
 */
export function nextPitchAt(state) {
  return Math.max(state.resultAt + RESULT_MS, state.restAt) + WINDUP_MS
}

/** 다음 공을 던질 때가 됐으면 받을 수 있는 상태로 돌아간다. */
export function settle(state, now) {
  if (state.phase !== RESULT) return state
  if (now < nextPitchAt(state)) return state
  return { ...state, phase: READY }
}

/**
 * 손을 떼면 즉시 대기. 던지던 공은 없던 일이 된다 — 안 보고 있을 때 온 공에
 * 헛스윙 기록이 남으면 억울하다. 이미 친 공(lastResult)은 건드리지 않아 계속 굴러간다.
 */
export function idle(state) {
  if (state.phase === READY && !state.pitch) return state
  return { ...state, phase: READY, pitch: null }
}

/** 투구 진행률 0..1 이상 (파울 윈도우 동안 1을 넘어간다). */
export function progress(state, now) {
  if (!state.pitch) return 0
  return (now - state.pitchStartedAt) / state.pitch.flightMs
}

function applyResult(state, verdict, now) {
  const lane = state.pitch?.lane ?? 0
  // 타격 높이(launchDy)는 그리는 쪽 사정이고 멈추는 시각에 미치는 영향은 몇 ms라 여기선 뺀다.
  const flight = battedFlight(verdict.result, verdict.errorMs, lane)

  // 홈런은 타이밍이 아니라 담장을 넘었는지로 갈린다. 화면에 그려진 그 선 그대로다.
  const result = verdict.result === HIT && clearsFence(flight) ? HOMERUN : verdict.result

  const next = {
    ...state,
    phase: RESULT,
    // 공의 높낮이를 함께 남긴다 — 다음 공이 와도 이 타구의 궤적은 그대로여야 한다.
    lastResult: { ...verdict, result, lane },
    resultAt: now,
    restAt: now + restMs(flight),
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
    case FOUL:
      break
  }

  next.bestStreak = Math.max(state.bestStreak, next.streak)
  return next
}
