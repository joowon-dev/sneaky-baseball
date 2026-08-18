// 모자 앞면 글자. 구단 로고는 글자 모양이지만 **어떤 폰트에도 없는 모양**이라 —
// KIA는 오른쪽으로 얇아지는 쐐기 T, LG는 꼬리가 길게 흐르는 곡선 T, 두산은 물방울 D,
// kt는 각진 모노그램 — 폰트로 찍으면 열 구단이 다 같은 T·D·K 로 나온다. 그래서 손으로 그린다.
//
// 모든 글자는 **원점을 중심으로 한 1×1 상자** 안에 그린다(x·y 모두 -0.5 ~ 0.5).
// 크기와 위치는 부르는 쪽이 변환으로 정한다.
//
// 상품 사진을 보고 옮긴 모양이고, 로고 이미지를 가져다 쓰는 게 아니다.

/** 테두리를 먼저 두르고 안을 채운다. 테두리는 글자 밖으로만 남아야 해서 굵게 긋고 덮는다. */
function paint(ctx, { color, outline }) {
  if (outline) {
    ctx.strokeStyle = outline
    ctx.lineWidth = 0.16
    ctx.lineJoin = 'round'
    ctx.stroke()
  }
  ctx.fillStyle = color
  ctx.fill('evenodd')
}

function poly(ctx, points) {
  ctx.beginPath()
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
}

/** KIA. 가로대가 오른쪽으로 갈수록 얇아지며 끝이 치켜 올라가고, 기둥은 왼쪽으로 기울며 뾰족하게 끝난다. */
function wedgeT(ctx, ink) {
  poly(ctx, [
    [-0.50, -0.30], [0.50, -0.44], [0.50, -0.34], [0.10, -0.12],
    [0.04, 0.32], [-0.06, 0.50], [-0.22, 0.42], [-0.16, -0.10], [-0.50, -0.02],
  ])
  paint(ctx, ink)
}

/** LG. 가로대 오른쪽 끝이 아래로 길게 흘러내리고 왼쪽 끝은 짧게 말려 든다. 기둥은 곧다. */
function curlT(ctx, ink) {
  ctx.beginPath()
  ctx.moveTo(-0.42, -0.42)
  ctx.lineTo(0.40, -0.42)
  // 오른쪽 꼬리. 바깥은 크게 흘러내리고 안쪽은 짧게 되돌아와 갈고리가 된다.
  ctx.quadraticCurveTo(0.52, 0.08, 0.18, 0.22)
  ctx.quadraticCurveTo(0.34, -0.02, 0.12, -0.14)
  ctx.lineTo(0.12, 0.46)
  ctx.lineTo(-0.12, 0.46)
  ctx.lineTo(-0.12, -0.14)
  ctx.quadraticCurveTo(-0.34, -0.10, -0.32, 0.06)
  ctx.quadraticCurveTo(-0.48, -0.10, -0.42, -0.42)
  ctx.closePath()
  paint(ctx, ink)
}

/** 삼성. 각진 L 위에 S 리본이 걸쳐 있다. */
function slMonogram(ctx, ink) {
  // L 은 오른쪽 아래에 놓인다 — S 가 왼쪽 위를 차지해야 둘이 겹쳐 보인다.
  poly(ctx, [[-0.04, -0.28], [0.18, -0.34], [0.18, 0.18], [0.48, 0.18], [0.48, 0.44], [-0.04, 0.44]])
  paint(ctx, ink)

  ctx.beginPath()
  ctx.moveTo(0.18, -0.42)
  ctx.quadraticCurveTo(-0.22, -0.52, -0.24, -0.28)
  ctx.quadraticCurveTo(-0.24, -0.12, -0.02, -0.10)
  ctx.quadraticCurveTo(0.14, -0.06, 0.00, 0.06)
  ctx.quadraticCurveTo(-0.12, 0.14, -0.32, 0.06)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (ink.outline) {
    ctx.strokeStyle = ink.outline
    ctx.lineWidth = 0.28
    ctx.stroke()
  }
  ctx.strokeStyle = ink.color
  ctx.lineWidth = 0.15
  ctx.stroke()
}

/** 두산. 위는 둥글고 아래로 갈수록 뾰족해지는 물방울 D. */
function dropD(ctx, ink) {
  ctx.beginPath()
  ctx.moveTo(-0.08, -0.46)
  ctx.quadraticCurveTo(0.44, -0.40, 0.38, -0.02)
  ctx.quadraticCurveTo(0.30, 0.30, -0.26, 0.50)
  ctx.lineTo(-0.36, 0.40)
  ctx.quadraticCurveTo(-0.18, 0.08, -0.24, -0.20)
  ctx.quadraticCurveTo(-0.30, -0.42, -0.08, -0.46)
  ctx.closePath()
  // 속을 뚫는다. evenodd 라 반대로 돌 필요가 없다.
  ctx.moveTo(0.16, -0.14)
  ctx.quadraticCurveTo(0.16, -0.30, -0.02, -0.28)
  ctx.quadraticCurveTo(-0.12, -0.24, -0.06, -0.02)
  ctx.quadraticCurveTo(0.10, 0.02, 0.16, -0.14)
  paint(ctx, ink)
}

/** kt. 위아래 끝이 뾰족하게 깎인 각진 K 모노그램. */
function sharpK(ctx, ink) {
  poly(ctx, [
    [-0.36, -0.28], [-0.24, -0.44], [-0.12, -0.28], [-0.12, -0.10],
    [0.14, -0.44], [0.40, -0.44], [0.06, -0.02],
    [0.40, 0.44], [0.14, 0.44], [-0.12, 0.08], [-0.12, 0.28],
    [-0.24, 0.44], [-0.36, 0.28],
  ])
  paint(ctx, ink)
}

/** 키움. 팔이 쐐기처럼 벌어지는 날카로운 K. */
function bladeK(ctx, ink) {
  poly(ctx, [
    [-0.32, -0.44], [-0.10, -0.44], [-0.10, -0.10], [0.20, -0.44], [0.46, -0.44],
    [0.30, -0.18], [0.06, -0.02], [0.28, 0.16], [0.48, 0.44], [0.20, 0.44],
    [-0.10, 0.06], [-0.10, 0.44], [-0.32, 0.44],
  ])
  paint(ctx, ink)
}

/** SSG. 각진 L 의 안쪽에 네 갈래 별이 걸린다. 별은 금색이라 따로 칠한다. */
function starL(ctx, ink) {
  poly(ctx, [[-0.30, -0.46], [-0.08, -0.46], [-0.08, 0.20], [0.30, 0.20], [0.30, 0.44], [-0.30, 0.44]])
  paint(ctx, ink)

  poly(ctx, [
    [0.14, -0.06], [0.21, 0.13], [0.48, 0.20], [0.21, 0.27],
    [0.14, 0.48], [0.07, 0.27], [-0.20, 0.20], [0.07, 0.13],
  ])
  paint(ctx, { color: ink.accent ?? ink.color })
}

/**
 * 롯데. 직선으로만 꺾어 만든 G. 가로대가 오른쪽으로 길게 뻗는다.
 * 채우면 너무 뭉툭해진다 — 사진처럼 획이 가늘어야 해서 선으로 긋는다.
 */
function blockG(ctx, ink) {
  const bar = [[0.36, -0.34], [-0.06, -0.34], [-0.26, -0.16], [-0.26, 0.16], [-0.06, 0.34], [0.18, 0.34], [0.18, 0.04], [0.00, 0.04]]

  ctx.lineJoin = 'miter'
  ctx.lineCap = 'butt'
  for (const pass of ink.outline ? ['outline', 'color'] : ['color']) {
    ctx.strokeStyle = ink[pass]
    ctx.lineWidth = pass === 'outline' ? 0.29 : 0.17
    ctx.beginPath()
    bar.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.stroke()
    // 가로대는 G 몸통보다 오른쪽으로 더 뻗어 나간다.
    ctx.beginPath()
    ctx.moveTo(0.00, 0.04)
    ctx.lineTo(0.00, 0.36)
    ctx.stroke()
  }
}

/** 한화. 붓으로 쓴 듯 획 끝이 둥근 E. 채우는 게 아니라 획으로 긋는다. */
function scriptE(ctx, ink) {
  const strokes = [
    [[-0.06, -0.38], [-0.14, 0.00], [-0.10, 0.36]],
    [[-0.10, -0.40], [0.14, -0.46], [0.34, -0.38]],
    [[-0.12, -0.02], [0.06, -0.06], [0.18, -0.02]],
    [[-0.10, 0.36], [0.12, 0.44], [0.34, 0.34]],
  ]
  ctx.lineCap = 'round'
  for (const pass of ink.outline ? ['outline', 'color'] : ['color']) {
    ctx.strokeStyle = ink[pass]
    ctx.lineWidth = pass === 'outline' ? 0.28 : 0.15
    for (const [a, c, b] of strokes) {
      ctx.beginPath()
      ctx.moveTo(a[0], a[1])
      ctx.quadraticCurveTo(c[0], c[1], b[0], b[1])
      ctx.stroke()
    }
  }
}

/** NC. 왼쪽은 각지고 오른쪽만 둥근 두꺼운 D. */
function roundD(ctx, ink) {
  ctx.beginPath()
  ctx.moveTo(-0.34, -0.42)
  ctx.lineTo(0.04, -0.42)
  ctx.quadraticCurveTo(0.40, -0.40, 0.40, 0.00)
  ctx.quadraticCurveTo(0.40, 0.40, 0.04, 0.42)
  ctx.lineTo(-0.34, 0.42)
  ctx.closePath()

  ctx.moveTo(-0.12, -0.20)
  ctx.lineTo(0.02, -0.20)
  ctx.quadraticCurveTo(0.18, -0.18, 0.18, 0.00)
  ctx.quadraticCurveTo(0.18, 0.18, 0.02, 0.20)
  ctx.lineTo(-0.12, 0.20)
  ctx.closePath()
  paint(ctx, ink)
}

/**
 * 모자 글자표. 키는 `teams.js` 의 `cap.glyph` 가 쓴다.
 * 없는 키면 부르는 쪽이 글자 찍기로 돌아간다.
 */
export const CAP_GLYPHS = {
  'wedge-t': wedgeT,
  'curl-t': curlT,
  'sl': slMonogram,
  'drop-d': dropD,
  'sharp-k': sharpK,
  'blade-k': bladeK,
  'star-l': starL,
  'block-g': blockG,
  'script-e': scriptE,
  'round-d': roundD,
}
