// Sneaky Baseball — Windows 셸.
//
// 게임은 전부 web\ 안의 HTML·Canvas·JS다. 이 파일은 그걸 얹을 창만 만든다:
// 바탕화면을 덮는 투명·클릭 통과 오버레이, 전역 단축키, 트레이 아이콘, 기록 저장.
// mac/Sources/main.swift 와 같은 일을 하고, 브리지(window.sneaky)도 같은 모양이다.

using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SneakyBaseball;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new OverlayContext());
    }
}

/// <summary>창을 띄우지 않는 트레이 앱. 폼을 닫아도 트레이로 살아 있는다.</summary>
sealed class OverlayContext : ApplicationContext
{
    private readonly Overlay overlay = new();
    private readonly NotifyIcon tray = new();

    public OverlayContext()
    {
        overlay.Show();

        tray.Icon = LoadIcon();
        tray.Text = "Sneaky Baseball";
        tray.Visible = true;
        tray.ContextMenuStrip = BuildMenu();
        overlay.RecordChanged += _ => tray.ContextMenuStrip = BuildMenu();
        overlay.KitChanged += () => tray.ContextMenuStrip = BuildMenu();
        overlay.SettingsChanged += () => tray.ContextMenuStrip = BuildMenu();
    }

    /// <summary>메뉴에 세울 구단 목록. src/render/teams.js 의 id·name 과 같아야 한다.</summary>
    private static readonly (string Id, string Name)[] Teams =
    {
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
    };

    private static Icon LoadIcon()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "icon.ico");
        return File.Exists(path) ? new Icon(path) : SystemIcons.Application;
    }

    private ContextMenuStrip BuildMenu()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add(new ToolStripMenuItem($"최고 비거리  {overlay.BestMeters}m") { Enabled = false });
        menu.Items.Add(new ToolStripMenuItem($"{overlay.HoldKey.Title} 를 누르고 있는 동안 투구") { Enabled = false });
        menu.Items.Add(new ToolStripMenuItem($"스윙  {overlay.HoldKey.Title} + Space") { Enabled = false });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(KitMenu("타자 팀", "batter"));
        menu.Items.Add(KitMenu("투수 팀", "pitcher"));
        menu.Items.Add(ControlKeyMenu());
        if (Screen.AllScreens.Length > 1) menu.Items.Add(ScreenMenu());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("숨기기 / 보이기  Ctrl+Shift+B", null, (_, _) => overlay.ToggleVisible()));
        menu.Items.Add(new ToolStripMenuItem("종료", null, (_, _) => Quit()));
        return menu;
    }

    /// <summary>「조작키 ▸」. 키보드마다 있는 키가 달라서 하나로 못 정한다.</summary>
    private ToolStripMenuItem ControlKeyMenu()
    {
        var root = new ToolStripMenuItem("조작키");
        foreach (var key in Overlay.HoldKeyOption.All)
        {
            var id = key.Id;
            root.DropDownItems.Add(new ToolStripMenuItem(key.Title, null, (_, _) => overlay.SetControlKey(id))
            {
                Checked = overlay.HoldKey.Id == id,
            });
        }
        return root;
    }

    /// <summary>「모니터 ▸」. 듀얼 모니터에서 어느 화면에 얹을지. 하나뿐이면 안 낸다.</summary>
    private ToolStripMenuItem ScreenMenu()
    {
        var root = new ToolStripMenuItem("모니터");
        var screens = Screen.AllScreens;
        for (var i = 0; i < screens.Length; i += 1)
        {
            var screen = screens[i];
            var size = screen.Bounds;
            var main = screen.Primary ? " (주 화면)" : "";
            var title = $"{i + 1}번  {size.Width}×{size.Height}{main}";
            var name = screen.DeviceName;
            root.DropDownItems.Add(new ToolStripMenuItem(title, null, (_, _) => overlay.SetScreen(name))
            {
                Checked = overlay.ChosenScreen().DeviceName == name,
            });
        }
        return root;
    }

    /// <summary>구단 10칸 + 홈·원정 라디오. 고른 팀이 없으면 홈·원정은 죽인다.</summary>
    private ToolStripMenuItem KitMenu(string title, string who)
    {
        var current = overlay.KitOf(who);
        var parts = current?.Split('-');
        var teamId = parts is { Length: 2 } ? parts[0] : null;
        var side = parts is { Length: 2 } ? parts[1] : "home";

        var root = new ToolStripMenuItem(title);
        root.DropDownItems.Add(new ToolStripMenuItem("유니폼 없음", null,
            (_, _) => overlay.SetKit(who, null)) { Checked = current is null });
        root.DropDownItems.Add(new ToolStripSeparator());

        foreach (var (id, name) in Teams)
        {
            root.DropDownItems.Add(new ToolStripMenuItem(name, null,
                (_, _) => overlay.SetKit(who, $"{id}-{side}")) { Checked = id == teamId });
        }
        root.DropDownItems.Add(new ToolStripSeparator());

        foreach (var (value, label) in new[] { ("home", "홈"), ("away", "원정") })
        {
            root.DropDownItems.Add(new ToolStripMenuItem(label, null,
                (_, _) => overlay.SetKit(who, $"{teamId}-{value}"))
            {
                Checked = value == side,
                Enabled = current is not null,
            });
        }
        return root;
    }

    private void Quit()
    {
        tray.Visible = false;
        overlay.Close();
        ExitThread();
    }
}

sealed class Overlay : Form
{
    // 창 스타일 — 레이어드(투명) + 마우스 통과 + 작업 표시줄에 안 뜸 + 포커스 안 가져감.
    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_LAYERED = 0x00080000;
    private const int WS_EX_TRANSPARENT = 0x00000020;
    private const int WS_EX_TOOLWINDOW = 0x00000080;
    private const int WS_EX_NOACTIVATE = 0x08000000;

    private const int WM_HOTKEY = 0x0312;
    private const int MOD_CONTROL = 0x0002;
    private const int MOD_SHIFT = 0x0004;
    private const int MOD_NOREPEAT = 0x4000;
    private const int VK_SPACE = 0x20;
    private const int VK_B = 0x42;

    private const int HOTKEY_SWING = 1;
    private const int HOTKEY_TOGGLE = 2;

    [DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll")] private static extern int SetWindowLong(IntPtr hWnd, int index, int value);
    [DllImport("user32.dll")] private static extern bool RegisterHotKey(IntPtr hWnd, int id, int mod, int vk);
    [DllImport("user32.dll")] private static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int vKey);
    [StructLayout(LayoutKind.Sequential)] private struct POINT { public int X, Y; }
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out POINT p);

    /// <summary>
    /// 투구를 누르고 있을 수식키. 예전엔 Alt 고정이었는데 <b>Alt+Space 를 윈도우가 창 시스템
    /// 메뉴로 먼저 가져가서</b> 타격이 아예 안 왔고, Alt 를 떼면 크롬이 제 메뉴를 열었다.
    /// 오른쪽 Alt 는 한/영 키이기도 하다. 조합마다 뺏어 가는 앱이 달라 고르게 한다.
    ///
    /// 누르고 있는지는 <b>상태를 물어봐서</b> 알고(권한 불필요), 스윙은 `수식키+Space` 를
    /// <b>전역 핫키로 잡는다</b>. 핫키는 키를 삼키므로 스페이스가 아래 앱에 새지 않는다.
    /// </summary>
    public sealed record HoldKeyOption(string Id, string Title, string Hint, int Mods, int[] Vks)
    {
        private const int ALT = 0x0001, CTRL = 0x0002, SHIFT = 0x0004;
        private const int VK_SHIFT = 0x10, VK_CTRL = 0x11, VK_ALT = 0x12;

        public static readonly HoldKeyOption[] All =
        {
            // Alt 는 좌우 아무거나. 다만 Alt+Space 는 윈도우가 창 메뉴를 함께 열고,
            // Alt 를 떼면 크롬 같은 앱이 자기 메뉴를 연다 — 그걸 감수하고 쓰는 기본값이다.
            // 걸리는 사람은 트레이에서 다른 조합으로 바꾸면 된다.
            new("option", "Alt", "Alt 누르고 SPACE", ALT, new[] { VK_ALT }),
            new("optionShift", "Alt+Shift", "Alt+Shift 누르고 SPACE", ALT | SHIFT, new[] { VK_ALT, VK_SHIFT }),
            new("controlOption", "Ctrl+Alt", "Ctrl+Alt 누르고 SPACE", CTRL | ALT, new[] { VK_CTRL, VK_ALT }),
            new("control", "Ctrl", "Ctrl 누르고 SPACE", CTRL, new[] { VK_CTRL }),
            new("shift", "Shift", "Shift 누르고 SPACE", SHIFT, new[] { VK_SHIFT }),
        };

        public static HoldKeyOption Find(string? id) => Array.Find(All, k => k.Id == id) ?? All[0];
    }

    /// <summary>게임 화면에는 없는 색. 이 색 픽셀이 통째로 뚫린다.</summary>
    private static readonly Color KeyColor = Color.FromArgb(255, 0, 255);

    private readonly WebView2 web = new();
    private readonly System.Windows.Forms.Timer holdTimer = new() { Interval = 16 };
    private readonly string statePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SneakyBaseball", "state.json");

    private bool holding;
    private bool ready;

    /// <summary>투수를 잡을 수 있는 자리 — <b>게임이 알려준다</b>(CSS 픽셀, 창 왼쪽 위 기준).</summary>
    private Rectangle hitbox = Rectangle.Empty;
    /// <summary>지금 클릭이 창을 통과하고 있는가. 매 프레임 창을 건드리지 않으려고 들고 있는다.</summary>
    private bool passingThrough = true;

    /// <summary>
    /// 투수가 선 자리(필드 상자 가로 비율). 플레이어가 드래그로 옮긴다.
    /// 옮기면 던지는 거리가 바뀌고, 거리가 곧 투구 시간이다.
    /// </summary>
    private const double DefaultPitcherX = 0.87;
    public double PitcherX { get; private set; } = DefaultPitcherX;

    public int BestMeters { get; private set; }
    public event Action<int>? RecordChanged;

    /// <summary>'lg-home' 같은 키. null 이면 유니폼 없음(검은 실루엣).</summary>
    /// <summary>처음 깔았을 때 입고 나오는 유니폼. 타자·투수를 홈·원정으로 갈라 둬야 둘이 구분된다.</summary>
    private const string DefaultBatterKit = "lotte-home";
    private const string DefaultPitcherKit = "lotte-away";
    /// <summary>
    /// 「유니폼 없음」을 <b>고른 것</b>과 아직 안 고른 것은 다르다. null 로 지워 버리면
    /// 다음 실행에 기본값이 다시 입혀지므로, 없음도 값으로 저장한다.
    /// </summary>
    private const string NoKit = "none";

    public string? BatterKit { get; private set; } = DefaultBatterKit;
    public string? PitcherKit { get; private set; } = DefaultPitcherKit;
    public event Action? KitChanged;

    public string? KitOf(string who) => who == "batter" ? BatterKit : PitcherKit;

    /// <summary>투구 키. 안 고르면 우측 Ctrl.</summary>
    public HoldKeyOption HoldKey { get; private set; } = HoldKeyOption.All[0];

    /// <summary>얹을 모니터의 장치 이름. 없거나 사라졌으면 주 화면.</summary>
    public string? ScreenName { get; private set; }
    public event Action? SettingsChanged;

    public void SetControlKey(string id)
    {
        HoldKey = HoldKeyOption.Find(id);
        WriteState();
        if (IsHandleCreated) RegisterSwingHotKey();
        _ = web.ExecuteScriptAsync($"window.__sneakyHint && window.__sneakyHint('{HoldKey.Hint}')");
        SettingsChanged?.Invoke();
    }

    /// <summary>고른 모니터. 케이블을 뽑았으면 주 화면으로 돌아간다.</summary>
    public Screen ChosenScreen() =>
        Array.Find(Screen.AllScreens, s => s.DeviceName == ScreenName)
        ?? Screen.PrimaryScreen
        ?? Screen.AllScreens[0];

    public void SetScreen(string deviceName)
    {
        ScreenName = deviceName;
        WriteState();
        Bounds = ChosenScreen().WorkingArea;
        SettingsChanged?.Invoke();
    }

    public void SetKit(string who, string? key)
    {
        if (who == "batter") BatterKit = key; else PitcherKit = key;
        WriteState();

        // Send 는 숨어 있을 때 삼켜 버린다. 유니폼은 숨긴 채로도 바꿀 수 있어야 하므로
        // 보이는지와 무관하게 밀어 넣는다 — 다시 띄웠을 때 이미 갈아입고 있다.
        var literal = key is null ? "null" : $"'{key}'";
        if (ready) _ = web.ExecuteScriptAsync($"window.__sneakyKit && window.__sneakyKit('{who}', {literal})");
        KitChanged?.Invoke();
    }

    public Overlay()
    {
        ReadState();

        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        // 작업 표시줄 자리는 비워 둔다.
        Bounds = ChosenScreen().WorkingArea;
        BackColor = KeyColor;
        TransparencyKey = KeyColor;

        web.Dock = DockStyle.Fill;
        web.DefaultBackgroundColor = Color.Transparent;
        Controls.Add(web);

        holdTimer.Tick += (_, _) => PollKeys();
        holdTimer.Start();

        _ = InitWebAsync();
    }

    protected override CreateParams CreateParams
    {
        get
        {
            var p = base.CreateParams;
            p.ExStyle |= WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
            return p;
        }
    }

    /// <summary>클릭이 창을 그냥 통과하도록. 아래 앱에서 하던 일이 끊기면 안 된다.</summary>
    protected override bool ShowWithoutActivation => true;

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        SetWindowLong(Handle, GWL_EXSTYLE,
            GetWindowLong(Handle, GWL_EXSTYLE) | WS_EX_LAYERED | WS_EX_TRANSPARENT);

        RegisterSwingHotKey();
        RegisterHotKey(Handle, HOTKEY_TOGGLE, MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT, VK_B);
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        UnregisterHotKey(Handle, HOTKEY_SWING);
        UnregisterHotKey(Handle, HOTKEY_TOGGLE);
        base.OnFormClosed(e);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_HOTKEY)
        {
            if ((int)m.WParam == HOTKEY_SWING) Send("window.__sneakySwing && window.__sneakySwing()");
            else ToggleVisible();
        }
        base.WndProc(ref m);
    }

    // MARK: 웹뷰

    private async Task InitWebAsync()
    {
        // 사용자 폴더에 캐시를 둔다. 실행 파일 옆에 쓰려 하면 Program Files 에서 막힌다.
        var data = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SneakyBaseball");
        var env = await CoreWebView2Environment.CreateAsync(null, data);
        await web.EnsureCoreWebView2Async(env);

        var core = web.CoreWebView2;
        // file:// 로 열면 ES 모듈 import 가 막힌다. 가상 호스트로 폴더를 얹는다.
        core.SetVirtualHostNameToFolderMapping(
            "sneaky.app", Path.Combine(AppContext.BaseDirectory, "web"),
            CoreWebView2HostResourceAccessKind.Allow);

        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreDevToolsEnabled = false;

        await core.AddScriptToExecuteOnDocumentCreatedAsync(BridgeScript());
        core.WebMessageReceived += OnWebMessage;

        core.Navigate("https://sneaky.app/renderer/index.html");
        ready = true;
    }

    /// <summary>렌더러가 기대하는 window.sneaky. mac 셸과 같은 모양이다.</summary>
    private string BridgeScript()
    {
        var batter = BatterKit is null ? "null" : $"'{BatterKit}'";
        var pitcher = PitcherKit is null ? "null" : $"'{PitcherKit}'";
        return $$"""
        window.sneaky = {
          keyHint: '{{HoldKey.Hint}}',
          kits: { batter: {{batter}}, pitcher: {{pitcher}} },
          getRecord: () => Promise.resolve({ bestMeters: {{BestMeters}} }),
          saveRecord: (record) => window.chrome.webview.postMessage({
            type: 'record', bestMeters: record && record.bestMeters,
          }),
          onSwing: (handler) => { window.__sneakySwing = handler },
          onHint: (handler) => { window.__sneakyHint = handler },
          onHold: (handler) => { window.__sneakyHold = handler },
          onKit: (handler) => { window.__sneakyKit = handler },
          pitcherX: {{PitcherX}},
          savePitcherX: (x) => window.chrome.webview.postMessage({
            type: 'pitcherX', value: x,
          }),
          setHitbox: (box) => window.chrome.webview.postMessage({
            type: 'hitbox', x: box.x, y: box.y, w: box.w, h: box.h,
          }),
          onPitcherX: (handler) => { window.__sneakyPitcherX = handler },
        }
        """;
    }

    private void Send(string script)
    {
        if (ready && Visible) _ = web.ExecuteScriptAsync(script);
    }

    // MARK: 입력

    /// <summary>
    /// 투구 키를 누르고 있는 동안만 던지고, 그 상태에서 스페이스를 누르면 휘두른다.
    /// 둘 다 상태를 물어봐서 안다 — 키를 가로채지 않으므로 아래 앱의 입력이 그대로 산다.
    /// </summary>
    private void PollKeys()
    {
        var down = Visible && Array.TrueForAll(HoldKey.Vks, vk => (GetAsyncKeyState(vk) & 0x8000) != 0);
        if (down != holding)
        {
            holding = down;
            Send($"window.__sneakyHold && window.__sneakyHold({(down ? "true" : "false")})");
        }
        UpdateMousePass(down);
    }

    /// <summary>
    /// 커서가 투수 위에 있고 수식키를 누르고 있으면 그 순간만 마우스를 받는다.
    /// <b>클릭 통과에 파는 예외는 여기 한 군데뿐이다</b> — 그 밖의 모든 순간·모든 자리는
    /// 지금처럼 전부 밑의 앱으로 통과한다. 통과는 WS_EX_TRANSPARENT 비트 하나다.
    /// </summary>
    private void UpdateMousePass(bool down)
    {
        var wantPass = !(down && CursorInHitbox());
        if (wantPass == passingThrough) return;
        passingThrough = wantPass;

        var style = GetWindowLong(Handle, GWL_EXSTYLE);
        SetWindowLong(Handle, GWL_EXSTYLE,
            wantPass ? style | WS_EX_TRANSPARENT : style & ~WS_EX_TRANSPARENT);
    }

    /// <summary>
    /// GetCursorPos 는 화면 좌표다. 히트박스는 창 왼쪽 위 기준이라 옮겨 맞춘다.
    /// 상태를 물어볼 뿐이라 권한이 필요 없다 — 수식키 폴링과 같은 성질이다.
    /// </summary>
    private bool CursorInHitbox()
    {
        if (hitbox.Width <= 0 || !Visible) return false;
        if (!GetCursorPos(out var p)) return false;
        return hitbox.Contains(new Point(p.X - Bounds.Left, p.Y - Bounds.Top));
    }

    /// <summary>스윙 핫키. 조작키를 바꾸면 옛것을 풀고 새로 건다.</summary>
    private void RegisterSwingHotKey()
    {
        UnregisterHotKey(Handle, HOTKEY_SWING);
        RegisterHotKey(Handle, HOTKEY_SWING, HoldKey.Mods | MOD_NOREPEAT, VK_SPACE);
    }

    public void ToggleVisible()
    {
        if (Visible)
        {
            Hide();
            if (holding)
            {
                holding = false;
                _ = web.ExecuteScriptAsync("window.__sneakyHold && window.__sneakyHold(false)");
            }
            UpdateMousePass(false);
        }
        else Show();
    }

    // MARK: 저장

    private void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            var body = JsonDocument.Parse(e.WebMessageAsJson).RootElement;
            var type = body.GetProperty("type").GetString();

            if (type == "hitbox")
            {
                hitbox = new Rectangle(
                    (int)body.GetProperty("x").GetDouble(), (int)body.GetProperty("y").GetDouble(),
                    (int)body.GetProperty("w").GetDouble(), (int)body.GetProperty("h").GetDouble());
                return;
            }

            if (type == "pitcherX")
            {
                PitcherX = body.GetProperty("value").GetDouble();
                WriteState();
                return;
            }

            if (type != "record") return;
            var meters = body.GetProperty("bestMeters").GetInt32();
            if (meters <= BestMeters) return;

            BestMeters = meters;
            WriteState();
            RecordChanged?.Invoke(meters);
        }
        catch
        {
            // 저장에 실패해도 게임은 계속된다.
        }
    }

    /// <summary>저장된 값을 키로. "none" 은 사용자가 고른 「유니폼 없음」이다.</summary>
    private static string? Stored(string? value) => value == NoKit ? null : value;

    private void ReadState()
    {
        try
        {
            var json = JsonDocument.Parse(File.ReadAllText(statePath)).RootElement;
            BestMeters = json.TryGetProperty("bestMeters", out var m) ? m.GetInt32() : 0;
            BatterKit = json.TryGetProperty("batterKit", out var b) ? Stored(b.GetString()) : DefaultBatterKit;
            PitcherKit = json.TryGetProperty("pitcherKit", out var p) ? Stored(p.GetString()) : DefaultPitcherKit;
            HoldKey = HoldKeyOption.Find(json.TryGetProperty("controlKey", out var c) ? c.GetString() : null);
            ScreenName = json.TryGetProperty("screen", out var sc) ? sc.GetString() : null;
            PitcherX = json.TryGetProperty("pitcherX", out var px) ? px.GetDouble() : DefaultPitcherX;
        }
        catch { BestMeters = 0; PitcherX = DefaultPitcherX; }
    }

    private void WriteState()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(statePath)!);
            File.WriteAllText(statePath, JsonSerializer.Serialize(new
            {
                bestMeters = BestMeters,
                batterKit = BatterKit ?? NoKit,
                pitcherKit = PitcherKit ?? NoKit,
                controlKey = HoldKey.Id,
                screen = ScreenName,
                pitcherX = PitcherX,
            }));
        }
        catch { }
    }
}
