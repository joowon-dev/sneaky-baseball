const path = require('node:path')
const {
  app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, screen,
} = require('electron')
const { GlobalKeyboardListener } = require('node-global-key-listener')
const store = require('./store')

// 클릭이 통과되는 오버레이는 포커스를 못 받아서 일반 키 입력이 오지 않는다.
// 그래서 스윙도 전역 단축키로 받는다. 그냥 Space를 잡으면 모든 앱에서 스페이스를 뺏는다.
const SWING_SHORTCUT = 'Alt+Space'
const SWING_LABEL = '⌥Space'
const TOGGLE_SHORTCUT = 'CommandOrControl+Shift+B'

// ⌥을 누르고 있는 동안만 투수가 던진다. globalShortcut은 조합키만 잡고 수식키의
// 눌림/뗌은 못 보기 때문에, 이것만 네이티브 키 감시로 따로 듣는다.
const HOLD_KEYS = ['LEFT ALT', 'RIGHT ALT']

let win = null
let tray = null
let keyWatch = null
let holding = false

function createWindow() {
  // 작업 영역만 덮는다 — 메뉴바와 Dock 자리는 비워둔다.
  const { workArea } = screen.getPrimaryDisplay()

  win = new BrowserWindow({
    ...workArea,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // 포커스를 절대 가져가지 않는다. 밑에서 하던 일이 끊기면 안 된다.
    focusable: false,
    title: 'Sneaky Baseball',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 포커스가 없어도 애니메이션이 멈추지 않게.
      backgroundThrottling: false,
    },
  })

  // 마우스는 전부 밑의 앱으로 흘려보낸다.
  win.setIgnoreMouseEvents(true)
  // 전체화면으로 쓰는 앱 위에도, 어느 데스크톱에서도 뜬다.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreenWindows: true })

  if (process.env.SNEAKY_DEBUG) {
    win.webContents.on('console-message', (_event, _level, message, line, source) => {
      console.log(`[renderer] ${message} (${source}:${line})`)
    })
  }

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  win.on('closed', () => { win = null })
}

/** 창틀도 Dock 아이콘도 없으니 메뉴바가 유일한 조작 창구다. */
function createTray() {
  tray = new Tray(nativeImage.createEmpty())
  tray.setTitle('⚾')
  tray.setToolTip('Sneaky Baseball')
  refreshTray()
}

function refreshTray() {
  if (!tray) return
  const { bestStreak } = store.read().record

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `최고 연속  ${bestStreak}`, enabled: false },
    { label: '⌥ 을 누르고 있는 동안 투구', enabled: false },
    { label: `스윙  ${SWING_LABEL}`, enabled: false },
    { type: 'separator' },
    { label: '숨기기 / 보이기', accelerator: TOGGLE_SHORTCUT, click: toggleWindow },
    { label: '종료', accelerator: 'Command+Q', click: () => app.quit() },
  ]))
}

function setSwingShortcut(on) {
  if (!on) {
    globalShortcut.unregister(SWING_SHORTCUT)
    return
  }
  if (globalShortcut.isRegistered(SWING_SHORTCUT)) return
  if (!globalShortcut.register(SWING_SHORTCUT, swing)) {
    console.warn(`단축키 ${SWING_SHORTCUT} 등록 실패 — 다른 앱이 쓰고 있는 것 같습니다.`)
  }
}

function send(channel, ...args) {
  if (win && !win.isDestroyed() && win.isVisible()) win.webContents.send(channel, ...args)
}

function swing() {
  send('swing')
}

/**
 * ⌥의 눌림/뗌만 듣는다. 손쉬운 사용 권한이 없으면 조용히 실패하는데,
 * 그래도 ⌥Space를 한 번 누를 때마다 한 구씩은 던져지므로 게임은 돌아간다.
 */
function watchHoldKey() {
  let listener = null
  try {
    listener = new GlobalKeyboardListener()
  } catch (error) {
    console.warn('⌥ 감지를 시작하지 못했습니다:', error.message)
    return
  }

  listener
    // 어떤 키 이벤트가 오든 "지금 눌려 있는 키" 맵에서 다시 읽는다 —
    // ⌥ 이벤트를 하나 놓쳐도 다음 키에서 상태가 바로잡힌다.
    .addListener((_event, down) => {
      setHolding(HOLD_KEYS.some((key) => down[key]))
    })
    .then(() => {
      keyWatch = listener
      if (process.env.SNEAKY_DEBUG) console.log('[main] ⌥ 감지 시작')
    })
    .catch((error) => {
      console.warn(
        '⌥ 감지 실패 — 시스템 설정 > 개인정보 보호 및 보안 > 손쉬운 사용에서 허용해 주세요.',
        error.message,
      )
    })
}

function setHolding(next) {
  if (next === holding) return
  holding = next
  if (process.env.SNEAKY_DEBUG) console.log(`[main] ⌥ ${holding ? '누름' : '뗌'}`)
  send('hold', holding)
}

/** 숨어 있는 동안에는 스윙 키를 다른 앱에 돌려준다. */
function toggleWindow() {
  if (!win) return
  if (win.isVisible()) {
    win.hide()
    setSwingShortcut(false)
    holding = false
  } else {
    win.showInactive()
    setSwingShortcut(true)
  }
}

app.whenReady().then(() => {
  app.dock?.hide()
  createWindow()
  createTray()
  watchHoldKey()

  setSwingShortcut(true)
  if (!globalShortcut.register(TOGGLE_SHORTCUT, toggleWindow)) {
    console.warn(`단축키 ${TOGGLE_SHORTCUT} 등록 실패 — 다른 앱이 쓰고 있는 것 같습니다.`)
  }
})

app.on('activate', () => {
  if (win) win.showInactive()
  else createWindow()
})

ipcMain.handle('record:get', () => store.read().record)

ipcMain.on('record:save', (_event, record) => {
  const bestStreak = Number(record?.bestStreak)
  if (!Number.isFinite(bestStreak)) return
  store.write({ record: { bestStreak } })
  refreshTray()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  keyWatch?.kill()
})
// 창을 닫아도 트레이로 살아 있는다 — 종료는 메뉴에서.
app.on('window-all-closed', () => {})
