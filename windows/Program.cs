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
        menu.Items.Add(new ToolStripMenuItem("Alt 를 누르고 있는 동안 투구") { Enabled = false });
        menu.Items.Add(new ToolStripMenuItem("스윙  Alt+Space") { Enabled = false });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(KitMenu("타자 팀", "batter"));
        menu.Items.Add(KitMenu("투수 팀", "pitcher"));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("숨기기 / 보이기  Ctrl+Shift+B", null, (_, _) => overlay.ToggleVisible()));
        menu.Items.Add(new ToolStripMenuItem("종료", null, (_, _) => Quit()));
        return menu;
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
    private const int MOD_ALT = 0x0001;
    private const int MOD_CONTROL = 0x0002;
    private const int MOD_SHIFT = 0x0004;
    private const int MOD_NOREPEAT = 0x4000;
    private const int VK_SPACE = 0x20;
    private const int VK_B = 0x42;
    private const int VK_MENU = 0x12; // Alt

    private const int HOTKEY_SWING = 1;
    private const int HOTKEY_TOGGLE = 2;

    [DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll")] private static extern int SetWindowLong(IntPtr hWnd, int index, int value);
    [DllImport("user32.dll")] private static extern bool RegisterHotKey(IntPtr hWnd, int id, int mod, int vk);
    [DllImport("user32.dll")] private static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int vKey);

    /// <summary>게임 화면에는 없는 색. 이 색 픽셀이 통째로 뚫린다.</summary>
    private static readonly Color KeyColor = Color.FromArgb(255, 0, 255);

    private readonly WebView2 web = new();
    private readonly System.Windows.Forms.Timer holdTimer = new() { Interval = 33 };
    private readonly string statePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SneakyBaseball", "state.json");

    private bool holding;
    private bool ready;

    public int BestMeters { get; private set; }
    public event Action<int>? RecordChanged;

    /// <summary>'lg-home' 같은 키. null 이면 유니폼 없음(검은 실루엣).</summary>
    public string? BatterKit { get; private set; }
    public string? PitcherKit { get; private set; }
    public event Action? KitChanged;

    public string? KitOf(string who) => who == "batter" ? BatterKit : PitcherKit;

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
        Bounds = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1440, 900);
        BackColor = KeyColor;
        TransparencyKey = KeyColor;

        web.Dock = DockStyle.Fill;
        web.DefaultBackgroundColor = Color.Transparent;
        Controls.Add(web);

        holdTimer.Tick += (_, _) => PollHoldKey();
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

        RegisterHotKey(Handle, HOTKEY_SWING, MOD_ALT | MOD_NOREPEAT, VK_SPACE);
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
          keyHint: 'Alt 누르고 Space',
          kits: { batter: {{batter}}, pitcher: {{pitcher}} },
          getRecord: () => Promise.resolve({ bestMeters: {{BestMeters}} }),
          saveRecord: (record) => window.chrome.webview.postMessage({
            type: 'record', bestMeters: record && record.bestMeters,
          }),
          onSwing: (handler) => { window.__sneakySwing = handler },
          onHold: (handler) => { window.__sneakyHold = handler },
          onKit: (handler) => { window.__sneakyKit = handler },
        }
        """;
    }

    private void Send(string script)
    {
        if (ready && Visible) _ = web.ExecuteScriptAsync(script);
    }

    // MARK: 입력

    /// <summary>Alt 를 누르고 있는 동안만 투수가 던진다. 상태만 읽으므로 권한이 필요 없다.</summary>
    private void PollHoldKey()
    {
        var down = Visible && (GetAsyncKeyState(VK_MENU) & 0x8000) != 0;
        if (down == holding) return;
        holding = down;
        Send($"window.__sneakyHold && window.__sneakyHold({(down ? "true" : "false")})");
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
        }
        else Show();
    }

    // MARK: 저장

    private void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            var body = JsonDocument.Parse(e.WebMessageAsJson).RootElement;
            if (body.GetProperty("type").GetString() != "record") return;
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

    private void ReadState()
    {
        try
        {
            var json = JsonDocument.Parse(File.ReadAllText(statePath)).RootElement;
            BestMeters = json.TryGetProperty("bestMeters", out var m) ? m.GetInt32() : 0;
            BatterKit = json.TryGetProperty("batterKit", out var b) ? b.GetString() : null;
            PitcherKit = json.TryGetProperty("pitcherKit", out var p) ? p.GetString() : null;
        }
        catch { BestMeters = 0; }
    }

    private void WriteState()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(statePath)!);
            File.WriteAllText(statePath, JsonSerializer.Serialize(new
            {
                bestMeters = BestMeters,
                batterKit = BatterKit,
                pitcherKit = PitcherKit,
            }));
        }
        catch { }
    }
}
