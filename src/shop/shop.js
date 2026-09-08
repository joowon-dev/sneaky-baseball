// 상점 창. 오버레이가 아니라 보통 창이라 마우스를 그대로 받는다.
//
// **셸이 원장이다.** 여기서는 순수 모듈로 「살 수 있는가」를 따져 보고, 살 수 있으면
// 키와 값을 셸에 보낸다. 셸은 더하고 빼기만 하고, 바뀐 결과를 두 창에 도로 밀어 넣는다.
// 가격표를 셸에 두면 Swift·C#·JS 세 벌이 되어 언젠가 어긋난다.

import { BATS } from '../game/gear.js'
import { createWallet, canBuy, buy, equip, cheerRanking } from '../game/wallet.js'
import { battedFlight, meters, LAUNCH_DY } from '../game/batted.js'
import { HIT } from '../game/judge.js'
import { drawFigure, batterStance } from '../render/sprites.js'
import { kitOf, TEAMS } from '../render/teams.js'

const WALLET_KEY = 'sneaky-baseball:wallet'

const pointsEl = document.getElementById('points')
const cheerEl = document.getElementById('cheer')
const batsEl = document.getElementById('bats')

let wallet = createWallet()
let kit = null

const teamName = (id) => TEAMS.find((t) => t.id === id)?.name ?? id
const won = (n) => n.toLocaleString('en-US')

/** 퍼펙트 타이밍으로 맞혔을 때 이 배트가 보내는 거리. 배수만 적어 두면 감이 안 온다. */
function perfectMeters(bat) {
  return meters(battedFlight(HIT, 0, 0, LAUNCH_DY, bat.powerMul))
}

function render() {
  pointsEl.textContent = won(wallet.points)
  renderCheer()
  renderBats()
}

function renderCheer() {
  const rank = cheerRanking(wallet).slice(0, 3)
  cheerEl.replaceChildren(...(rank.length
    ? rank.map(({ team, points }) => {
      const li = document.createElement('li')
      const b = document.createElement('b')
      b.textContent = teamName(team)
      li.append(b, ` ${won(points)}P`)
      return li
    })
    : [Object.assign(document.createElement('li'), {
      className: 'none',
      textContent: '유니폼을 입고 치면 그 구단에 쌓입니다',
    })]))
}

function renderBats() {
  batsEl.replaceChildren(...BATS.map(card))
}

function card(bat) {
  const owned = wallet.owned.includes(bat.key)
  const equipped = wallet.equipped === bat.key

  const el = document.createElement('article')
  el.className = equipped ? 'bat equipped' : 'bat'

  const canvas = document.createElement('canvas')
  el.append(canvas, heading(bat), stats(bat), button(bat, owned, equipped))
  // 캔버스는 붙인 뒤에 그린다 — 붙기 전에는 clientWidth 가 0이라 배율을 못 잡는다.
  queueMicrotask(() => preview(canvas, bat))
  return el
}

function heading(bat) {
  const box = document.createDocumentFragment()
  const h = document.createElement('h2')
  h.textContent = bat.name
  const note = document.createElement('p')
  note.className = 'note'
  note.textContent = bat.note
  box.append(h, note)
  return box
}

function stats(bat) {
  const dl = document.createElement('dl')
  const row = (label, value) => {
    const dt = document.createElement('dt')
    dt.textContent = label
    const dd = document.createElement('dd')
    dd.textContent = value
    dl.append(dt, dd)
  }
  row('힘', `×${bat.powerMul.toFixed(2)}`)
  row('퍼펙트', `${perfectMeters(bat)}m`)
  row('값', bat.price === 0 ? '기본' : `${won(bat.price)}P`)
  return dl
}

function button(bat, owned, equipped) {
  const el = document.createElement('button')

  if (equipped) {
    el.textContent = '끼는 중'
    el.disabled = true
    return el
  }
  if (owned) {
    el.textContent = '끼우기'
    el.className = 'own'
    el.addEventListener('click', () => doEquip(bat.key))
    return el
  }

  const affordable = canBuy(wallet, bat.key)
  el.textContent = affordable ? '사기' : `${won(bat.price - wallet.points)}P 모자람`
  el.disabled = !affordable
  if (affordable) el.addEventListener('click', () => doBuy(bat))
  return el
}

/** 게임과 **같은 코드로** 타자를 그린다 — 상점에서 본 그 배트가 타석에서도 그 배트다. */
function preview(canvas, bat) {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth || 96
  const h = canvas.clientHeight || 118
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)

  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#101013'
  ctx.strokeStyle = '#101013'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // 타자는 오른쪽(투수)을 본다 — 게임과 같은 좌우 반전.
  // **키를 판보다 작게 잡는다** — 세워 든 배트 끝이 머리 위 0.14만큼 더 올라가서,
  // 판 높이를 그대로 키로 쓰면 배럴이 잘린다. 사려는 물건이 잘리면 안 된다.
  drawFigure(ctx, batterStance, w * 0.52, h - 8, (h - 12) / 1.2, -1, 0, kit, bat)
}

// ── 셸과 주고받기 ──────────────────────────────────────────────────────────

function setWallet(next) {
  wallet = createWallet(next)
  render()
}

function doBuy(bat) {
  const { wallet: next, bought } = buy(wallet, bat.key)
  if (!bought) return
  // 화면은 바로 바꾸고, 원장은 셸이 고친다. 되돌아오는 값이 정본이다.
  setWallet(next)
  if (window.sneaky?.buyBat) window.sneaky.buyBat({ key: bat.key, price: bat.price })
  else save()
}

function doEquip(key) {
  setWallet(equip(wallet, key))
  if (window.sneaky?.equipBat) window.sneaky.equipBat(key)
  else save()
}

function save() {
  try {
    localStorage.setItem(WALLET_KEY, JSON.stringify(wallet))
  } catch {
    // 저장에 실패해도 상점은 열린다.
  }
}

function boot() {
  if (window.sneaky) {
    kit = kitOf(window.sneaky.kits?.batter)
    setWallet(window.sneaky.gear ?? {})
    // 게임 창에서 번 포인트가 열려 있는 상점에 바로 보인다.
    window.sneaky.onGear?.(setWallet)
    window.sneaky.onKit?.((who, key) => {
      if (who !== 'batter') return
      kit = kitOf(key)
      renderBats()
    })
    return
  }

  // 브라우저로 열었을 때(개발 확인용). 유니폼은 쿼리 파라미터로 본다.
  const params = new URLSearchParams(location.search)
  kit = kitOf(params.get('batter'))
  try {
    setWallet(JSON.parse(localStorage.getItem(WALLET_KEY)) ?? {})
  } catch {
    setWallet({})
  }
}

boot()
