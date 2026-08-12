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
    /// ⌥Space — 시작·스윙. 조합키라서 Carbon 핫키로 잡을 수 있다(권한 불필요).
    static let swing = (code: UInt32(kVK_Space), modifiers: UInt32(optionKey))
    /// ⌘⇧B — 숨기기/보이기.
    static let toggle = (code: UInt32(kVK_ANSI_B), modifiers: UInt32(cmdKey | shiftKey))
}

/// ⌥을 누르고 있는지 확인하는 주기. NSEvent.modifierFlags 는 그냥 읽을 수 있어
/// 손쉬운 사용 권한이 필요 없다 — 키 이벤트를 엿듣는 게 아니라 현재 상태를 묻는 것이다.
private let holdPollInterval: TimeInterval = 1.0 / 30.0

private let recordKey = "bestMeters"
private let webScheme = "sneaky"

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

    private var bestMeters: Int {
        get { UserDefaults.standard.integer(forKey: recordKey) }
        set { UserDefaults.standard.set(newValue, forKey: recordKey) }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildWindow()
        buildStatusItem()
        registerHotKeys()

        holdTimer = Timer.scheduledTimer(withTimeInterval: holdPollInterval, repeats: true) { [weak self] _ in
            self?.pollHoldKey()
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
        let frame = Self.primaryScreen.visibleFrame

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
        """
        window.sneaky = {
          getRecord: () => Promise.resolve({ bestMeters: \(bestMeters) }),
          saveRecord: (record) => window.webkit.messageHandlers.sneaky.postMessage({
            type: 'record', bestMeters: record && record.bestMeters,
          }),
          onSwing: (handler) => { window.__sneakySwing = handler },
          onHold: (handler) => { window.__sneakyHold = handler },
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
        menu.addItem(disabled("⌥ 을 누르고 있는 동안 투구"))
        menu.addItem(disabled("스윙  ⌥Space"))
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

        for (index, key) in [Key.swing, Key.toggle].enumerated() {
            var ref: EventHotKeyRef?
            let id = EventHotKeyID(signature: OSType(0x534e4b59), id: UInt32(index)) // 'SNKY'
            let status = RegisterEventHotKey(key.code, key.modifiers, id, GetApplicationEventTarget(), 0, &ref)
            debugLog("hotkey \(index) 등록 status=\(status)")
            hotKeys.append(ref)
        }
    }

    fileprivate func hotKeyPressed(_ id: UInt32) {
        debugLog("hotkey \(id)")
        if id == 0 {
            guard window.isVisible else { return }
            webView.evaluateJavaScript("window.__sneakySwing && window.__sneakySwing()")
        } else {
            toggleWindow()
        }
    }

    /// ⌥을 누르고 있는 동안만 투수가 던진다. 상태만 읽으므로 권한이 필요 없다.
    private func pollHoldKey() {
        let down = window.isVisible && NSEvent.modifierFlags.contains(.option)
        guard down != holding else { return }
        holding = down
        debugLog("hold \(down)")
        webView.evaluateJavaScript("window.__sneakyHold && window.__sneakyHold(\(down))")
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
