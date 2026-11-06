// DshFlash —— DSH 任务阶段完成 → 任务栏按钮闪红（微信式提醒）
//
// 模式：
//   DshFlash.exe flash   手动闪一次（自检用）
//   DshFlash.exe watch   常驻监听 DSH 会话投影缓存，检测到一轮任务结束就闪
//   DshFlash.exe stop    停止正在运行的 watch
//   DshFlash.exe status  查看 watch 是否在运行
//
// 信号源：%USERPROFILE%\.dsh\storages\session_projcache\sessions\session-*.json
//         其中 turnBoundary.openTurnStartSeq 由数字变为 null 即为该会话一轮结束。
// 无需改动 DSH 任何配置，无需重启应用。

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

static class DshFlash
{
    // ================= Win32 =================
    [StructLayout(LayoutKind.Sequential)]
    struct FLASHWINFO { public uint cbSize; public IntPtr hwnd; public uint dwFlags; public uint uCount; public uint dwTimeout; }

    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool FlashWindowEx(ref FLASHWINFO pfwi);
    [DllImport("user32.dll")]
    static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")]
    static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int GetClassName(IntPtr hWnd, StringBuilder text, int maxCount);
    [DllImport("user32.dll")]
    static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    const uint FLASHW_ALL = 0x3;
    const uint FLASHW_TIMERNOFG = 0xC;

    static IntPtr FindDshWindow()
    {
        IntPtr best = IntPtr.Zero;
        IntPtr fallback = IntPtr.Zero;
        EnumWindows(delegate (IntPtr hWnd, IntPtr lParam)
        {
            if (!IsWindowVisible(hWnd)) return true;
            if (GetWindow(hWnd, 4) != IntPtr.Zero) return true;
            if (GetWindowTextLength(hWnd) <= 0) return true;
            StringBuilder cls = new StringBuilder(256);
            GetClassName(hWnd, cls, 256);
            if (cls.ToString() != "Chrome_WidgetWin_1") return true;
            if (fallback == IntPtr.Zero) fallback = hWnd;
            StringBuilder title = new StringBuilder(512);
            GetWindowText(hWnd, title, 512);
            string t = title.ToString();
            if (t.IndexOf("DeepSeek", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                best = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return best != IntPtr.Zero ? best : fallback;
    }

    /// <summary>闪烁任务栏按钮；窗口已在前台时不打扰，返回 (flashed, reason)。</summary>
    static bool Flash(out string reason)
    {
        IntPtr hwnd = FindDshWindow();
        if (hwnd == IntPtr.Zero) { reason = "window-not-found"; return false; }
        if (GetForegroundWindow() == hwnd) { reason = "already-focused"; return false; }
        FLASHWINFO fwi = new FLASHWINFO();
        fwi.cbSize = (uint)Marshal.SizeOf(typeof(FLASHWINFO));
        fwi.hwnd = hwnd;
        fwi.dwFlags = FLASHW_ALL | FLASHW_TIMERNOFG;
        bool ok = FlashWindowEx(ref fwi);
        reason = ok ? "flashed" : "FlashWindowEx-returned-false(minimized-window)";
        return true;
    }

    // ================= 路径与日志 =================
    static readonly string Home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
    static string CacheDir { get { return Path.Combine(Home, ".dsh", "storages", "session_projcache", "sessions"); } }
    static string LogFile { get { return Path.Combine(Home, ".dsh", "DshFlash.log"); } }

    static readonly object LogLock = new object();
    static void Log(string message)
    {
        try
        {
            lock (LogLock)
            {
                string dir = Path.GetDirectoryName(LogFile);
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                FileInfo fi = new FileInfo(LogFile);
                if (fi.Exists && fi.Length > 256 * 1024) File.WriteAllText(LogFile, "");
                File.AppendAllText(LogFile,
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " " + message + Environment.NewLine,
                    new UTF8Encoding(false));
            }
        }
        catch { }
    }

    // ================= 状态判读 =================
    static readonly Regex OpenTurnRe = new Regex("\"openTurnStartSeq\"\\s*:\\s*(null|\\d+)", RegexOptions.Compiled);
    static readonly Regex LastTurnRe = new Regex("\"lastTurn\"\\s*:\\s*(\\d+)", RegexOptions.Compiled);

    static string ReadAllWithRetry(string file)
    {
        for (int i = 0; i < 4; i++)
        {
            try { return File.ReadAllText(file, Encoding.UTF8); }
            catch (IOException) { Thread.Sleep(15); }
            catch (UnauthorizedAccessException) { Thread.Sleep(15); }
        }
        return null;
    }

    /// <summary>true=有一轮正在进行；false=空闲；null=读不到/格式不符。</summary>
    static bool? IsTurnOpen(string file)
    {
        string text = ReadAllWithRetry(file);
        if (text == null) return null;
        Match m = OpenTurnRe.Match(text);
        if (!m.Success) return null;
        bool open = m.Groups[1].Value != "null";
        if (!open)
        {
            Match last = LastTurnRe.Match(text);
            if (!last.Success) return null;
            int turn;
            if (!int.TryParse(last.Groups[1].Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out turn)) return null;
            if (turn <= 0) return null;
        }
        return open;
    }

    // ================= watch =================
    const string MutexName = "Global\\dsh-flash-notify-watch";
    const string StopEventName = "Global\\dsh-flash-notify-stop";

    static void RunWatch()
    {
        bool created;
        Mutex mutex = new Mutex(true, MutexName, out created);
        if (!created)
        {
            Log("watch: already running, exit");
            return;
        }

        EventWaitHandle stop = new EventWaitHandle(false, EventResetMode.ManualReset, StopEventName);
        Dictionary<string, bool> state = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
        DateTime lastFlash = DateTime.MinValue;
        object gate = new object();

        Log("watch: started, dir=" + CacheDir);

        Action trigger = delegate
        {
            lock (gate)
            {
                if ((DateTime.UtcNow - lastFlash).TotalMilliseconds < 1000) return;
                lastFlash = DateTime.UtcNow;
            }
            string reason;
            bool attempted = Flash(out reason);
            Log("turn/end -> " + (attempted ? "flash attempted: " + reason : "skipped: " + reason));
        };

        Action<string> inspect = delegate (string file)
        {
            bool? open = IsTurnOpen(file);
            if (open == null) return;
            bool previous;
            bool known = state.TryGetValue(file, out previous);
            state[file] = open.Value;
            if (!known) return;                       // 首次见到只记录，不打扰
            if (previous && !open.Value) trigger();   // 一轮结束
        };

        // 初始化：把现有会话都读一遍作为基准
        if (Directory.Exists(CacheDir))
        {
            foreach (string f in Directory.GetFiles(CacheDir, "session-*.json"))
            {
                bool? open = IsTurnOpen(f);
                if (open != null) state[f] = open.Value;
            }
        }
        else
        {
            Log("watch: cache dir missing, waiting: " + CacheDir);
        }
        Log("watch: baseline sessions=" + state.Count);

        FileSystemWatcher watcher = null;
        Action rebuild = null;
        rebuild = delegate
        {
            try { if (watcher != null) watcher.Dispose(); } catch { }
            if (!Directory.Exists(CacheDir)) return;
            FileSystemWatcher w = new FileSystemWatcher(CacheDir, "session-*.json");
            w.NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.Size;
            w.IncludeSubdirectories = false;
            w.EnableRaisingEvents = true;
            FileSystemEventHandler handler = delegate (object s, FileSystemEventArgs e) { inspect(e.FullPath); };
            w.Changed += handler;
            w.Created += handler;
            w.Renamed += delegate (object s, RenamedEventArgs e) { inspect(e.FullPath); };
            w.Error += delegate
            {
                ThreadPool.QueueUserWorkItem(delegate
                {
                    Thread.Sleep(500);
                    Log("watch: watcher error, rebuilding");
                    rebuild();
                });
            };
            watcher = w;
        };

        rebuild();
        // 目录迟到时反复尝试
        Timer retry = new Timer(delegate
        {
            if (watcher == null) rebuild();
        }, null, 2000, 5000);

        stop.WaitOne();
        Log("watch: stop requested");
        try { retry.Dispose(); } catch { }
        try { if (watcher != null) watcher.Dispose(); } catch { }
        try { mutex.ReleaseMutex(); } catch { }
    }

    static bool IsWatchRunning()
    {
        Mutex mutex = null;
        try
        {
            mutex = Mutex.OpenExisting(MutexName);
            return true;
        }
        catch { return false; }
        finally { if (mutex != null) mutex.Dispose(); }
    }

    // ================= main =================
    [STAThread]
    static int Main(string[] args)
    {
        string mode = args.Length > 0 ? args[0].ToLowerInvariant() : "watch";
        switch (mode)
        {
            case "flash":
            case "force":
                {
                    string reason;
                    bool attempted = Flash(out reason);
                    Log("manual flash: " + (attempted ? "attempted: " + reason : "skipped: " + reason));
                    return attempted ? 0 : (reason == "window-not-found" ? 2 : 3);
                }
            case "stop":
                {
                    try
                    {
                        using (EventWaitHandle stop = EventWaitHandle.OpenExisting(StopEventName))
                        {
                            stop.Set();
                            Log("stop: requested");
                            return 0;
                        }
                    }
                    catch { Log("stop: watch not running"); return 1; }
                }
            case "status":
                {
                    bool running = IsWatchRunning();
                    Log("status: " + (running ? "running" : "stopped"));
                    Console.WriteLine(running ? "running" : "stopped");
                    return running ? 0 : 1;
                }
            case "watch":
                RunWatch();
                return 0;
            default:
                Console.WriteLine("usage: DshFlash.exe [flash|watch|stop|status]");
                return 64;
        }
    }
}
