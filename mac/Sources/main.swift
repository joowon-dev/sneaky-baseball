// Sneaky Baseball — macOS 셸.
//
// 게임은 전부 web/ 안의 HTML·Canvas·JS다. 이 파일이 하는 일은 그걸 얹을 창을 만드는 것뿐이다:
// 바탕화면을 덮는 투명·클릭 통과 오버레이, 전역 단축키, 메뉴바 아이콘, 기록 저장.
// Electron의 src/main 이 하던 일과 같고, 크로미움을 끼고 다니지 않으려고 다시 썼다.

import AppKit
import Carbon.HIToolbox
import WebKit

// MARK: - 상수

private enum Key {
    /// ⌘⇧B — 숨기기/보이기. 이것만 전역 핫키로 잡는다(다른 앱과 겹치지 않는 조합).
    static let toggle = (code: UInt32(kVK_ANSI_B), modifiers: UInt32(cmdKey | shiftKey))
    /// 스윙 키. 조합키가 아니라 상태를 물어보는 대상이다.
    static let space = CGKeyCode(kVK_Space)
}

/// 투구를 누르고 있을 키. 예전엔 ⌥ 고정이었는데 ⌥Space 가 시스템·입력기에 먹혀
/// **타격이 아예 안 오는** 문제가 있었다(윈도우에선 Alt+Space 가 창 메뉴를 연다).
/// 그래서 조합키를 버리고, 겹치지 않는 키를 사용자가 고르게 한다.
enum ControlKey: String, CaseIterable {
    case rightControl, option, rightShift, capsLock, f8

    var title: String {
        switch self {
        case .rightControl: return "우측 Ctrl"
        case .option: return "⌥ Option"
        case .rightShift: return "우측 Shift"
        case .capsLock: return "Caps Lock"
        case .f8: return "F8"
        }
    }

    /// 화면에 띄우는 안내. 게임 쪽은 이 문자열을 그대로 그린다.
    var hint: String {
        switch self {
        case .rightControl: return "우측 ⌃ 누르고 SPACE"
        case .option: return "⌥ 누르고 SPACE"
        case .rightShift: return "우측 ⇧ 누르고 SPACE"
        case .capsLock: return "Caps Lock 누르고 SPACE"
        case .f8: return "F8 누르고 SPACE"
        }
    }

    /// 좌우가 따로 있는 키가 있어서(⌥) 하나가 아니라 목록이다 — 아무거나 눌리면 눌린 것으로 친다.
    var codes: [CGKeyCode] {
        switch self {
        case .rightControl: return [CGKeyCode(kVK_RightControl)]
        case .option: return [CGKeyCode(kVK_Option), CGKeyCode(kVK_RightOption)]
        case .rightShift: return [CGKeyCode(kVK_RightShift)]
        case .capsLock: return [CGKeyCode(kVK_CapsLock)]
        case .f8: return [CGKeyCode(kVK_F8)]
        }
    }
}

/// 키 상태를 물어보는 주기. 이 간격이 곧 타이밍 오차라 판정 창(퍼펙트 35ms)보다
/// 훨씬 촘촘해야 한다 — 두 번 물어보는 게 전부라 비용은 없다시피 하다.
private let holdPollInterval: TimeInterval = 1.0 / 120.0

/// 키가 눌려 있는지. 이벤트를 가로채는 게 아니라 상태를 묻는 것이라 권한이 필요 없다.
private func keyDown(_ code: CGKeyCode) -> Bool {
    CGEventSource.keyState(.combinedSessionState, key: code)
}

private let recordKey = "bestMeters"
private let batterKitKey = "batterKit"
private let pitcherKitKey = "pitcherKit"
private let controlKeyKey = "controlKey"
private let screenKey = "screenNumber"
private let webScheme = "sneaky"

/// 메뉴에 세울 구단 목록. src/render/teams.js 의 id·name 과 같아야 한다 —
/// 셸은 게임 코드를 읽지 않으므로 여기 한 벌을 따로 둔다.
private let teams: [(id: String, name: String)] = [
    ("kia", "KIA 타이거즈"),
    ("samsung", "삼성 라이온즈"),
    ("lg", "LG 트윈스"),
    ("doosan", "두산 베어스"),
    ("kt", "kt wiz"),
    ("ssg", "SSG 랜더스"),
    ("lotte", "롯데 자이언츠"),
    ("hanwha", "한화 이글스"),
    ("nc", "NC 다이노스"),
    ("kiwoom", "키움 히어로즈"),
]

// MARK: - 번들 안의 웹 파일을 넘겨주는 핸들러

/// file:// 로 열면 ES 모듈 import 가 막힌다. 커스텀 스킴을 하나 만들어
/// 번들 Resources/web 아래 파일을 그대로 내준다 — 포트를 여는 것보다 조용하다.
final class WebAssetHandler: NSObject, WKURLSchemeHandler {
    private let root: URL

    init(root: URL) {
        self.root = root
    }

    private static let mimeTypes = [
        "html": "text/html", "js": "text/javascript", "css": "text/css",
        "json": "application/json", "png": "image/png",
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        // sneaky://app/renderer/index.html → <root>/renderer/index.html
        let relative = url.path.isEmpty || url.path == "/" ? "/renderer/index.html" : url.path
        let file = root.appendingPathComponent(relative).standardized

        // 번들 밖으로 나가는 경로는 거절한다.
        guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file) else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }

        let mime = Self.mimeTypes[file.pathExtension] ?? "application/octet-stream"
        let response = URLResponse(url: url, mimeType: mime,
                                   expectedContentLength: data.count, textEncodingName: "utf-8")
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

/// SNEAKY_DEBUG 가 켜져 있을 때만 stderr 로 흘린다.
func debugLog(_ text: String) {
    guard ProcessInfo.processInfo.environment["SNEAKY_DEBUG"] != nil else { return }
    FileHandle.standardError.write("[sneaky] \(text)\n".data(using: .utf8)!)
}

// MARK: - 앱

final class App: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var statusItem: NSStatusItem!
    private var holdTimer: Timer?
    private var hotKeys: [EventHotKeyRef?] = []
    private var holding = false
    private var spaceWasDown = false

    /// 투구 키. 안 고르면 우측 Ctrl.
    private var controlKey: ControlKey {
        get { ControlKey(rawValue: UserDefaults.standard.string(forKey: controlKeyKey) ?? "") ?? .rightControl }
        set {
            UserDefaults.standard.set(newValue.rawValue, forKey: controlKeyKey)
            webView.evaluateJavaScript("window.__sneakyHint && window.__sneakyHint('\(newValue.hint)')")
            refreshMenu()
        }
    }

    private var bestMeters: Int {
        get { UserDefaults.standard.integer(forKey: recordKey) }
        set { UserDefaults.standard.set(newValue, forKey: recordKey) }
    }

    /// 'lg-home' 같은 키. 없으면 유니폼 없음(검은 실루엣).
    private func kit(_ who: String) -> String? {
        UserDefaults.standard.string(forKey: who == "batter" ? batterKitKey : pitcherKitKey)
    }

    private func setKit(_ who: String, _ key: String?) {
        let defaultsKey = who == "batter" ? batterKitKey : pitcherKitKey
        if let key { UserDefaults.standard.set(key, forKey: defaultsKey) }
        else { UserDefaults.standard.removeObject(forKey: defaultsKey) }

        // 창이 숨어 있어도 밀어 넣는다 — 다시 띄웠을 때 이미 갈아입고 있어야 한다.
        let literal = key.map { "'\($0)'" } ?? "null"
        webView.evaluateJavaScript("window.__sneakyKit && window.__sneakyKit('\(who)', \(literal))")
        refreshMenu()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildWindow()
        buildStatusItem()
        registerHotKeys()

        holdTimer = Timer.scheduledTimer(withTimeInterval: holdPollInterval, repeats: true) { [weak self] _ in
            self?.pollKeys()
        }

        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in
            self?.moveToChosenScreen()
            self?.refreshMenu()
        }

        if ProcessInfo.processInfo.environment["SNEAKY_PROBE"] != nil {
            Timer.scheduledTimer(withTimeInterval: 3, repeats: false) { [weak self] _ in
                let probe = """
                JSON.stringify({
                  sneaky: !!window.sneaky,
                  canvas: (() => { const c = document.getElementById('stage')
                    return c ? [c.clientWidth, c.clientHeight, c.width, c.height] : null })(),
                  body: [document.body.clientWidth, document.body.clientHeight],
                  dpr: window.devicePixelRatio,
                })
                """
                self?.webView.evaluateJavaScript(probe) { value, error in
                    FileHandle.standardError.write("[probe] \(value ?? "nil") \(error?.localizedDescription ?? "")\n"
                        .data(using: .utf8)!)
                }
            }
        }
    }

    // MARK: 창

    private func buildWindow() {
        // 메뉴바와 Dock 자리는 비워 둔다.
        let frame = chosenScreen().visibleFrame

        window = NSWindow(contentRect: frame, styleMask: .borderless, backing: .buffered, defer: false)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.ignoresMouseEvents = true // 마우스는 전부 밑의 앱으로
        window.level = .init(rawValue: Int(CGWindowLevelForKey(.screenSaverWindow)))
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        window.isReleasedWhenClosed = false

        let config = WKWebViewConfiguration()
        let web = Bundle.main.resourceURL!.appendingPathComponent("web")
        config.setURLSchemeHandler(WebAssetHandler(root: web), forURLScheme: webScheme)
        config.userContentController.add(self, name: "sneaky")
        config.userContentController.addUserScript(
            WKUserScript(source: bridgeScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )

        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        // 웹뷰 자체 배경을 지워야 창의 투명이 살아난다.
        webView.setValue(false, forKey: "drawsBackground")
        webView.load(URLRequest(url: URL(string: "\(webScheme)://app/renderer/index.html")!))

        window.contentView?.addSubview(webView)
        window.orderFrontRegardless() // 포커스는 절대 가져가지 않는다
    }

    /// 렌더러가 기대하는 window.sneaky 를 그대로 만들어 준다 (Electron preload 와 같은 모양).
    private func bridgeScript() -> String {
        let batter = kit("batter").map { "'\($0)'" } ?? "null"
        let pitcher = kit("pitcher").map { "'\($0)'" } ?? "null"
        return """
        window.sneaky = {
          keyHint: '\(controlKey.hint)',
          kits: { batter: \(batter), pitcher: \(pitcher) },
          getRecord: () => Promise.resolve({ bestMeters: \(bestMeters) }),
          saveRecord: (record) => window.webkit.messageHandlers.sneaky.postMessage({
            type: 'record', bestMeters: record && record.bestMeters,
          }),
          onSwing: (handler) => { window.__sneakySwing = handler },
          onHint: (handler) => { window.__sneakyHint = handler },
          onHold: (handler) => { window.__sneakyHold = handler },
          onKit: (handler) => { window.__sneakyKit = handler },
        }
        // 웹뷰는 콘솔이 안 보인다. 오류만이라도 셸의 stderr 로 흘려보낸다.
        window.addEventListener('error', (e) => window.webkit.messageHandlers.sneaky.postMessage({
          type: 'log', text: `${e.message} (${e.filename}:${e.lineno})`,
        }))
        console.error = (...args) => window.webkit.messageHandlers.sneaky.postMessage({
          type: 'log', text: args.join(' '),
        })
        """
    }

    // MARK: 메뉴바

    private func buildStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "⚾"
        refreshMenu()
    }

    private func refreshMenu() {
        let menu = NSMenu()
        menu.addItem(disabled("최고 비거리  \(bestMeters)m"))
        menu.addItem(disabled("\(controlKey.title) 을 누르고 있는 동안 투구"))
        menu.addItem(disabled("스윙  \(controlKey.title) + Space"))
        menu.addItem(.separator())

        menu.addItem(kitMenu(title: "타자 팀", who: "batter"))
        menu.addItem(kitMenu(title: "투수 팀", who: "pitcher"))
        menu.addItem(controlKeyMenu())
        if NSScreen.screens.count > 1 { menu.addItem(screenMenu()) }
        menu.addItem(.separator())

        let toggle = NSMenuItem(title: "숨기기 / 보이기", action: #selector(toggleWindow), keyEquivalent: "b")
        toggle.keyEquivalentModifierMask = [.command, .shift]
        toggle.target = self
        menu.addItem(toggle)

        let quit = NSMenuItem(title: "종료", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.addItem(quit)

        statusItem.menu = menu
    }

    private func disabled(_ title: String) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.isEnabled = false
        return item
    }

    /// 구단 10칸 + 홈·원정 라디오. 고른 팀이 없으면 홈·원정은 회색으로 죽인다.
    private func kitMenu(title: String, who: String) -> NSMenuItem {
        let current = kit(who)
        let parts = current?.split(separator: "-").map(String.init)
        let teamId = parts?.first
        let side = parts?.count == 2 ? parts![1] : "home"

        let submenu = NSMenu()
        submenu.autoenablesItems = false

        let none = NSMenuItem(title: "유니폼 없음", action: #selector(pickTeam(_:)), keyEquivalent: "")
        none.target = self
        none.representedObject = [who, ""]
        none.state = current == nil ? .on : .off
        submenu.addItem(none)
        submenu.addItem(.separator())

        for team in teams {
            let item = NSMenuItem(title: team.name, action: #selector(pickTeam(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = [who, team.id]
            item.state = team.id == teamId ? .on : .off
            submenu.addItem(item)
        }
        submenu.addItem(.separator())

        for (value, label) in [("home", "홈"), ("away", "원정")] {
            let item = NSMenuItem(title: label, action: #selector(pickSide(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = [who, value]
            item.state = value == side ? .on : .off
            item.isEnabled = current != nil
            submenu.addItem(item)
        }

        let root = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        root.submenu = submenu
        return root
    }

    /// 팀만 바꾸고 홈·원정은 지금 고른 쪽을 유지한다.
    /// 「조작키 ▸」. 키보드마다 있는 키가 달라서 하나로 못 정한다 — 고르게 한다.
    private func controlKeyMenu() -> NSMenuItem {
        let submenu = NSMenu()
        for key in ControlKey.allCases {
            let item = NSMenuItem(title: key.title, action: #selector(pickControlKey(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = key.rawValue
            item.state = key == controlKey ? .on : .off
            submenu.addItem(item)
        }
        let root = NSMenuItem(title: "조작키", action: nil, keyEquivalent: "")
        root.submenu = submenu
        return root
    }

    @objc private func pickControlKey(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let key = ControlKey(rawValue: raw) else { return }
        controlKey = key
    }

    /// 「모니터 ▸」. 듀얼 모니터에서 어느 화면에 얹을지 고른다. 하나뿐이면 메뉴도 안 낸다.
    private func screenMenu() -> NSMenuItem {
        let submenu = NSMenu()
        let current = chosenScreen()
        for (index, screen) in NSScreen.screens.enumerated() {
            let size = screen.frame.size
            let main = screen.frame.origin == .zero ? " (주 화면)" : ""
            let title = "\(index + 1)번  \(Int(size.width))×\(Int(size.height))\(main)"
            let item = NSMenuItem(title: title, action: #selector(pickScreen(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = Self.number(of: screen)
            item.state = screen == current ? .on : .off
            submenu.addItem(item)
        }
        let root = NSMenuItem(title: "모니터", action: nil, keyEquivalent: "")
        root.submenu = submenu
        return root
    }

    @objc private func pickScreen(_ sender: NSMenuItem) {
        guard let number = sender.representedObject as? Int else { return }
        UserDefaults.standard.set(number, forKey: screenKey)
        moveToChosenScreen()
        refreshMenu()
    }

    /// 저장해 둔 화면. 그 화면이 사라졌으면(케이블을 뽑았거나) 주 화면으로 돌아간다.
    private func chosenScreen() -> NSScreen {
        let saved = UserDefaults.standard.object(forKey: screenKey) as? Int
        return NSScreen.screens.first { Self.number(of: $0) == saved } ?? Self.primaryScreen
    }

    private func moveToChosenScreen() {
        window.setFrame(chosenScreen().visibleFrame, display: true)
    }

    @objc private func pickTeam(_ sender: NSMenuItem) {
        guard let pair = sender.representedObject as? [String], pair.count == 2 else { return }
        let (who, teamId) = (pair[0], pair[1])
        if teamId.isEmpty {
            setKit(who, nil)
            return
        }
        let parts = kit(who)?.split(separator: "-").map(String.init)
        let side = parts?.count == 2 ? parts![1] : "home"
        setKit(who, "\(teamId)-\(side)")
    }

    /// 홈·원정만 바꾼다. 팀을 안 골랐으면 아무 일도 없다.
    @objc private func pickSide(_ sender: NSMenuItem) {
        guard let pair = sender.representedObject as? [String], pair.count == 2,
              let teamId = kit(pair[0])?.split(separator: "-").first.map(String.init)
        else { return }
        setKit(pair[0], "\(teamId)-\(pair[1])")
    }

    // MARK: 입력

    private func registerHotKeys() {
        var handler: EventHandlerRef?
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))

        InstallEventHandler(GetApplicationEventTarget(), { _, event, _ -> OSStatus in
            var id = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                              nil, MemoryLayout<EventHotKeyID>.size, nil, &id)
            App.shared?.hotKeyPressed(id.id)
            return noErr
        }, 1, &spec, nil, &handler)

        for (index, key) in [Key.toggle].enumerated() {
            var ref: EventHotKeyRef?
            let id = EventHotKeyID(signature: OSType(0x534e4b59), id: UInt32(index)) // 'SNKY'
            let status = RegisterEventHotKey(key.code, key.modifiers, id, GetApplicationEventTarget(), 0, &ref)
            debugLog("hotkey \(index) 등록 status=\(status)")
            hotKeys.append(ref)
        }
    }

    fileprivate func hotKeyPressed(_ id: UInt32) {
        debugLog("hotkey \(id)")
        toggleWindow()
    }

    /// 투구 키를 누르고 있는 동안만 던지고, 그 상태에서 스페이스를 누르면 휘두른다.
    /// 둘 다 **상태를 물어봐서** 안다 — 키 이벤트를 가로채지 않으므로 권한도 필요 없고,
    /// 다른 앱의 단축키(윈도우 Alt+Space 창 메뉴 같은)를 건드리지도 않는다.
    private func pollKeys() {
        let live = window.isVisible
        let down = live && controlKey.codes.contains(where: keyDown)
        if down != holding {
            holding = down
            debugLog("hold \(down)")
            webView.evaluateJavaScript("window.__sneakyHold && window.__sneakyHold(\(down))")
        }

        // 누르고 있는 내내가 아니라 **눌린 순간** 한 번만 휘두른다.
        let space = live && keyDown(Key.space)
        if space && !spaceWasDown && down {
            webView.evaluateJavaScript("window.__sneakySwing && window.__sneakySwing()")
        }
        spaceWasDown = space
    }

    @objc private func toggleWindow() {
        if window.isVisible {
            window.orderOut(nil)
            if holding {
                holding = false
                webView.evaluateJavaScript("window.__sneakyHold && window.__sneakyHold(false)")
            }
        } else {
            window.orderFrontRegardless()
        }
    }

    // MARK: 저장

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }

        if body["type"] as? String == "log", let text = body["text"] as? String {
            FileHandle.standardError.write("[web] \(text)\n".data(using: .utf8)!)
            return
        }

        guard body["type"] as? String == "record",
              let meters = body["bestMeters"] as? Int,
              meters > bestMeters
        else { return }

        bestMeters = meters
        refreshMenu()
    }

    /// 메뉴 막대가 있는 주 화면. NSScreen.main 은 "키 윈도우가 있는 화면"이라
    /// 포커스를 안 갖는 이 앱에서는 엉뚱한 모니터를 집는다 — 전역 좌표 원점인 쪽이 주 화면이다.
    /// NSScreen 을 저장할 수 있는 값으로. 순서는 바뀌어도 이 번호는 그대로다.
    static func number(of screen: NSScreen) -> Int {
        (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.intValue ?? -1
    }

    static var primaryScreen: NSScreen {
        NSScreen.screens.first { $0.frame.origin == .zero } ?? NSScreen.screens.first ?? NSScreen.main!
    }

    static var shared: App?
}

// MARK: - 시작

let app = NSApplication.shared
let delegate = App()
App.shared = delegate
app.delegate = delegate
// Dock 아이콘도 메뉴도 없다. 조작 창구는 메뉴바뿐 (Info.plist 의 LSUIElement 와 같은 뜻).
app.setActivationPolicy(.accessory)
app.run()
