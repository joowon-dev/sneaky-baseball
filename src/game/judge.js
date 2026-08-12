// 스윙 타이밍 오차 → 판정. 순수 모듈.

export const WINDOWS = { perfect: 35, good: 80, foul: 150 }

export const HOMERUN = 'homerun'
export const HIT = 'hit'
export const FOUL = 'foul'
export const WHIFF = 'whiff'

export const LABELS = {
  [HOMERUN]: 'HOME RUN!',
  [HIT]: '안타',
  [FOUL]: '파울',
  [WHIFF]: '헛스윙',
}

/**
 * swingMs, plateMs는 같은 시계의 밀리초 값.
 * timing: perfect | early | late | take
 */
export function judgeSwing(swingMs, plateMs) {
  const errorMs = swingMs - plateMs
  const off = Math.abs(errorMs)
  const direction = errorMs < 0 ? 'early' : 'late'

  if (off <= WINDOWS.perfect) return { result: HOMERUN, timing: 'perfect', errorMs }
  if (off <= WINDOWS.good) return { result: HIT, timing: direction, errorMs }
  if (off <= WINDOWS.foul) return { result: FOUL, timing: direction, errorMs }
  return { result: WHIFF, timing: direction, errorMs }
}

/** 스윙하지 않고 공을 보낸 경우. */
export function judgeTake() {
  return { result: WHIFF, timing: 'take', errorMs: null }
}
