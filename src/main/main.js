const path = require('node:path')
const {
  app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, screen,
} = require('electron')
const store = require('./store')

// 클릭이 통과되는 오버레이는 포커스를 못 받아서 일반 키 입력이 오지 않는다.
// 그래서 스윙도 전역 단축키로 받는다. 그냥 Space를 잡으면 모든 앱에서 스페이스를 뺏는다.
const SWING_SHORTCUT = 'Alt+Space'
const SWING_LABEL = '⌥Space'
const TOGGLE_SHORTCUT = 'CommandOrControl+Shift+B'

let win = null
let tray = null

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

function swing() {
  if (win && !win.isDestroyed() && win.isVisible()) win.webContents.send('swing')
}

/** 숨어 있는 동안에는 스윙 키를 다른 앱에 돌려준다. */
function toggleWindow() {
  if (!win) return
  if (win.isVisible()) {
    win.hide()
    setSwingShortcut(false)
  } else {
    win.showInactive()
    setSwingShortcut(true)
  }
}

app.whenReady().then(() => {
  app.dock?.hide()
  createWindow()
  createTray()

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

app.on('will-quit', () => globalShortcut.unregisterAll())
// 창을 닫아도 트레이로 살아 있는다 — 종료는 메뉴에서.
app.on('window-all-closed', () => {})
