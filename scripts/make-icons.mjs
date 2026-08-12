// 앱·트레이 아이콘 PNG를 그린다. 외부 의존성 없이 직접 픽셀을 찍고 PNG로 인코딩한다.
//   node scripts/make-icons.mjs
// 결과: build/icon.png (앱 아이콘 — electron-builder가 icns·ico로 변환),
//       build/tray.png, build/tray@2x.png (트레이 — 윈도우·리눅스에서 쓴다)
//
// 그림은 게임과 같은 톤이다. 밝은 종이 바탕에 검은 공 하나, 흰 실밥 두 줄.

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')

const PAPER = [246, 246, 242]
const INK = [16, 16, 19]
const SEAM = [246, 246, 242]

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(body))
  return Buffer.concat([head, body, tail])
}

/** RGBA 픽셀 배열(Uint8Array, size*size*4)을 PNG 버퍼로. */
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  // 각 줄 앞에 필터 바이트 0을 붙인다.
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0
    rgba.subarray(y * size * 4, (y + 1) * size * 4).forEach((v, i) => {
      raw[y * (size * 4 + 1) + 1 + i] = v
    })
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

/**
 * 아이콘 한 장. rounded는 바탕 있는 앱 아이콘, 아니면 배경 없는 트레이용.
 * 가장자리는 거리값으로 부드럽게 깎는다(안티에일리어싱).
 */
function drawIcon(size, { rounded }) {
  const px = new Uint8Array(size * size * 4)
  const c = size / 2
  const ballR = size * (rounded ? 0.3 : 0.42)
  const radius = size * 0.22 // 바탕 모서리
  const edge = Math.max(1, size / 64) // 부드럽게 깎는 폭

  // 실밥 두 줄. 중심을 공 바깥 멀리 두어야 가운데서 교차하지 않고
  // 좌우로 완만하게 휜다 — 야구공은 그렇게 생겼다.
  const seams = [
    { cx: c - ballR * 1.9, r: ballR * 1.5 },
    { cx: c + ballR * 1.9, r: ballR * 1.5 },
  ]
  const seamW = Math.max(1, size * (rounded ? 0.022 : 0.03))

  const put = (x, y, color, alpha) => {
    if (alpha <= 0) return
    const i = (y * size + x) * 4
    const a = px[i + 3] / 255
    const out = alpha + a * (1 - alpha)
    for (let k = 0; k < 3; k += 1) {
      px[i + k] = Math.round((color[k] * alpha + px[i + k] * a * (1 - alpha)) / out)
    }
    px[i + 3] = Math.round(out * 255)
  }

  // 거리 d가 0 이하이면 안, edge만큼 넘어가면 완전히 밖.
  const cover = (d) => Math.min(1, Math.max(0, 0.5 - d / edge))

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px0 = x + 0.5
      const py0 = y + 0.5

      if (rounded) {
        // 둥근 사각형 바탕: 모서리 안쪽으로 들어온 만큼만 원호로 처리한다.
        const qx = Math.max(Math.abs(px0 - c) - (c - radius), 0)
        const qy = Math.max(Math.abs(py0 - c) - (c - radius), 0)
        put(x, y, PAPER, cover(Math.hypot(qx, qy) - radius))
      }

      const dBall = Math.hypot(px0 - c, py0 - c) - ballR
      put(x, y, INK, cover(dBall))

      // 실밥은 공 안에서만 보인다.
      if (dBall < -seamW * 0.5) {
        for (const seam of seams) {
          const d = Math.abs(Math.hypot(px0 - seam.cx, py0 - c) - seam.r) - seamW * 0.5
          put(x, y, SEAM, cover(d) * (rounded ? 1 : 0.9))
        }
      }
    }
  }

  // 트레이 아이콘은 배경이 없으니 어두운 메뉴바에서도 보이게 살짝 밝힌다.
  if (!rounded) {
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue
      const lifted = mix([px[i], px[i + 1], px[i + 2]], [80, 80, 86], 0.15)
      px[i] = lifted[0]
      px[i + 1] = lifted[1]
      px[i + 2] = lifted[2]
    }
  }

  return encodePng(size, px)
}

/**
 * 윈도우용 .ico. 컨테이너 안에 크기별 PNG를 그대로 담는다(Vista 이후 지원).
 * 헤더 6바이트 + 크기당 16바이트 디렉터리 + PNG 본문.
 */
function encodeIco(entries) {
  const dir = Buffer.alloc(6 + entries.length * 16)
  dir.writeUInt16LE(0, 0) // reserved
  dir.writeUInt16LE(1, 2) // type: 아이콘
  dir.writeUInt16LE(entries.length, 4)

  let offset = dir.length
  entries.forEach(({ size, png }, i) => {
    const at = 6 + i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, at) // 256은 0으로 적는다
    dir.writeUInt8(size >= 256 ? 0 : size, at + 1)
    dir.writeUInt8(0, at + 2) // 팔레트 없음
    dir.writeUInt8(0, at + 3)
    dir.writeUInt16LE(1, at + 4) // planes
    dir.writeUInt16LE(32, at + 6) // 32비트
    dir.writeUInt32LE(png.length, at + 8)
    dir.writeUInt32LE(offset, at + 12)
    offset += png.length
  })

  return Buffer.concat([dir, ...entries.map((e) => e.png)])
}

mkdirSync(OUT, { recursive: true })

const files = [
  ['icon.png', 1024, { rounded: true }],
  ['tray.png', 16, { rounded: false }],
  ['tray@2x.png', 32, { rounded: false }],
]

for (const [name, size, options] of files) {
  writeFileSync(join(OUT, name), drawIcon(size, options))
  console.log(`build/${name} (${size}×${size})`)
}

const icoSizes = [16, 32, 48, 64, 128, 256]
const ico = encodeIco(icoSizes.map((size) => ({ size, png: drawIcon(size, { rounded: true }) })))
writeFileSync(join(OUT, '..', 'windows', 'icon.ico'), ico)
console.log(`windows/icon.ico (${icoSizes.join(', ')})`)
