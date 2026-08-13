// 검은 실루엣 포즈. 각 포즈는 키 1.0 = 발끝(y≈0)에서 머리끝(y≈-1)인 단위 공간에 그린다.
//
// 포즈는 실루엣을 그리는 함수 하나로 끝나지 않는다 — 유니폼 무늬를 몸통에 얹으려면
// 몸통 뼈대와 머리 위치를 밖에서도 알아야 해서 같이 내준다. torsoBone 과 head 의 값은
// silhouette 안에서 실제로 그리는 값과 같아야 한다. 어긋나면 무늬가 몸에서 떠 보인다.

import { kitRGBA } from './kit-bitmap.js'
import { GRID_W, GRID_H } from './teams.js'

/**
 * 포즈를 (x, y) 지점에 height 픽셀 크기로 그린다. flip=-1이면 좌우 반전.
 * glow가 켜져 있으면 흰 번짐을 먼저 깔아 어두운 배경 위에서도 실루엣이 읽히게 한다.
 * 그림자 번짐은 변환 행렬을 타지 않으므로 크기와 무관하게 일정한 두께가 된다.
 * kit이 있으면 상의와 모자를 덧그린다 — 없으면 예전 그대로 검은 실루엣이다.
 */
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

// 구운 유니폼 캔버스를 키트별로 재활용한다. 20벌 × 6×9 픽셀이라 무시할 크기다.
const jerseyCache = new Map()

function jerseyCanvas(kit) {
  let canvas = jerseyCache.get(kit)
  if (canvas) return canvas

  canvas = document.createElement('canvas')
  canvas.width = GRID_W
  canvas.height = GRID_H
  canvas.getContext('2d').putImageData(new ImageData(kitRGBA(kit), GRID_W, GRID_H), 0, 0)

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
  // 머리보다 살짝 작게 그려 실루엣 경계에 검은 테두리가 한 줄 남게 한다.
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
