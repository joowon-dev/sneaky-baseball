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
import { recoveryCode, parseRecoveryCode } from '../game/sync.js'
import {
  PERIODS, teamRanking, playerRanking, myStanding, setNickname, verifyCode,
} from '../net/ranking.js'

const WALLET_KEY = 'sneaky-baseball:wallet'

const pointsEl = document.getElementById('points')
const cheerEl = document.getElementById('cheer')
const batsEl = document.getElementById('bats')

let wallet = createWallet()
let kit = null
// 랭킹 신분. 아직 한 번도 안 올렸으면 null 이다 — 안 치는 사람은 서버에 흔적조차 없다.
let account = null
let period = 'day'
let loadingRank = false

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
  if (next?.account?.playerId) account = next.account
  render()
  renderAccount()
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

// ── 랭킹 ────────────────────────────────────────────────────────────────────
//
// 서버가 하는 일은 집계뿐이다. 여기서는 기간을 골라 두 표를 받아 그린다.
// 실패는 화면에 한 줄로만 말한다 — 랭킹이 안 되는 것과 상점이 안 되는 것은 다른 일이다.

const rankEl = document.getElementById('rank')
const batsView = document.getElementById('bats')
const periodsEl = document.getElementById('periods')
const teamRankEl = document.getElementById('team-rank')
const playerRankEl = document.getElementById('player-rank')
const myStandingEl = document.getElementById('my-standing')
const nicknameEl = document.getElementById('nickname')
const nicknameMsgEl = document.getElementById('nickname-msg')
const codeEl = document.getElementById('code')
const restoreEl = document.getElementById('restore')
const restoreMsgEl = document.getElementById('restore-msg')

function showView(name) {
  const bats = name === 'bats'
  batsView.hidden = !bats
  rankEl.hidden = bats
  for (const button of document.querySelectorAll('#tabs button')) {
    button.classList.toggle('on', button.dataset.view === name)
  }
  if (!bats) loadRanking()
}

document.getElementById('tabs').addEventListener('click', (event) => {
  const view = event.target.dataset?.view
  if (view) showView(view)
})

function renderPeriods() {
  periodsEl.replaceChildren(...PERIODS.map(({ key, label }) => {
    const el = document.createElement('button')
    el.type = 'button'
    el.textContent = label
    el.className = key === period ? 'on' : ''
    el.addEventListener('click', () => {
      period = key
      renderPeriods()
      loadRanking()
    })
    return el
  }))
}

function row(no, name, points, mine = false) {
  const li = document.createElement('li')
  if (mine) li.className = 'me'
  const rank = document.createElement('span')
  rank.className = 'no'
  rank.textContent = no
  const who = document.createElement('span')
  who.textContent = name
  const pt = document.createElement('span')
  pt.className = 'pt'
  pt.textContent = `${won(points)}P`
  li.append(rank, who, pt)
  return li
}

function emptyRow(text) {
  const li = document.createElement('li')
  const span = document.createElement('span')
  span.className = 'empty'
  span.textContent = text
  li.append(span)
  return li
}

async function loadRanking() {
  if (loadingRank) return
  loadingRank = true
  teamRankEl.replaceChildren(emptyRow('불러오는 중…'))
  playerRankEl.replaceChildren(emptyRow('불러오는 중…'))

  try {
    const [teams, players, mine] = await Promise.all([
      teamRanking(period),
      playerRanking(period, 20),
      account ? myStanding(account.playerId, period) : Promise.resolve(null),
    ])

    teamRankEl.replaceChildren(...(teams?.length
      ? teams.map((t, i) => row(i + 1, teamName(t.team), t.points))
      : [emptyRow('아직 아무도 안 쳤습니다')]))

    playerRankEl.replaceChildren(...(players?.length
      ? players.map((p) => row(p.rank, p.nickname, p.points, p.player_id === account?.playerId))
      : [emptyRow('아직 아무도 안 쳤습니다')]))

    const standing = mine?.[0]
    myStandingEl.textContent = standing && standing.rank > 0
      ? `내 자리 — ${standing.rank}위 / ${standing.total_players}명 · ${won(standing.points)}P`
      : '아직 이 기간에 올린 응원이 없습니다.'
  } catch {
    teamRankEl.replaceChildren(emptyRow('랭킹을 못 불러왔습니다'))
    playerRankEl.replaceChildren(emptyRow('잠시 뒤 다시 열어 주세요'))
    myStandingEl.textContent = ''
  } finally {
    loadingRank = false
  }
}

function renderAccount() {
  nicknameEl.value = account?.nickname ?? ''
  codeEl.textContent = account
    ? recoveryCode(account.playerId, account.secret)
    : '아직 랭킹에 오르지 않았습니다 — 안타를 치면 5분 안에 올라갑니다'
}

function say(el, text, bad = false) {
  el.textContent = text
  el.className = bad ? 'msg bad' : 'msg'
}

document.getElementById('save-nickname').addEventListener('click', async () => {
  if (!account) {
    say(nicknameMsgEl, '안타를 한 번 치고 나면 이름을 정할 수 있습니다', true)
    return
  }
  const name = nicknameEl.value.trim()
  try {
    await setNickname(account.playerId, account.secret, name)
    account = { ...account, nickname: name }
    window.sneaky?.saveAccount?.(account)
    say(nicknameMsgEl, '바꿨습니다')
    loadRanking()
  } catch (error) {
    const reason = String(error)
    say(nicknameMsgEl, reason.includes('nickname_taken') ? '이미 있는 이름입니다'
      : reason.includes('invalid_nickname') ? '한글·영문·숫자 12자까지'
        : '바꾸지 못했습니다', true)
  }
})

document.getElementById('do-restore').addEventListener('click', async () => {
  const parsed = parseRecoveryCode(restoreEl.value)
  if (!parsed) {
    say(restoreMsgEl, '코드 모양이 아닙니다', true)
    return
  }
  try {
    // 코드가 맞는지만 물어본다. 맞아도 서버에는 아무 일도 안 일어난다.
    const ok = await verifyCode(parsed.playerId, parsed.secret)
    if (!ok) throw new Error('bad code')
    account = { ...parsed, nickname: '' }
    // 줄에 선 타구는 그대로 둔다 — 진짜로 친 것이니 이 이름으로 올라가면 된다.
    window.sneaky?.saveAccount?.(account)
    restoreEl.value = ''
    say(restoreMsgEl, '이어받았습니다. 이제부터 친 것이 이 이름으로 올라갑니다')
    renderAccount()
    loadRanking()
  } catch {
    say(restoreMsgEl, '맞지 않는 코드입니다', true)
  }
})

renderPeriods()

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
