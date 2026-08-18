// 검은 실루엣 포즈. 각 포즈는 키 1.0 = 발끝(y≈0)에서 머리끝(y≈-1)인 단위 공간에 그린다.
//
// 포즈는 실루엣을 그리는 함수 하나로 끝나지 않는다 — 유니폼 무늬를 몸통에 얹으려면
// 몸통 뼈대와 머리 위치를 밖에서도 알아야 해서 같이 내준다. torsoBone 과 head 의 값은
// silhouette 안에서 실제로 그리는 값과 같아야 한다. 어긋나면 무늬가 몸에서 떠 보인다.

import { kitRGBA, jerseyBase } from './kit-bitmap.js'
import { GRID_W, GRID_H, PANTS } from './teams.js'
import { CAP_GLYPHS } from './glyphs.js'

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
    drawPants(ctx, pose)
    drawJersey(ctx, pose, kit)
    if (kit.panel) drawPanel(ctx, pose, kit)
    if (kit.stripe) drawStripes(ctx, pose, kit)
    if (kit.collar) drawCollar(ctx, pose, kit)
    if (kit.mark) drawMark(ctx, pose, kit)
    drawBelt(ctx, pose)
    drawSleeve(ctx, pose, kit)
    if (kit.trim) drawCuff(ctx, pose, kit)
    if (pose.helmet) drawHelmet(ctx, pose, kit)
    else drawCap(ctx, pose, kit)
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
  sleeveBone: [0, -0.7, 0.16, -0.6, 0.08],
  legBones: [[0.02, -0.44, -0.13, -0.02, 0.1], [0.02, -0.44, 0.16, -0.02, 0.1]],
  head: [0.02, -0.86, 0.1],
  helmet: true,
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
  sleeveBone: [0, -0.7, -0.26, -0.6, 0.08],
  legBones: [[-0.02, -0.44, -0.2, -0.02, 0.1], [-0.02, -0.44, 0.16, -0.05, 0.1]],
  head: [-0.02, -0.86, 0.1],
  helmet: true,
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
  sleeveBone: [0.02, -0.68, -0.14, -0.6, 0.08],
  legBones: [[0, -0.42, -0.09, -0.02, 0.1], [0, -0.42, 0.11, -0.02, 0.1]],
  head: [0, -0.84, 0.11],
  helmet: false,
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
  sleeveBone: [0.02, -0.66, -0.14, -0.76, 0.08],
  legBones: [[-0.02, -0.4, -0.26, -0.02, 0.1], [-0.02, -0.4, 0.2, -0.06, 0.1]],
  head: [-0.05, -0.8, 0.11],
  helmet: false,
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
 * 상의가 덮는 모양. 몸통은 둥근 끝(lineCap: round) 선으로 그려지지만, 위쪽 둥근 끝까지
 * 옷으로 덮으면 어깨선 위로 반원이 혹처럼 솟아 옷이 아니라 두건처럼 보인다.
 * 그래서 **위는 어깨선에서 평평하게 자르고 아래만 둥글게** 남긴다 —
 * 잘라 낸 반원은 실루엣의 검정으로 남아 목덜미가 된다.
 */
function jerseyPath(ctx, [ax, ay, bx, by, w]) {
  const r = w / 2
  const angle = Math.atan2(by - ay, bx - ax)
  const px = Math.cos(angle + Math.PI / 2) * r
  const py = Math.sin(angle + Math.PI / 2) * r

  ctx.beginPath()
  ctx.moveTo(ax + px, ay + py)
  ctx.lineTo(bx + px, by + py)
  ctx.arc(bx, by, r, angle + Math.PI / 2, angle - Math.PI / 2, true)
  ctx.lineTo(ax - px, ay - py)
  ctx.closePath()
}

/**
 * 상의. 몸통 모양으로 클립을 잡고 그 안을 무늬로 채운다 —
 * 네모난 비트맵을 그냥 얹으면 옆구리가 몸 밖으로 삐져나온다.
 */
function drawJersey(ctx, pose, kit) {
  const [ax, ay, bx, by, w] = pose.torsoBone
  const r = w / 2

  ctx.save()
  jerseyPath(ctx, pose.torsoBone)
  ctx.clip()

  // 보간을 끄면 확대해도 칸이 또렷한 네모로 남는다 — 이게 픽셀로 보이는 이유다.
  // 위가 평평해졌으므로 격자도 어깨선(ay)에서 시작해야 첫 줄이 잘리지 않는다.
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    jerseyCanvas(kit),
    Math.min(ax, bx) - r,
    Math.min(ay, by),
    Math.abs(bx - ax) + w,
    Math.abs(by - ay) + r,
  )
  ctx.restore()
}

// 덧그리는 선은 실루엣보다 얇게 — 가장자리에 검은 테두리를 남겨야 몸에서 안 뜬다.
const TRIM = 0.72
// 핀스트라이프 줄 수. 몸통이 8px뿐이라 1px 줄 셋이면 사이가 3px씩 벌어진다.
const STRIPE_N = 3
// 줄 굵기는 몸통 폭에 비례한다. 게임 크기에서는 1px이고, 크게 그리면 같이 굵어진다.
const STRIPE_RATIO = 0.07
// 긴바지라 발목까지 내려온다. 끝에 남긴 검정이 스파이크가 된다.
const PANTS_FRAC = 0.86
// 반팔이라 윗팔을 다 덮지는 않는다.
const SLEEVE_FRAC = 0.5
/**
 * 워드마크 글씨체. 사진의 세 부류를 흉내 낸다 —
 *   block  TIGERS·TWINS·EAGLES 처럼 곧게 선 굵은 대문자
 *   slant  KT WIZ·Giants·Dinos·KIWOOM 처럼 오른쪽으로 기운 굵은 대문자
 *   script Lions·Bears·Landers·Eagles(홈) 처럼 흘려 쓴 필기체
 * 구단 서체를 그대로 심을 수는 없으니 성격만 맞춘다.
 */
const MARK_STYLES = {
  block: { weight: '900', slant: 0, family: `'Arial Black', Impact, system-ui, sans-serif`, size: 1 },
  slant: { weight: '900', slant: 0.24, family: `'Arial Black', Impact, system-ui, sans-serif`, size: 1 },
  // 필기체는 x-높이가 낮아 같은 크기로 두면 혼자 작아 보인다.
  script: { weight: '700', slant: 0.1, family: `'Brush Script MT', 'Snell Roundhand', 'Segoe Script', cursive`, size: 1.25 },
}
const CAP_STYLE = MARK_STYLES.block
// 가슴 글씨 자리. 몸통 높이의 이만큼 아래가 글씨 중심이다.
const MARK_Y = 0.3
// 글씨 크기와, 몸통 폭에서 글씨가 차지할 최대 비율.
const MARK_H = 0.17
const MARK_W = 0.86
// 테두리를 두를 최소 글자 크기. 이보다 작으면 테두리가 글자를 다 먹는다.
const OUTLINE_MIN = 6
// 모자 글자 크기와 높이. 사진에서 로고는 앞면의 절반쯤이고 크라운 한가운데에 앉는다 —
// 크게 잡으면 모자가 아니라 글자를 쓴 것처럼 보인다.
const GLYPH_SIZE = 0.64
const GLYPH_Y = 0.42

/**
 * 장치 픽셀에 딱 맞춰 글씨를 찍는다.
 *
 * 단위 공간에 그대로 fillText 하면 두 가지가 깨진다 — 글자 크기가 소수점이 되어
 * 흐려지고, 타자는 flip=-1 로 그려지므로 글씨가 좌우로 뒤집힌다.
 * 변환을 풀고 화면 좌표에서 찍으면 둘 다 없다.
 */
function stamp(ctx, { text, color, outline, style }, cx, cy, size, maxWidth) {
  const face = MARK_STYLES[style] ?? CAP_STYLE

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.font = `${face.weight} ${Math.round(size * face.size)}px ${face.family}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.translate(cx, cy)
  // 기울기는 폰트의 italic 대신 기울임 변환으로 준다 — 굵은 서체는 italic 자체가 없는
  // 경우가 많아 브라우저가 제멋대로 흉내 내거나 아예 곧게 나온다.
  if (face.slant) ctx.transform(1, 0, -face.slant, 1, 0, 0)

  // 넘치면 가로로 눌러 담는다. 실제 유니폼 워드마크도 가슴 폭에 맞춰 좁혀져 있다.
  const width = ctx.measureText(text).width
  if (width > maxWidth) ctx.scale(maxWidth / width, 1)

  // 대부분의 워드마크는 대비색 테두리를 두른다 — 어두운 옷 위 어두운 글씨를 살리는 게
  // 그 테두리라, 이게 없으면 절반은 옷에 묻힌다.
  if (outline && size >= OUTLINE_MIN) {
    ctx.strokeStyle = outline
    ctx.lineWidth = size * 0.22
    ctx.lineJoin = 'round'
    ctx.strokeText(text, 0, 0)
  }
  ctx.fillStyle = color
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

/** 현재 변환에서 단위 좌표를 화면 좌표로 옮기는 함수. */
function projector(ctx) {
  const m = ctx.getTransform()
  return (ux, uy) => ({ x: m.a * ux + m.c * uy + m.e, y: m.b * ux + m.d * uy + m.f })
}

/**
 * 가슴 워드마크. 예전엔 이 자리를 색 띠 한 줄로만 표시했는데,
 * 띠는 어느 구단이든 똑같이 생겨서 결국 구단이 구분되지 않았다.
 */
function drawMark(ctx, pose, kit) {
  const { cx, top, bottom, w } = torsoBox(pose)
  const at = projector(ctx)
  const l = at(cx - w / 2, 0).x
  const r = at(cx + w / 2, 0).x
  const span = Math.abs(r - l)
  const height = Math.abs(at(0, bottom).y - at(0, top).y)

  ctx.save()
  jerseyPath(ctx, pose.torsoBone)
  ctx.clip()
  stamp(
    ctx,
    kit.mark,
    (l + r) / 2,
    at(0, top + (bottom - top) * MARK_Y).y,
    Math.max(3, Math.round(height * MARK_H)),
    span * MARK_W,
  )
  ctx.restore()
}

/**
 * 모자·헬멧 앞면 글자. 크라운이 머리 위 절반이라 그 한가운데에 얹는다.
 *
 * 구단 로고는 글자 모양이지만 어떤 폰트에도 없는 모양이라(`glyphs.js` 참고) 손으로 그린
 * 글자를 우선 쓰고, 없는 구단만 텍스트로 떨어진다.
 */
function drawCapMark(ctx, pose, kit) {
  const [hx, hy, r] = pose.head
  const ink = { color: kit.cap.markColor, outline: kit.cap.markOutline, accent: kit.cap.markAccent }
  const glyph = CAP_GLYPHS[kit.cap.glyph]

  if (glyph) {
    ctx.save()
    ctx.translate(hx, hy - r * GLYPH_Y)
    // 타자는 flip=-1 로 그려진다. 그대로 두면 글자가 거울로 뒤집힌다.
    if (ctx.getTransform().a < 0) ctx.scale(-1, 1)
    ctx.scale(r * GLYPH_SIZE, r * GLYPH_SIZE)
    glyph(ctx, ink)
    ctx.restore()
    return
  }

  const at = projector(ctx)
  const span = Math.abs(at(hx + r, 0).x - at(hx - r, 0).x)
  const center = at(hx, hy - r * 0.4)
  stamp(ctx, { ...ink, text: kit.cap.mark, style: 'block' }, center.x, center.y,
    Math.max(3, Math.round(span * 0.4)), span * 0.9)
}

/** 뼈대의 시작점에서 frac 만큼만 그린다. */
function partial(ctx, [ax, ay, bx, by, w], frac, color) {
  ctx.strokeStyle = color
  ctx.lineWidth = w * TRIM
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(ax + (bx - ax) * frac, ay + (by - ay) * frac)
  ctx.stroke()
}

/**
 * 핀스트라이프. 격자에 넣으면 6칸 중 3칸이 검정이 되어 굵은 줄무늬가 된다 —
 * 옷감 무늬는 색 블록보다 고운 단위라 격자 밖에서 가는 선으로 긋는다.
 */
function drawStripes(ctx, pose, kit) {
  const [ax, ay, bx, by, w] = pose.torsoBone

  ctx.save()
  jerseyPath(ctx, pose.torsoBone)
  ctx.clip()

  // 단위 공간에서 그으면 선이 픽셀 격자에 안 맞아 어떤 줄은 1px, 어떤 줄은 2px가 된다.
  // 클립은 이미 잡혔으니 변환만 풀고 장치 픽셀에 딱 맞춰 칠한다.
  const m = ctx.getTransform()
  const at = (ux, uy) => ({ x: m.a * ux + m.c * uy + m.e, y: m.b * ux + m.d * uy + m.f })
  const midX = (ax + bx) / 2
  const l = at(midX - w / 2, 0).x
  const r = at(midX + w / 2, 0).x
  const lo = Math.min(l, r)
  const span = Math.abs(r - l)
  const top = at(0, Math.min(ay, by) - w).y
  const bottom = at(0, Math.max(ay, by) + w).y

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = kit.stripe
  const thick = Math.max(1, Math.round(span * STRIPE_RATIO))
  for (let i = 1; i <= STRIPE_N; i += 1) {
    const x = Math.round(lo + (span * i) / (STRIPE_N + 1) - thick / 2)
    ctx.fillRect(x, Math.round(top), thick, Math.round(bottom) - Math.round(top))
  }
  ctx.restore()
}

/** 몸통 상자를 단위 공간으로 풀어둔다 — 곡선 요소들이 다 이 좌표를 쓴다. */
function torsoBox(pose) {
  const [ax, ay, bx, by, w] = pose.torsoBone
  return {
    cx: (ax + bx) / 2,
    // 위는 어깨선에서 평평하게 끝난다(jerseyPath 참고). 아래만 반원이 붙는다.
    top: Math.min(ay, by),
    bottom: Math.max(ay, by) + w / 2,
    w,
    neck: { x: ax, y: ay, r: w / 2 },
  }
}

/**
 * 옆구리 패널. 격자로 그리면 계단이 생겨 사선도 곡선도 안 나온다 —
 * 색면보다 고운 모양이라 클립 안에서 곡선으로 채운다.
 *   sash  — KIA. 아래 양옆에서 솟아 가운데 단추 줄만 남긴다.
 *   sides — NC. 양 옆구리에 세로로 붙고 위쪽이 둥글게 끝난다.
 */
function drawPanel(ctx, pose, kit) {
  const { cx, top, bottom, w } = torsoBox(pose)
  const h = bottom - top

  ctx.save()
  jerseyPath(ctx, pose.torsoBone)
  ctx.clip()
  ctx.fillStyle = kit.panel.color

  // 어느 쪽이든 옆 솔기를 위에서 아래까지 탄다. 밑동에만 있으면 속옷처럼 보인다.
  for (const side of [-1, 1]) {
    const edge = cx + (side * w) / 2
    // 겨드랑이에서 시작해 밑단으로 갈수록 넓어지는 폭.
    const head = kit.panel.style === 'sash' ? 0.05 : 0.11
    const foot = kit.panel.style === 'sash' ? 0.24 : 0.15

    ctx.beginPath()
    ctx.moveTo(edge, top)
    ctx.lineTo(edge, bottom)
    ctx.lineTo(cx + side * w * (0.5 - foot), bottom)
    // 조절점을 아래쪽(0.62)에 두어야 넓어지는 게 밑단 가까이에서만 일어난다.
    // 가운데에 두면 가슴부터 넓어져서 옷이 아니라 조끼처럼 보인다.
    ctx.quadraticCurveTo(
      cx + side * w * (0.5 - head * 1.4),
      top + h * 0.62,
      cx + side * w * (0.5 - head),
      top,
    )
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/**
 * 목 트림. 어깨 곡선을 따라 도는 얇은 호라서 가로 띠로는 절대 안 나온다.
 * 어깨선 **위쪽**에 중심을 두고 아래로 볼록한 반원만 남겨 목둘레가 되게 한다 —
 * 중심을 어깨선에 두면 호가 통째로 잘려 나가 아무것도 안 보인다.
 */
function drawCollar(ctx, pose, kit) {
  const { neck, w } = torsoBox(pose)
  const cy = neck.y - neck.r * 0.55

  ctx.save()
  jerseyPath(ctx, pose.torsoBone)
  ctx.clip()
  ctx.lineCap = 'butt'
  kit.trim.forEach((color, i) => {
    ctx.strokeStyle = color
    ctx.lineWidth = w * 0.09
    ctx.beginPath()
    ctx.arc(neck.x, cy, neck.r * (0.92 - i * 0.2), 0, Math.PI)
    ctx.stroke()
  })
  ctx.restore()
}

/** 소매 끝동. 반팔 끝을 한 바퀴 두르는 선이라 소매 색 위에 짧게 얹는다. */
function drawCuff(ctx, pose, kit) {
  const [ax, ay, bx, by, w] = pose.sleeveBone

  ctx.save()
  ctx.lineCap = 'butt'
  kit.trim.forEach((color, i) => {
    const end = SLEEVE_FRAC - i * 0.1
    const start = end - 0.09
    ctx.strokeStyle = color
    ctx.lineWidth = w * TRIM
    ctx.beginPath()
    ctx.moveTo(ax + (bx - ax) * start, ay + (by - ay) * start)
    ctx.lineTo(ax + (bx - ax) * end, ay + (by - ay) * end)
    ctx.stroke()
  })
  ctx.restore()
}

/** 흰 긴바지. 엉덩이에서 발목까지 덮는다. */
function drawPants(ctx, pose) {
  ctx.save()
  for (const leg of pose.legBones) partial(ctx, leg, PANTS_FRAC, PANTS)
  ctx.restore()
}

/**
 * 벨트. 없으면 상의와 바지가 한 덩어리로 붙어 원피스처럼 보인다 —
 * 어두운 선 한 줄이 허리를 끊어 줘야 위아래가 따로 읽힌다.
 */
function drawBelt(ctx, pose) {
  const [, , bx, by, w] = pose.torsoBone

  ctx.save()
  // 둥근 끝을 그대로 두면 몸통보다 넓게 삐져나온다.
  ctx.lineCap = 'butt'
  ctx.strokeStyle = '#101013'
  ctx.lineWidth = w * 0.18
  ctx.beginPath()
  ctx.moveTo(bx - w * 0.5, by + w * 0.5)
  ctx.lineTo(bx + w * 0.5, by + w * 0.5)
  ctx.stroke()
  ctx.restore()
}

/** 소매. 팔이 통째로 검으면 상의가 조끼처럼 보인다 — 윗팔을 상의 바탕색으로 덮는다. */
function drawSleeve(ctx, pose, kit) {
  ctx.save()
  partial(ctx, pose.sleeveBone, SLEEVE_FRAC, jerseyBase(kit))
  ctx.restore()
}

/**
 * 타자 헬멧. 모자보다 크라운이 크고 귀덮개가 붙는다 —
 * 이 한 덩어리가 타자와 투수를 갈라 준다.
 */
function drawHelmet(ctx, pose, kit) {
  const [hx, hy, r] = pose.head

  ctx.save()
  ctx.fillStyle = kit.cap.crown
  // 크라운은 모자보다 아래까지 내려오고, 귀덮개가 뒤쪽(로컬 +x)에 붙는다.
  ctx.beginPath()
  ctx.arc(hx, hy, r * 1.02, Math.PI, Math.PI * 2)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(hx + r * 0.3, hy + r * 0.1, r * 0.72, r * 0.55, 0, 0, Math.PI * 2)
  ctx.fill()

  // 헬멧 챙은 모자보다 짧고 뭉툭하다 — 모자만큼 뽑으면 새 부리처럼 튀어나온다.
  ctx.fillStyle = kit.cap.bill
  ctx.beginPath()
  ctx.ellipse(hx - r * 0.66, hy + r * 0.02, r * 0.6, r * 0.2, 0, 0, Math.PI * 2)
  ctx.fill()

  if (kit.cap.mark) drawCapMark(ctx, pose, kit)
  ctx.restore()
}

/**
 * 투수 모자. 머리 위 절반을 크라운이 덮고, 챙은 로컬 -x 로 뻗는다 —
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

  if (kit.cap.mark) drawCapMark(ctx, pose, kit)
  ctx.restore()
}
