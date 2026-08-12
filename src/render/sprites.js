// 검은 실루엣 포즈. 각 포즈는 키 1.0 = 발끝(y≈0)에서 머리끝(y≈-1)인 단위 공간에 그린다.

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
    pose(ctx)
    pose(ctx)
    ctx.shadowBlur = 0
  }

  pose(ctx)
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
export function batterStance(ctx) {
  blob(ctx, 0.02, -0.86, 0.1)
  bone(ctx, 0, -0.74, 0.02, -0.44, 0.17)
  bone(ctx, 0.02, -0.44, -0.13, -0.02, 0.1)
  bone(ctx, 0.02, -0.44, 0.16, -0.02, 0.1)
  bone(ctx, 0, -0.7, 0.16, -0.6, 0.08)
  bone(ctx, 0.16, -0.6, 0.2, -0.78, 0.08)
  bone(ctx, 0.2, -0.78, 0.36, -1.14, 0.055)
}

/** 스윙 완료. 배트를 앞으로 뻗어 돌린 자세. */
export function batterSwing(ctx) {
  blob(ctx, -0.02, -0.86, 0.1)
  bone(ctx, 0, -0.74, -0.02, -0.44, 0.17)
  bone(ctx, -0.02, -0.44, -0.2, -0.02, 0.1)
  bone(ctx, -0.02, -0.44, 0.16, -0.05, 0.1)
  bone(ctx, 0, -0.7, -0.26, -0.6, 0.08)
  bone(ctx, -0.26, -0.6, -0.66, -0.68, 0.055)
}

/** 세트 포지션. 두 손을 가슴 앞에 모으고 공을 감춘 자세. */
export function pitcherWindup(ctx) {
  blob(ctx, 0, -0.84, 0.11)
  bone(ctx, 0, -0.72, 0, -0.42, 0.17)
  bone(ctx, 0, -0.42, -0.09, -0.02, 0.1)
  bone(ctx, 0, -0.42, 0.11, -0.02, 0.1)
  bone(ctx, 0.02, -0.68, -0.14, -0.6, 0.08)
  blob(ctx, -0.16, -0.58, 0.07)
}

/** 릴리스. 앞으로 내딛으며 던지는 팔을 뻗은 자세. */
export function pitcherRelease(ctx) {
  blob(ctx, -0.05, -0.8, 0.11)
  bone(ctx, 0.02, -0.68, -0.02, -0.4, 0.17)
  bone(ctx, -0.02, -0.4, -0.26, -0.02, 0.1)
  bone(ctx, -0.02, -0.4, 0.2, -0.06, 0.1)
  bone(ctx, 0.02, -0.66, -0.14, -0.76, 0.08)
  bone(ctx, -0.14, -0.76, -0.34, -0.66, 0.08)
}

/** 포수. 쪼그려 앉아 미트를 내민 자세. */
export function catcherCrouch(ctx) {
  blob(ctx, 0.1, -0.82, 0.13)
  bone(ctx, 0.04, -0.66, -0.06, -0.36, 0.2)
  bone(ctx, -0.06, -0.36, 0.24, -0.3, 0.12)
  bone(ctx, 0.24, -0.3, 0.26, -0.02, 0.12)
  bone(ctx, -0.06, -0.36, -0.28, -0.2, 0.12)
  bone(ctx, -0.28, -0.2, -0.1, -0.02, 0.12)
  bone(ctx, 0.02, -0.62, -0.28, -0.5, 0.09)
  blob(ctx, -0.36, -0.48, 0.12)
}
