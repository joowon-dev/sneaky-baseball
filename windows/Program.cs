// Sneaky Baseball — Windows 셸.
//
// 게임은 전부 web\ 안의 HTML·Canvas·JS다. 이 파일은 그걸 얹을 창만 만든다:
// 바탕화면을 덮는 투명·클릭 통과 오버레이, 전역 단축키, 트레이 아이콘, 기록 저장.
// mac/Sources/main.swift 와 같은 일을 하고, 브리지(window.sneaky)도 같은 모양이다.

using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Net.Http;
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
        overlay.GearChanged += () => tray.ContextMenuStrip = BuildMenu();
        overlay.UpdateChanged += () => tray.ContextMenuStrip = BuildMenu();
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

    /// <summary>
    /// 「투수 거리 ▸」가 고르게 하는 단계. <b>값은 src/game/pitches.js 의 PITCHER_X_STEPS 와
    /// 같아야 한다</b> — C# 은 그 파일을 못 읽어서 손으로 맞춰 둔다.
    /// 당기면 공이 일찍 오고, 밀면 늦게 온다.
    /// </summary>
    private static readonly (double X, string Title)[] PitcherSteps =
    {
        (0.81, "제일 가깝게"),
        (0.84, "가깝게"),
        (0.87, "기본"),
        (0.90, "멀게"),
        (0.93, "제일 멀게"),
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
        if (overlay.BestGearedMeters > overlay.BestMeters)
            menu.Items.Add(new ToolStripMenuItem($"장비 기록  {overlay.BestGearedMeters}m") { Enabled = false });
        menu.Items.Add(new ToolStripMenuItem($"보유 포인트  {overlay.Points}P") { Enabled = false });
        menu.Items.Add(new ToolStripMenuItem($"{overlay.HoldKey.Title} 를 누르고 있는 동안 투구") { Enabled = false });
        menu.Items.Add(new ToolStripMenuItem($"스윙  {overlay.HoldKey.Title} + Space") { Enabled = false });
        menu.Items.Add(new ToolStripSeparator());
        // 1단계 — 새 버전이 있을 때만 낸다. 없으면 메뉴에 아무 흔적도 없다.
        if (overlay.UpdateVersion is not null)
        {
            menu.Items.Add(new ToolStripMenuItem(
                overlay.UpdateNote ?? $"새 버전 {overlay.UpdateVersion} 설치",
                null, (_, _) => overlay.InstallUpdate())
            { Enabled = !overlay.Updating });
            menu.Items.Add(new ToolStripSeparator());
        }
        menu.Items.Add(new ToolStripMenuItem("배트 상점…", null, (_, _) => overlay.OpenShop("bats")));
        menu.Items.Add(new ToolStripMenuItem("응원 랭킹…", null, (_, _) => overlay.OpenShop("rank")));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(KitMenu("타자 팀", "batter"));
        menu.Items.Add(KitMenu("투수 팀", "pitcher"));
        menu.Items.Add(ControlKeyMenu());
        menu.Items.Add(PitcherMenu());
        if (Screen.AllScreens.Length > 1) menu.Items.Add(ScreenMenu());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("숨기기 / 보이기  Ctrl+Shift+B", null, (_, _) => overlay.ToggleVisible()));
        menu.Items.Add(new ToolStripMenuItem("종료", null, (_, _) => Quit()));
        return menu;
    }

    /// <summary>
    /// 「투수 거리 ▸」. 드래그와 같은 값을 본다 — 끌어서 옮기면 여기 체크도 따라온다.
    /// 드래그는 연속값이라 단계와 정확히 안 맞을 수 있어 <b>가장 가까운 단계</b>에 찍는다.
    /// </summary>
    private ToolStripMenuItem PitcherMenu()
    {
        var root = new ToolStripMenuItem("투수 거리");
        var current = overlay.PitcherX;
        var nearest = PitcherSteps[0].X;
        foreach (var step in PitcherSteps)
            if (Math.Abs(step.X - current) < Math.Abs(nearest - current)) nearest = step.X;

        foreach (var step in PitcherSteps)
        {
            var x = step.X;
            root.DropDownItems.Add(new ToolStripMenuItem(step.Title, null, (_, _) => overlay.SetPitcherX(x))
            {
                Checked = x == nearest,
            });
        }
        return root;
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
    /// <summary>
    /// 장비를 끼고 세운 기록. 맨몸 기록과 따로 둔다 — 배트를 사면 홈런이 쉬워지므로
    /// 한 칸에 섞으면 옛 기록과 새 기록의 잣대가 달라진다.
    /// </summary>
    public int BestGearedMeters { get; private set; }
    public event Action<int>? RecordChanged;

    /// <summary>지갑. 안타·홈런으로 쌓이고 배트를 사면 준다.</summary>
    public int Points { get; private set; }
    /// <summary>가진 배트. 맨손(bare)은 언제나 가지고 있다.</summary>
    private List<string> owned = new() { DefaultBat };
    private string equipped = DefaultBat;
    /// <summary>구단별 응원 원장. <b>줄어드는 일이 없다</b> — 배트를 사도 그대로다.</summary>
    private Dictionary<string, int> cheer = new();
    private const string DefaultBat = "bare";

    /// <summary>
    /// 랭킹에 쓰는 신분. 계정이 아니라 <b>기기가 만든 무작위 한 쌍</b>이다 —
    /// 이메일도 비밀번호도 없고, 둘을 이어 붙인 것이 사용자가 보는 「복구 코드」다.
    /// </summary>
    private string? playerId;
    private string? playerSecret;
    private string? nickname;
    /// <summary>
    /// 아직 못 보낸 타구 줄. 평소에는 칠 때마다 바로 올라가고, 못 보낸 것만 여기 남는다.
    /// 저장은 셸이 하고, 보내는 일은 게임이 한다 — 그래서 모양을 들여다보지 않고 그대로 실어 나른다.
    /// </summary>
    private JsonElement? pendingHits;
    public event Action? GearChanged;

    /// <summary>상점 — 오버레이가 아니라 보통 창이다. 클릭 통과에 예외를 파지 않는다.</summary>
    private ShopWindow? shop;
    private CoreWebView2Environment? env;

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

    /// <summary>
    /// 트레이에서 고른 투수 거리. 창이 숨어 있어도 밀어 넣는다 —
    /// 다시 띄웠을 때 이미 옮겨져 있어야 한다.
    /// </summary>
    public void SetPitcherX(double x)
    {
        PitcherX = x;
        WriteState();
        if (ready)
        {
            var v = x.ToString(CultureInfo.InvariantCulture);
            _ = web.ExecuteScriptAsync($"window.__sneakyPitcherX && window.__sneakyPitcherX({v})");
        }
        SettingsChanged?.Invoke();
    }

    public void SetKit(string who, string? key)
    {
        if (who == "batter") BatterKit = key; else PitcherKit = key;
        WriteState();

        // Send 는 숨어 있을 때 삼켜 버린다. 유니폼은 숨긴 채로도 바꿀 수 있어야 하므로
        // 보이는지와 무관하게 밀어 넣는다 — 다시 띄웠을 때 이미 갈아입고 있다.
        var literal = key is null ? "null" : $"'{key}'";
        var script = $"window.__sneakyKit && window.__sneakyKit('{who}', {literal})";
        if (ready) _ = web.ExecuteScriptAsync(script);
        // 상점의 미리보기도 같이 갈아입는다 — 거기 선 타자가 곧 타석에 설 타자다.
        shop?.Send(script);
        KitChanged?.Invoke();
    }

    /// <summary>
    /// 두 창에 실어 보낼 지갑. <b>손으로 조립하지 않고 직렬화한다</b> — 따옴표가 하나만 새도
    /// window.sneaky 가 통째로 안 만들어지고, 게임은 조용히 핫키까지 잃는다.
    /// </summary>
    private string GearJson() => JsonSerializer.Serialize(new
    {
        points = Points,
        owned,
        equipped,
        cheer,
        pending = pendingHits,
        // 랭킹 신분은 있을 때만 싣는다. 없으면 게임이 처음 보낼 때 만든다.
        account = playerId is null || playerSecret is null
            ? null
            : new { playerId, secret = playerSecret, nickname = nickname ?? "" },
    });

    /// <summary>
    /// 지갑이 바뀌면 <b>두 창 모두</b>에 밀어 넣는다 — 게임에서 번 포인트가 열려 있는 상점에
    /// 바로 보이고, 상점에서 바꿔 낀 배트가 바로 타석에 선다.
    /// </summary>
    private void PushGear()
    {
        WriteState();
        var script = $"window.__sneakyGear && window.__sneakyGear({GearJson()})";
        if (ready) _ = web.ExecuteScriptAsync(script);
        shop?.Send(script);
        GearChanged?.Invoke();
    }

    /// <summary>
    /// 「배트 상점」과 「응원 랭킹」. 오버레이와 달리 <b>마우스를 받는 보통 창</b>이고,
    /// 둘은 <b>같은 창의 다른 탭</b>이다 — 창을 둘로 두면 지갑도 둘이 된다.
    /// 한 번 만들면 들고 있다가 다시 띄운다.
    /// </summary>
    public void OpenShop(string view = "bats")
    {
        if (shop is { IsDisposed: false })
        {
            shop.Show();
            shop.BringToFront();
            shop.Activate();
            // 이미 떠 있으면 창을 새로 열지 않고 탭만 바꾼다.
            shop.Send($"window.__sneakyView && window.__sneakyView('{view}')");
            return;
        }
        shop = new ShopWindow(env, BridgeScript(), OnWebMessage, view);
        shop.Show();
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

        // 켠 지 20초 뒤에 한 번, 그 뒤로는 하루 한 번.
        var firstCheck = new System.Windows.Forms.Timer { Interval = 20_000 };
        firstCheck.Tick += (_, _) => { firstCheck.Stop(); _ = CheckForUpdateAsync(); };
        firstCheck.Start();
        updateTimer.Tick += (_, _) => _ = CheckForUpdateAsync();
        updateTimer.Start();

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
        env = await CoreWebView2Environment.CreateAsync(null, data);
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
        // 소수점은 반드시 마침표여야 한다 — 쉼표를 쓰는 로캘에서 0,87 로 찍히면
        // 브리지 스크립트가 통째로 문법 오류가 난다.
        var px = PitcherX.ToString(CultureInfo.InvariantCulture);
        return $$"""
        window.sneaky = {
          keyHint: '{{HoldKey.Hint}}',
          kits: { batter: {{batter}}, pitcher: {{pitcher}} },
          getRecord: () => Promise.resolve({
            bestMeters: {{BestMeters}}, bestGearedMeters: {{BestGearedMeters}},
          }),
          saveRecord: (record) => window.chrome.webview.postMessage({
            type: 'record',
            bestMeters: record && record.bestMeters,
            bestGearedMeters: record && record.bestGearedMeters,
          }),
          gear: {{GearJson()}},
          earn: (e) => window.chrome.webview.postMessage({
            type: 'earn', points: e.points, team: e.team,
          }),
          buyBat: (b) => window.chrome.webview.postMessage({
            type: 'buy', key: b.key, price: b.price,
          }),
          equipBat: (key) => window.chrome.webview.postMessage({
            type: 'equip', key,
          }),
          onGear: (handler) => { window.__sneakyGear = handler },
          saveAccount: (a) => window.chrome.webview.postMessage({
            type: 'account', playerId: a.playerId, secret: a.secret, nickname: a.nickname,
          }),
          savePending: (hits) => window.chrome.webview.postMessage({
            type: 'pending', hits,
          }),
          scored: () => window.chrome.webview.postMessage({ type: 'scored' }),
          onSwing: (handler) => { window.__sneakySwing = handler },
          onHint: (handler) => { window.__sneakyHint = handler },
          onHold: (handler) => { window.__sneakyHold = handler },
          onKit: (handler) => { window.__sneakyKit = handler },
          pitcherX: {{px}},
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

            // 드래그로 놓은 값. 게임에 되밀 필요는 없고(이미 거기서 왔다) 메뉴 체크만 맞춘다.
            if (type == "pitcherX")
            {
                PitcherX = body.GetProperty("value").GetDouble();
                WriteState();
                SettingsChanged?.Invoke();
                return;
            }

            // 랭킹 신분을 처음 만들었거나(등록) 복구 코드로 바꿔 넣었을 때.
            if (type == "account")
            {
                var id = body.GetProperty("playerId").GetString();
                var secret = body.GetProperty("secret").GetString();
                if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(secret)) return;
                playerId = id;
                playerSecret = secret;
                nickname = body.TryGetProperty("nickname", out var nk) ? nk.GetString() : null;
                // 줄에 선 타구는 그대로 둔다 — 진짜로 친 것이니 새 이름으로 올라가면 된다.
                PushGear();
                return;
            }

            // 타구 하나가 서버에 합산됐다. 열려 있는 랭킹만 다시 읽게 한다.
            if (type == "scored")
            {
                shop?.Send("window.__sneakyScored && window.__sneakyScored()");
                return;
            }

            // 못 보낸 타구 줄이 바뀌었다. 저장만 한다.
            if (type == "pending")
            {
                if (body.TryGetProperty("hits", out var hits) && hits.ValueKind == JsonValueKind.Array)
                {
                    pendingHits = hits.Clone();
                    WriteState();
                }
                return;
            }

            // 타구 하나가 번 점수. <b>셸은 더하기만 한다</b> — 얼마를 주는지는 게임이 정한다.
            if (type == "earn")
            {
                var gained = body.GetProperty("points").GetInt32();
                if (gained <= 0) return;
                Points += gained;
                // 응원은 유니폼을 입었을 때만 쌓이고, 한 번 쌓이면 줄지 않는다.
                var team = body.TryGetProperty("team", out var t) ? t.GetString() : null;
                if (!string.IsNullOrEmpty(team))
                    cheer[team] = (cheer.TryGetValue(team, out var had) ? had : 0) + gained;
                PushGear();
                return;
            }

            // 배트 구매. <b>가격표는 셸에 두지 않는다</b> — 값은 상점(JS)이 순수 모듈에서
            // 읽어 보내고, 여기서는 「가진 돈으로 되는가 / 이미 가졌는가」만 본다.
            if (type == "buy")
            {
                var key = body.GetProperty("key").GetString();
                var price = body.GetProperty("price").GetInt32();
                if (key is null || owned.Contains(key) || price < 0 || Points < price) return;
                Points -= price;
                owned.Add(key);
                equipped = key; // 사면 바로 낀다
                PushGear();
                return;
            }

            if (type == "equip")
            {
                var key = body.GetProperty("key").GetString();
                if (key is null || !owned.Contains(key)) return;
                equipped = key;
                PushGear();
                return;
            }

            if (type != "record") return;

            var changed = false;
            if (body.TryGetProperty("bestMeters", out var bm)
                && bm.ValueKind == JsonValueKind.Number && bm.GetInt32() > BestMeters)
            {
                BestMeters = bm.GetInt32();
                changed = true;
            }
            if (body.TryGetProperty("bestGearedMeters", out var gm)
                && gm.ValueKind == JsonValueKind.Number && gm.GetInt32() > BestGearedMeters)
            {
                BestGearedMeters = gm.GetInt32();
                changed = true;
            }
            if (!changed) return;

            WriteState();
            RecordChanged?.Invoke(BestMeters);
        }
        catch
        {
            // 저장에 실패해도 게임은 계속된다.
        }
    }

    // MARK: 업데이트
    //
    // <b>두 단계로 나눠 뒀다.</b> 1단계는 「새 버전이 있다」고 알리는 것뿐이고,
    // 2단계는 눌렀을 때 설치본을 받아 조용히 다시 까는 것이다. 눌러야만 깐다 —
    // 몰래 하는 게임에 자동 재시작만큼 눈에 띄는 것도 없다.

    private const string ReleaseApi = "https://api.github.com/repos/joowon-dev/sneaky-baseball/releases/latest";
    private const string ReleasePage = "https://github.com/joowon-dev/sneaky-baseball/releases/latest";
    /// <summary>자동 업데이트가 받아 가는 것은 설치본이다 — zip 은 사람이 직접 풀 때 쓴다.</summary>
    private const string WinAssetSuffix = "-win-Setup.exe";

    private static readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(20) };
    private readonly System.Windows.Forms.Timer updateTimer = new() { Interval = 24 * 60 * 60 * 1000 };

    public string? UpdateVersion { get; private set; }
    public string? UpdateNote { get; private set; }
    public bool Updating { get; private set; }
    private string? updateAsset;
    public event Action? UpdateChanged;

    private static string CurrentVersion =>
        System.Reflection.Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "0.0.0";

    /// <summary>"v1.10.0" 이 "1.9.0" 보다 높다. 문자열로 비교하면 거꾸로 나온다.</summary>
    public static bool IsNewerVersion(string candidate, string current)
    {
        static int[] Parts(string text) => text.TrimStart('v', 'V', ' ')
            .Split('.')
            .Select(p => int.TryParse(new string(p.TakeWhile(char.IsDigit).ToArray()), out var n) ? n : 0)
            .ToArray();

        var a = Parts(candidate);
        var b = Parts(current);
        for (var i = 0; i < Math.Max(a.Length, b.Length); i += 1)
        {
            var x = i < a.Length ? a[i] : 0;
            var y = i < b.Length ? b[i] : 0;
            if (x != y) return x > y;
        }
        return false;
    }

    /// <summary>하루 한 번 물어본다. 실패는 조용히 삼킨다.</summary>
    private async Task CheckForUpdateAsync()
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, ReleaseApi);
            request.Headers.Add("Accept", "application/vnd.github+json");
            // GitHub 은 User-Agent 없는 요청을 거절한다.
            request.Headers.Add("User-Agent", "SneakyBaseball");

            using var response = await http.SendAsync(request);
            if (!response.IsSuccessStatusCode) return;

            var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
            var tag = json.GetProperty("tag_name").GetString();
            if (tag is null || !IsNewerVersion(tag, CurrentVersion)) return;

            string? asset = null;
            if (json.TryGetProperty("assets", out var assets))
            {
                foreach (var a in assets.EnumerateArray())
                {
                    var name = a.TryGetProperty("name", out var n) ? n.GetString() : null;
                    if (name is not null && name.EndsWith(WinAssetSuffix, StringComparison.OrdinalIgnoreCase))
                    {
                        asset = a.GetProperty("browser_download_url").GetString();
                        break;
                    }
                }
            }

            BeginInvoke(() =>
            {
                UpdateVersion = tag;
                updateAsset = asset;
                UpdateChanged?.Invoke();
            });
        }
        catch
        {
            // 새 버전을 못 찾는 것과 게임이 안 되는 것은 다른 일이다.
        }
    }

    /// <summary>2단계 — 받아서 조용히 다시 깐다. 한 걸음이라도 어긋나면 릴리스 페이지를 연다.</summary>
    public async void InstallUpdate()
    {
        if (Updating) return;
        if (updateAsset is null)
        {
            OpenReleasePage();
            return;
        }

        Updating = true;
        UpdateNote = "내려받는 중…";
        UpdateChanged?.Invoke();

        var path = Path.Combine(Path.GetTempPath(), $"SneakyBaseball-{Guid.NewGuid():N}.exe");
        try
        {
            using (var request = new HttpRequestMessage(HttpMethod.Get, updateAsset))
            {
                request.Headers.Add("User-Agent", "SneakyBaseball");
                using var response = await http.SendAsync(request);
                response.EnsureSuccessStatusCode();
                await using var file = File.Create(path);
                await response.Content.CopyToAsync(file);
            }

            UpdateNote = "설치하는 중…";
            UpdateChanged?.Invoke();

            // 조용히 깔고, 돌던 앱을 닫았다가 새것으로 다시 띄운다(installer.iss 가 그렇게 돼 있다).
            Process.Start(new ProcessStartInfo(path)
            {
                Arguments = "/SILENT /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS /NORESTART",
                UseShellExecute = true,
            });
            Application.Exit();
        }
        catch
        {
            Updating = false;
            UpdateNote = "직접 받기";
            UpdateChanged?.Invoke();
            OpenReleasePage();
        }
    }

    private static void OpenReleasePage()
    {
        try
        {
            Process.Start(new ProcessStartInfo(ReleasePage) { UseShellExecute = true });
        }
        catch { }
    }

    /// <summary>저장된 값을 키로. "none" 은 사용자가 고른 「유니폼 없음」이다.</summary>
    private static string? Stored(string? value) => value == NoKit ? null : value;

    private void ReadState()
    {
        try
        {
            var json = JsonDocument.Parse(File.ReadAllText(statePath)).RootElement;
            BestMeters = json.TryGetProperty("bestMeters", out var m) ? m.GetInt32() : 0;
            // 장비 기록이 없던 시절에 저장된 값에는 맨몸 기록만 있다 — 그게 곧 장비 기록이기도 하다.
            BestGearedMeters = json.TryGetProperty("bestGearedMeters", out var gm2)
                ? gm2.GetInt32() : BestMeters;
            Points = json.TryGetProperty("points", out var pt) ? pt.GetInt32() : 0;
            owned = json.TryGetProperty("owned", out var ow) && ow.ValueKind == JsonValueKind.Array
                ? ow.EnumerateArray().Select(x => x.GetString() ?? "").Where(x => x != "").ToList()
                : new List<string> { DefaultBat };
            if (!owned.Contains(DefaultBat)) owned.Insert(0, DefaultBat);
            equipped = json.TryGetProperty("equipped", out var eq) ? eq.GetString() ?? DefaultBat : DefaultBat;
            cheer = json.TryGetProperty("cheer", out var ch) && ch.ValueKind == JsonValueKind.Object
                ? ch.EnumerateObject().ToDictionary(x => x.Name, x => x.Value.GetInt32())
                : new Dictionary<string, int>();
            pendingHits = json.TryGetProperty("pending", out var pd) && pd.ValueKind == JsonValueKind.Array
                ? pd.Clone()
                : null;
            playerId = json.TryGetProperty("playerId", out var pid) ? pid.GetString() : null;
            playerSecret = json.TryGetProperty("playerSecret", out var psec) ? psec.GetString() : null;
            nickname = json.TryGetProperty("nickname", out var nn) ? nn.GetString() : null;
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
                bestGearedMeters = BestGearedMeters,
                points = Points,
                owned,
                equipped,
                cheer,
                pending = pendingHits,
                playerId,
                playerSecret,
                nickname,
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

/// <summary>
/// 배트 상점 창. <b>오버레이가 아니다</b> — 창틀이 있고, 마우스를 그대로 받고,
/// 클릭 통과에 예외를 파지 않는다. 게임 창과 <b>같은 브리지</b>를 얹어서
/// 상점(JS)이 셸에 사고 끼우겠다고 말할 수 있게 한다.
/// </summary>
sealed class ShopWindow : Form
{
    private readonly WebView2 web = new();
    private readonly CoreWebView2Environment? env;
    private readonly string bridge;
    private readonly EventHandler<CoreWebView2WebMessageReceivedEventArgs> onMessage;
    private readonly string view;
    private bool ready;

    public ShopWindow(CoreWebView2Environment? env, string bridge,
                      EventHandler<CoreWebView2WebMessageReceivedEventArgs> onMessage,
                      string view = "bats")
    {
        this.env = env;
        this.bridge = bridge;
        this.onMessage = onMessage;
        this.view = view;

        Text = "배트 상점";
        // 배트 다섯 장이 한 줄에 들어오는 너비. 줄이 갈리면 마지막 배트만 외따로 떨어진다.
        ClientSize = new Size(920, 560);
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(420, 380);
        ShowInTaskbar = true;

        web.Dock = DockStyle.Fill;
        Controls.Add(web);
        _ = InitAsync();
    }

    private async Task InitAsync()
    {
        var environment = env ?? await CoreWebView2Environment.CreateAsync(null, Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SneakyBaseball"));
        await web.EnsureCoreWebView2Async(environment);

        var core = web.CoreWebView2;
        core.SetVirtualHostNameToFolderMapping(
            "sneaky.app", Path.Combine(AppContext.BaseDirectory, "web"),
            CoreWebView2HostResourceAccessKind.Allow);
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreDevToolsEnabled = false;

        await core.AddScriptToExecuteOnDocumentCreatedAsync(bridge);
        core.WebMessageReceived += onMessage;
        // 처음 열 때는 주소에 실어 보낸다 — 아직 페이지가 안 떠서 자바스크립트를 못 부른다.
        core.Navigate($"https://sneaky.app/shop/index.html?view={view}");
        ready = true;
    }

    public void Send(string script)
    {
        if (ready) _ = web.ExecuteScriptAsync(script);
    }

    /// <summary>닫아도 없애지 않고 숨긴다 — 다시 열 때 캔버스를 처음부터 다시 그리지 않는다.</summary>
    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            Hide();
            return;
        }
        base.OnFormClosing(e);
    }
}
