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
    /// 스윙 — 고른 수식키 + Space. 조합키라서 핫키로 잡히고, 잡히면 키를 삼킨다.
    static let swingCode = UInt32(kVK_Space)
}

/// 투구를 누르고 있을 수식키. 예전엔 ⌥ 고정이었는데 **⌥Space 가 입력기·시스템에 먹혀**
/// 타격이 아예 안 왔다(윈도우는 Alt+Space 가 창 메뉴를 연다). 키보드·입력기마다 뺏어 가는
/// 조합이 달라 하나로 못 정하므로 고르게 한다.
///
/// 누르고 있는지는 **플래그를 물어봐서** 알고(권한 불필요), 스윙은 `수식키+Space` 를
/// **전역 핫키로 잡는다**. 핫키는 키를 삼키므로 스페이스가 아래 앱에 새지 않는다 —
/// 상태만 물어보는 방식으로 하면 휘두를 때마다 작업 중인 문서에 공백이 찍힌다.
enum ControlKey: String, CaseIterable {
    case option, optionShift, controlOption, control, shift

    var title: String {
        switch self {
        case .optionShift: return "⌥⇧ Option+Shift"
        case .controlOption: return "⌃⌥ Control+Option"
        case .option: return "⌥ Option"
        case .control: return "⌃ Control"
        case .shift: return "⇧ Shift"
        }
    }

    /// 화면에 띄우는 안내. 게임 쪽은 이 문자열을 그대로 그린다.
    var hint: String {
        switch self {
        case .optionShift: return "⌥⇧ 누르고 SPACE"
        case .controlOption: return "⌃⌥ 누르고 SPACE"
        case .option: return "⌥ 누르고 SPACE"
        case .control: return "⌃ 누르고 SPACE"
        case .shift: return "⇧ 누르고 SPACE"
        }
    }

    /// 핫키 등록용(Carbon).
    var carbon: UInt32 {
        switch self {
        case .optionShift: return UInt32(optionKey | shiftKey)
        case .controlOption: return UInt32(controlKey | optionKey)
        case .option: return UInt32(optionKey)
        case .control: return UInt32(controlKey)
        case .shift: return UInt32(shiftKey)
        }
    }

    /// 누르고 있는지 볼 때 쓰는 플래그. 좌우는 구분하지 않는다 —
    /// NSEvent.modifierFlags 가 좌우 비트를 걷어내고 주기 때문에 애초에 알 수 없다.
    var flags: NSEvent.ModifierFlags {
        switch self {
        case .optionShift: return [.option, .shift]
        case .controlOption: return [.control, .option]
        case .option: return [.option]
        case .control: return [.control]
        case .shift: return [.shift]
        }
    }
}

/// 수식키를 누르고 있는지 확인하는 주기. 상태를 묻는 것이라 권한이 필요 없다.
private let holdPollInterval: TimeInterval = 1.0 / 60.0

private let recordKey = "bestMeters"
private let pitcherXKey = "pitcherX"
private let defaultPitcherX = 0.87

/// 트레이가 고르게 하는 투수 거리 단계. **값은 `src/game/pitches.js` 의
/// `PITCHER_X_STEPS` 와 같아야 한다** — Swift 는 그 파일을 못 읽어서 손으로 맞춰 둔다.
/// 당기면 공이 일찍 오고, 밀면 늦게 온다.
private let pitcherSteps: [(x: Double, title: String)] = [
    (0.81, "제일 가깝게"),
    (0.84, "가깝게"),
    (0.87, "기본"),
    (0.90, "멀게"),
    (0.93, "제일 멀게"),
]
private let gearedRecordKey = "bestGearedMeters"
/// 지갑·응원·가진 배트. 유니폼·투수 거리와 같은 자리에 둔다 — 창이 둘이라 진실이 하나여야 한다.
private let pointsKey = "points"
private let ownedKey = "ownedBats"
private let equippedKey = "equippedBat"
private let cheerKey = "cheer"
private let defaultBat = "bare"
/// 랭킹에 쓰는 신분. 계정이 아니라 **기기가 만든 무작위 한 쌍**이다 —
/// 이메일도 비밀번호도 없고, 둘을 이어 붙인 것이 사용자가 보는 「복구 코드」다.
private let playerIdKey = "playerId"
private let playerSecretKey = "playerSecret"
private let nicknameKey = "nickname"
/// 아직 못 보낸 타구 줄. 평소에는 칠 때마다 바로 올라가고, 못 보낸 것만 여기 남는다.
private let pendingKey = "pendingHits"
private let batterKitKey = "batterKit"
private let pitcherKitKey = "pitcherKit"
private let controlKeyKey = "controlKey"

/// 처음 깔았을 때 입고 나오는 유니폼. 타자·투수를 홈·원정으로 갈라 둬야 둘이 구분된다.
private let defaultKits = (batter: "lotte-home", pitcher: "lotte-away")
/// 「유니폼 없음」을 **고른 것**과 아직 안 고른 것은 다르다. 지워 버리면 다음 실행에
/// 기본값이 다시 입혀지므로, 없음도 값으로 저장한다.
private let noKitValue = "none"
private let screenKey = "screenNumber"
private let webScheme = "sneaky"

/// 새 버전이 있는지 물어보는 곳. 태그를 밀면 CI 가 여기에 릴리스를 올린다.
private let releaseAPI = "https://api.github.com/repos/joowon-dev/sneaky-baseball/releases/latest"
private let releasePage = "https://github.com/joowon-dev/sneaky-baseball/releases/latest"
/// 자동 업데이트가 받아 가는 것은 zip 이다 — dmg 를 마운트해 자기를 갈아 끼우면 실패할 자리가 너무 많다.
private let macAssetSuffix = "-mac.zip"
private let updateCheckInterval: TimeInterval = 24 * 60 * 60
private let firstUpdateCheckDelay: TimeInterval = 20

/// "v1.2.0" > "1.10.0" 같은 걸 숫자로 비교한다. 문자열로 비교하면 1.10 이 1.9 보다 작다.
func isNewerVersion(_ candidate: String, than current: String) -> Bool {
    func parts(_ text: String) -> [Int] {
        text.trimmingCharacters(in: CharacterSet(charactersIn: "vV "))
            .split(separator: ".").map { Int($0.prefix(while: \.isNumber)) ?? 0 }
    }
    let a = parts(candidate), b = parts(current)
    for i in 0..<max(a.count, b.count) {
        let x = i < a.count ? a[i] : 0
        let y = i < b.count ? b[i] : 0
        if x != y { return x > y }
    }
    return false
}

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
    /// 새 버전. 지금보다 높을 때만 채워진다 — 없으면 메뉴에 아무것도 안 낸다.
    private var updateVersion: String?
    private var updateAsset: URL?
    /// 내려받는 중인가. 메뉴를 두 번 누르는 걸 막고, 진행 상태를 글씨로 보여 준다.
    private var updating = false
    private var updateNote: String?

    /// 상점 — 오버레이가 아니라 보통 창이다. 클릭 통과에 예외를 파지 않는다.
    private var shopWindow: NSWindow?
    private var shopWebView: WKWebView?
    private var holdTimer: Timer?
    private var hotKeys: [EventHotKeyRef?] = []
    private var swingHotKey: EventHotKeyRef?
    private var holding = false

    /// 투구 키. 안 고르면 우측 Ctrl.
    private var controlKey: ControlKey {
        get { ControlKey(rawValue: UserDefaults.standard.string(forKey: controlKeyKey) ?? "") ?? .option }
        set {
            UserDefaults.standard.set(newValue.rawValue, forKey: controlKeyKey)
            registerSwingHotKey()
            webView.evaluateJavaScript("window.__sneakyHint && window.__sneakyHint('\(newValue.hint)')")
            refreshMenu()
        }
    }

    private var bestMeters: Int {
        get { UserDefaults.standard.integer(forKey: recordKey) }
        set { UserDefaults.standard.set(newValue, forKey: recordKey) }
    }

    /// 장비를 끼고 세운 기록. 맨몸 기록과 따로 둔다 — 배트를 사면 홈런이 쉬워지므로
    /// 한 칸에 섞으면 옛 기록과 새 기록의 잣대가 달라진다.
    private var bestGearedMeters: Int {
        get { UserDefaults.standard.integer(forKey: gearedRecordKey) }
        set { UserDefaults.standard.set(newValue, forKey: gearedRecordKey) }
    }

    /// 지갑. 안타·홈런으로 쌓이고 배트를 사면 준다.
    private var points: Int {
        get { UserDefaults.standard.integer(forKey: pointsKey) }
        set { UserDefaults.standard.set(max(0, newValue), forKey: pointsKey) }
    }

    /// 가진 배트. 맨손은 언제나 가지고 있다.
    private var ownedBats: [String] {
        get {
            let saved = UserDefaults.standard.stringArray(forKey: ownedKey) ?? []
            return saved.contains(defaultBat) ? saved : [defaultBat] + saved
        }
        set { UserDefaults.standard.set(newValue, forKey: ownedKey) }
    }

    private var equippedBat: String {
        get { UserDefaults.standard.string(forKey: equippedKey) ?? defaultBat }
        set { UserDefaults.standard.set(newValue, forKey: equippedKey) }
    }

    /// 구단별 응원 원장. **줄어드는 일이 없다** — 배트를 사도 그대로다.
    private var cheer: [String: Int] {
        get { UserDefaults.standard.dictionary(forKey: cheerKey) as? [String: Int] ?? [:] }
        set { UserDefaults.standard.set(newValue, forKey: cheerKey) }
    }

    /// 랭킹 신분. 아직 등록하기 전이면 비어 있다.
    private var playerId: String? {
        get { UserDefaults.standard.string(forKey: playerIdKey) }
        set { UserDefaults.standard.set(newValue, forKey: playerIdKey) }
    }

    private var playerSecret: String? {
        get { UserDefaults.standard.string(forKey: playerSecretKey) }
        set { UserDefaults.standard.set(newValue, forKey: playerSecretKey) }
    }

    private var nickname: String? {
        get { UserDefaults.standard.string(forKey: nicknameKey) }
        set { UserDefaults.standard.set(newValue, forKey: nicknameKey) }
    }

    /// 못 보낸 타구. 저장은 셸이 하고, 보내는 일은 게임이 한다.
    private var pendingHits: [[String: Any]] {
        get { UserDefaults.standard.array(forKey: pendingKey) as? [[String: Any]] ?? [] }
        set { UserDefaults.standard.set(newValue, forKey: pendingKey) }
    }

    /// 두 창에 실어 보낼 지갑. **손으로 조립하지 않고 직렬화한다** — 따옴표가 하나만 새도
    /// window.sneaky 가 통째로 안 만들어지고, 게임은 조용히 핫키까지 잃는다.
    private func gearJSON() -> String {
        var payload: [String: Any] = [
            "points": points, "owned": ownedBats, "equipped": equippedBat, "cheer": cheer,
            "pending": pendingHits,
        ]
        // 랭킹 신분은 있을 때만 싣는다. 없으면 게임이 처음 보낼 때 만든다.
        if let playerId, let playerSecret {
            payload["account"] = [
                "playerId": playerId, "secret": playerSecret, "nickname": nickname ?? "",
            ]
        }
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let text = String(data: data, encoding: .utf8)
        else { return "{}" }
        return text
    }

    /// 지갑이 바뀌면 **두 창 모두**에 밀어 넣는다 — 게임에서 번 포인트가 열려 있는 상점에
    /// 바로 보이고, 상점에서 바꿔 낀 배트가 바로 타석에 선다.
    private func pushGear() {
        let script = "window.__sneakyGear && window.__sneakyGear(\(gearJSON()))"
        webView.evaluateJavaScript(script)
        shopWebView?.evaluateJavaScript(script)
        refreshMenu()
    }

    /// 투수가 선 자리(필드 상자 가로 비율). 플레이어가 드래그로 옮긴다.
    /// 옮기면 던지는 거리가 바뀌고, 거리가 곧 투구 시간이다.
    private var pitcherX: Double {
        get {
            let v = UserDefaults.standard.double(forKey: pitcherXKey)
            return v == 0 ? defaultPitcherX : v
        }
        set { UserDefaults.standard.set(newValue, forKey: pitcherXKey) }
    }

    /// 투수를 잡을 수 있는 자리 — **게임이 알려준다**(CSS 픽셀, 창 왼쪽 위 기준).
    /// 화면 어디에 그려지는지는 그리는 쪽만 알기 때문이다.
    private var hitbox: CGRect = .zero
    /// 지금 클릭이 창을 통과하고 있는가. 매 프레임 창을 건드리지 않으려고 들고 있는다.
    private var passingThrough = true
    /// 커서가 투수 위에 있었는가. 디버그 로그를 바뀔 때만 찍으려고 들고 있는다.
    private var cursorWasOver = false

    /// 'lg-home' 같은 키. 없으면 유니폼 없음(검은 실루엣).
    private func kit(_ who: String) -> String? {
        let stored = UserDefaults.standard.string(forKey: who == "batter" ? batterKitKey : pitcherKitKey)
        guard let stored else { return who == "batter" ? defaultKits.batter : defaultKits.pitcher }
        return stored == noKitValue ? nil : stored
    }

    private func setKit(_ who: String, _ key: String?) {
        let defaultsKey = who == "batter" ? batterKitKey : pitcherKitKey
        UserDefaults.standard.set(key ?? noKitValue, forKey: defaultsKey)

        // 창이 숨어 있어도 밀어 넣는다 — 다시 띄웠을 때 이미 갈아입고 있어야 한다.
        let literal = key.map { "'\($0)'" } ?? "null"
        let script = "window.__sneakyKit && window.__sneakyKit('\(who)', \(literal))"
        webView.evaluateJavaScript(script)
        // 상점의 미리보기도 같이 갈아입는다 — 거기 선 타자가 곧 타석에 설 타자다.
        shopWebView?.evaluateJavaScript(script)
        refreshMenu()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildWindow()
        buildStatusItem()
        registerHotKeys()

        holdTimer = Timer.scheduledTimer(withTimeInterval: holdPollInterval, repeats: true) { [weak self] _ in
            self?.pollKeys()
        }

        scheduleUpdateChecks()

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

        webView = WKWebView(frame: window.contentView!.bounds, configuration: makeConfig())
        webView.autoresizingMask = [.width, .height]
        // 웹뷰 자체 배경을 지워야 창의 투명이 살아난다.
        webView.setValue(false, forKey: "drawsBackground")
        webView.load(URLRequest(url: URL(string: "\(webScheme)://app/renderer/index.html")!))

        window.contentView?.addSubview(webView)
        window.orderFrontRegardless() // 포커스는 절대 가져가지 않는다
    }

    /// 웹뷰 설정 한 벌. 게임 창과 상점 창이 **같은 브리지**를 쓴다 —
    /// WKWebViewConfiguration 은 창마다 새로 만들어야 해서 함수로 둔다.
    private func makeConfig() -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        let web = Bundle.main.resourceURL!.appendingPathComponent("web")
        config.setURLSchemeHandler(WebAssetHandler(root: web), forURLScheme: webScheme)
        config.userContentController.add(self, name: "sneaky")
        config.userContentController.addUserScript(
            WKUserScript(source: bridgeScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        return config
    }

    /// 「배트 상점」. 오버레이와 달리 **마우스를 받는 보통 창**이다.
    /// 한 번 만들면 들고 있다가 다시 띄운다 — 열 때마다 새로 만들면 캔버스를 매번 다시 그린다.
    @objc private func openShop() {
        if let shopWindow {
            NSApp.activate(ignoringOtherApps: true)
            shopWindow.makeKeyAndOrderFront(nil)
            return
        }

        // 배트 다섯 장이 한 줄에 들어오는 너비. 줄이 갈리면 마지막 배트만 외따로 떨어진다.
        let frame = NSRect(x: 0, y: 0, width: 920, height: 560)
        let win = NSWindow(contentRect: frame, styleMask: [.titled, .closable, .miniaturizable],
                           backing: .buffered, defer: false)
        win.title = "배트 상점"
        win.isReleasedWhenClosed = false
        win.center()

        let web = WKWebView(frame: win.contentView!.bounds, configuration: makeConfig())
        web.autoresizingMask = [.width, .height]
        web.load(URLRequest(url: URL(string: "\(webScheme)://app/shop/index.html")!))
        win.contentView?.addSubview(web)

        shopWindow = win
        shopWebView = web
        NSApp.activate(ignoringOtherApps: true)
        win.makeKeyAndOrderFront(nil)
    }

    /// 렌더러가 기대하는 window.sneaky 를 그대로 만들어 준다 (Electron preload 와 같은 모양).
    private func bridgeScript() -> String {
        let batter = kit("batter").map { "'\($0)'" } ?? "null"
        let pitcher = kit("pitcher").map { "'\($0)'" } ?? "null"
        return """
        window.sneaky = {
          keyHint: '\(controlKey.hint)',
          kits: { batter: \(batter), pitcher: \(pitcher) },
          getRecord: () => Promise.resolve({
            bestMeters: \(bestMeters), bestGearedMeters: \(bestGearedMeters),
          }),
          saveRecord: (record) => window.webkit.messageHandlers.sneaky.postMessage({
            type: 'record',
            bestMeters: record && record.bestMeters,
            bestGearedMeters: record && record.bestGearedMeters,
          }),
          gear: \(gearJSON()),
          earn: (e) => window.webkit.messageHandlers.sneaky.postMessage({
            type: 'earn', points: e.points, team: e.team,
          }),
          buyBat: (b) => window.webkit.messageHandlers.sneaky.postMessage({
            type: 'buy', key: b.key, price: b.price,
          }),
          equipBat: (key) => window.webkit.messageHandlers.sneaky.postMessage({
            type: 'equip', key,
          }),
          onGear: (handler) => { window.__sneakyGear = handler },
          saveAccount: (a) => window.webkit.messageHandlers.sneaky.postMessage({
            type: 'account', playerId: a.playerId, secret: a.secret, nickname: a.nickname,
          }),
          savePending: (hits) => window.webkit.messageHandlers.sneaky.postMessage({
            type: 'pending', hits,
          }),
          onSwing: (handler) => { window.__sneakySwing = handler },
          onHint: (handler) => { window.__sneakyHint = handler },
          onHold: (handler) => { window.__sneakyHold = handler },
          onKit: (handler) => { window.__sneakyKit = handler },
          pitcherX: \(pitcherX),
          savePitcherX: (x) => window.webkit.messageHandlers.sneaky.postMessage({
            type: 'pitcherX', value: x,
          }),
          setHitbox: (box) => window.webkit.messageHandlers.sneaky.postMessage({
            type: 'hitbox', x: box.x, y: box.y, w: box.w, h: box.h,
          }),
          onPitcherX: (handler) => { window.__sneakyPitcherX = handler },
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

    // MARK: 업데이트
    //
    // **두 단계로 나눠 뒀다.** 1단계는 「새 버전이 있다」고 알리는 것뿐이고,
    // 2단계는 눌렀을 때 받아서 갈아 끼우는 것이다. 눌러야만 갈아 끼운다 —
    // 몰래 하는 게임에 자동 재시작만큼 눈에 띄는 것도 없다.

    private var currentVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
    }

    private func scheduleUpdateChecks() {
        Timer.scheduledTimer(withTimeInterval: firstUpdateCheckDelay, repeats: false) { [weak self] _ in
            self?.checkForUpdate()
        }
        Timer.scheduledTimer(withTimeInterval: updateCheckInterval, repeats: true) { [weak self] _ in
            self?.checkForUpdate()
        }
    }

    /// 하루 한 번 물어본다. 실패는 조용히 삼킨다 — 새 버전을 못 찾는 것과 게임이 안 되는 것은 다른 일이다.
    private func checkForUpdate() {
        guard var request = URL(string: releaseAPI).map({ URLRequest(url: $0) }) else { return }
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 15

        URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
            guard let self, let data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let tag = json["tag_name"] as? String,
                  isNewerVersion(tag, than: self.currentVersion)
            else { return }

            let assets = json["assets"] as? [[String: Any]] ?? []
            let zip = assets.first { ($0["name"] as? String)?.hasSuffix(macAssetSuffix) == true }
            let url = (zip?["browser_download_url"] as? String).flatMap(URL.init(string:))

            DispatchQueue.main.async {
                debugLog("새 버전 \(tag)")
                self.updateVersion = tag
                self.updateAsset = url
                self.refreshMenu()
            }
        }.resume()
    }

    /// 2단계 — 받아서 갈아 끼운다. 어느 한 걸음이라도 어긋나면 **손대지 않고** 릴리스 페이지를 연다.
    @objc private func installUpdate() {
        guard !updating else { return }
        guard let asset = updateAsset else {
            openReleasePage()
            return
        }
        updating = true
        updateNote = "내려받는 중…"
        refreshMenu()

        URLSession.shared.downloadTask(with: asset) { [weak self] location, _, error in
            guard let self else { return }
            guard let location, error == nil else {
                DispatchQueue.main.async { self.updateFailed() }
                return
            }
            // 임시 파일은 이 블록이 끝나면 사라진다. 옆에 옮겨 두고 푼다.
            let work = FileManager.default.temporaryDirectory
                .appendingPathComponent("sneaky-update-\(UUID().uuidString)")
            let zip = work.appendingPathComponent("app.zip")
            do {
                try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
                try FileManager.default.moveItem(at: location, to: zip)
            } catch {
                DispatchQueue.main.async { self.updateFailed() }
                return
            }
            DispatchQueue.main.async { self.swapIn(zip: zip, work: work) }
        }.resume()
    }

    private func swapIn(zip: URL, work: URL) {
        updateNote = "설치하는 중…"
        refreshMenu()

        let unpacked = work.appendingPathComponent("unpacked")
        guard run("/usr/bin/ditto", ["-x", "-k", zip.path, unpacked.path]) == 0,
              let newApp = (try? FileManager.default.contentsOfDirectory(at: unpacked,
                                                                        includingPropertiesForKeys: nil))?
                  .first(where: { $0.pathExtension == "app" })
        else {
            updateFailed()
            return
        }

        // **받은 것이 애플이 검증한 우리 앱인지 본다.** 여기서 걸리면 갈아 끼우지 않는다 —
        // 남의 zip 을 받아 자기 자리에 넣는 일은 절대 없어야 한다.
        guard run("/usr/sbin/spctl", ["--assess", "--type", "execute", newApp.path]) == 0,
              let id = Bundle(url: newApp)?.bundleIdentifier, id == Bundle.main.bundleIdentifier
        else {
            debugLog("업데이트 검증 실패")
            updateFailed()
            return
        }

        let target = Bundle.main.bundleURL
        do {
            _ = try FileManager.default.replaceItemAt(target, withItemAt: newApp)
        } catch {
            // 대개 권한 문제다(/Applications 밖이거나 다른 사용자 소유).
            debugLog("바꿔 끼우기 실패 \(error)")
            updateFailed()
            return
        }

        // 새 것을 띄우고 지금 것은 물러난다.
        let config = NSWorkspace.OpenConfiguration()
        config.createsNewApplicationInstance = true
        NSWorkspace.shared.openApplication(at: target, configuration: config) { _, _ in
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }
    }

    /// 못 했으면 **아무것도 건드리지 않고** 사람에게 넘긴다.
    private func updateFailed() {
        updating = false
        updateNote = "직접 받기"
        refreshMenu()
        openReleasePage()
    }

    private func openReleasePage() {
        if let url = URL(string: releasePage) { NSWorkspace.shared.open(url) }
    }

    @discardableResult
    private func run(_ path: String, _ args: [String]) -> Int32 {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: path)
        task.arguments = args
        task.standardOutput = FileHandle.nullDevice
        task.standardError = FileHandle.nullDevice
        do { try task.run() } catch { return -1 }
        task.waitUntilExit()
        return task.terminationStatus
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
        if bestGearedMeters > bestMeters {
            menu.addItem(disabled("장비 기록  \(bestGearedMeters)m"))
        }
        menu.addItem(disabled("보유 포인트  \(points)P"))
        menu.addItem(disabled("\(controlKey.title) 을 누르고 있는 동안 투구"))
        menu.addItem(disabled("스윙  \(controlKey.title) + Space"))
        menu.addItem(.separator())

        // 1단계 — 새 버전이 있을 때만 낸다. 없으면 메뉴에 아무 흔적도 없다.
        if let updateVersion {
            let title = updateNote ?? "새 버전 \(updateVersion) 설치"
            let item = NSMenuItem(title: title, action: #selector(installUpdate), keyEquivalent: "")
            item.target = self
            item.isEnabled = !updating
            menu.addItem(item)
            menu.addItem(.separator())
        }

        let shop = NSMenuItem(title: "배트 상점…", action: #selector(openShop), keyEquivalent: "")
        shop.target = self
        menu.addItem(shop)
        menu.addItem(.separator())

        menu.addItem(kitMenu(title: "타자 팀", who: "batter"))
        menu.addItem(kitMenu(title: "투수 팀", who: "pitcher"))
        menu.addItem(controlKeyMenu())
        menu.addItem(pitcherMenu())
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
    /// 「투수 거리 ▸」. 드래그와 같은 값을 본다 — 끌어서 옮기면 여기 체크도 따라온다.
    /// 드래그는 연속값이라 단계와 정확히 안 맞을 수 있어 **가장 가까운 단계**에 찍는다.
    private func pitcherMenu() -> NSMenuItem {
        let current = pitcherX
        let nearest = pitcherSteps.min { abs($0.x - current) < abs($1.x - current) }?.x

        let submenu = NSMenu()
        for step in pitcherSteps {
            let item = NSMenuItem(title: step.title, action: #selector(pickPitcherX(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = step.x
            item.state = step.x == nearest ? .on : .off
            submenu.addItem(item)
        }
        let root = NSMenuItem(title: "투수 거리", action: nil, keyEquivalent: "")
        root.submenu = submenu
        return root
    }

    @objc private func pickPitcherX(_ sender: NSMenuItem) {
        guard let x = sender.representedObject as? Double else { return }
        setPitcherX(x)
    }

    /// 창이 숨어 있어도 밀어 넣는다 — 다시 띄웠을 때 이미 옮겨져 있어야 한다.
    private func setPitcherX(_ x: Double) {
        pitcherX = x
        webView.evaluateJavaScript("window.__sneakyPitcherX && window.__sneakyPitcherX(\(x))")
        refreshMenu()
    }

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

        registerSwingHotKey()

        var ref: EventHotKeyRef?
        let id = EventHotKeyID(signature: OSType(0x534e4b59), id: 1) // 'SNKY'
        let status = RegisterEventHotKey(Key.toggle.code, Key.toggle.modifiers, id, GetApplicationEventTarget(), 0, &ref)
        debugLog("toggle 핫키 status=\(status)")
        hotKeys.append(ref)
    }

    /// 스윙 핫키. 조작키를 바꾸면 옛것을 풀고 새로 건다.
    private func registerSwingHotKey() {
        if let old = swingHotKey { UnregisterEventHotKey(old) }
        var ref: EventHotKeyRef?
        let id = EventHotKeyID(signature: OSType(0x534e4b59), id: 0)
        let status = RegisterEventHotKey(Key.swingCode, controlKey.carbon, id,
                                         GetApplicationEventTarget(), 0, &ref)
        debugLog("스윙 핫키 \(controlKey.rawValue) status=\(status)")
        swingHotKey = ref
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

    /// 투구 키를 누르고 있는 동안만 던지고, 그 상태에서 스페이스를 누르면 휘두른다.
    /// 둘 다 **상태를 물어봐서** 안다 — 키 이벤트를 가로채지 않으므로 권한도 필요 없고,
    /// 다른 앱의 단축키(윈도우 Alt+Space 창 메뉴 같은)를 건드리지도 않는다.
    private func pollKeys() {
        let down = window.isVisible && NSEvent.modifierFlags.isSuperset(of: controlKey.flags)
        if down != holding {
            holding = down
            debugLog("hold \(down)")
            webView.evaluateJavaScript("window.__sneakyHold && window.__sneakyHold(\(down))")
        }
        updateMousePass(holding: down)

        // 수식키를 안 눌러도 좌표 변환이 맞는지 볼 수 있게 커서 상태만 따로 흘린다.
        let over = cursorInHitbox()
        if over != cursorWasOver {
            cursorWasOver = over
            debugLog("cursor over pitcher: \(over)")
        }
    }

    /// 커서가 투수 위에 있고 수식키를 누르고 있으면 그 순간만 마우스를 받는다.
    /// **클릭 통과에 파는 예외는 여기 한 군데뿐이다** — 그 밖의 모든 순간·모든 자리는
    /// 지금처럼 전부 밑의 앱으로 통과한다.
    private func updateMousePass(holding: Bool) {
        let wantPass = !(holding && cursorInHitbox())
        guard wantPass != passingThrough else { return }
        passingThrough = wantPass
        window.ignoresMouseEvents = wantPass
        debugLog("pass \(wantPass)")
    }

    /// NSEvent.mouseLocation 은 전역 좌표(왼쪽 아래 원점)다. 히트박스는 웹뷰가 준
    /// CSS 픽셀(창 왼쪽 위 원점)이라 창 기준으로 뒤집어 맞춘다.
    /// 상태를 물어볼 뿐이라 손쉬운 사용 권한이 필요 없다 — 수식키 폴링과 같은 성질이다.
    private func cursorInHitbox() -> Bool {
        guard hitbox.width > 0, window.isVisible else { return false }
        let mouse = NSEvent.mouseLocation
        let frame = window.frame
        return hitbox.contains(CGPoint(x: mouse.x - frame.minX, y: frame.maxY - mouse.y))
    }

    @objc private func toggleWindow() {
        if window.isVisible {
            window.orderOut(nil)
            if holding {
                holding = false
                webView.evaluateJavaScript("window.__sneakyHold && window.__sneakyHold(false)")
            }
            updateMousePass(holding: false)
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

        if body["type"] as? String == "hitbox" {
            hitbox = CGRect(
                x: body["x"] as? Double ?? 0, y: body["y"] as? Double ?? 0,
                width: body["w"] as? Double ?? 0, height: body["h"] as? Double ?? 0)
            debugLog("hitbox \(hitbox)")
            return
        }

        // 드래그로 놓은 값. 게임에 되밀 필요는 없고(이미 거기서 왔다) 메뉴 체크만 맞춘다.
        if body["type"] as? String == "pitcherX", let x = body["value"] as? Double {
            pitcherX = x
            refreshMenu()
            return
        }

        // 랭킹 신분을 처음 만들었거나(등록) 복구 코드로 바꿔 넣었을 때.
        if body["type"] as? String == "account" {
            guard let id = body["playerId"] as? String, let secret = body["secret"] as? String,
                  !id.isEmpty, !secret.isEmpty
            else { return }
            playerId = id
            playerSecret = secret
            nickname = body["nickname"] as? String
            // 줄에 선 타구는 그대로 둔다 — 진짜로 친 것이니 새 이름으로 올라가면 된다.
            pushGear()
            return
        }

        // 못 보낸 타구 줄이 바뀌었다. 저장만 한다.
        if body["type"] as? String == "pending", let list = body["hits"] as? [[String: Any]] {
            pendingHits = list
            return
        }

        // 타구 하나가 번 점수. **셸은 더하기만 한다** — 얼마를 주는지는 게임이 정한다.
        if body["type"] as? String == "earn", let gained = body["points"] as? Int, gained > 0 {
            points += gained
            // 응원은 유니폼을 입었을 때만 쌓이고, 한 번 쌓이면 줄지 않는다.
            if let team = body["team"] as? String, !team.isEmpty {
                var ledger = cheer
                ledger[team] = (ledger[team] ?? 0) + gained
                cheer = ledger
            }
            pushGear()
            return
        }

        // 배트 구매. **가격표는 셸에 두지 않는다** — 값은 상점(JS)이 순수 모듈에서 읽어
        // 보내고, 여기서는 「가진 돈으로 되는가 / 이미 가졌는가」만 본다.
        if body["type"] as? String == "buy",
           let key = body["key"] as? String, let price = body["price"] as? Int {
            guard !ownedBats.contains(key), price >= 0, points >= price else { return }
            points -= price
            ownedBats = ownedBats + [key]
            equippedBat = key // 사면 바로 낀다
            pushGear()
            return
        }

        if body["type"] as? String == "equip", let key = body["key"] as? String {
            guard ownedBats.contains(key) else { return }
            equippedBat = key
            pushGear()
            return
        }

        guard body["type"] as? String == "record" else { return }

        var changed = false
        if let meters = body["bestMeters"] as? Int, meters > bestMeters {
            bestMeters = meters
            changed = true
        }
        if let meters = body["bestGearedMeters"] as? Int, meters > bestGearedMeters {
            bestGearedMeters = meters
            changed = true
        }
        if changed { refreshMenu() }
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
