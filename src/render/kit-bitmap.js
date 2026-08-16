// 유니폼 격자를 RGBA 바이트로 푼다. Canvas를 모르는 순수 함수라 테스트가 된다 —
// 이 바이트를 ImageData 에 담아 캔버스로 굽는 건 sprites.js 가 한다.

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
/**
 * 소매를 칠할 색. 격자에서 제일 많은 색을 세는 방법도 있었지만 LG 홈처럼
 * 핀스트라이프에 어깨 줄까지 있으면 검정이 흰색을 이겨 소매가 뒤집힌다 —
 * 옷감 색은 세는 게 아니라 사진을 보고 정하는 것이라 데이터로 받는다.
 */
export function jerseyBase(kit) {
  return kit.base
}

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
