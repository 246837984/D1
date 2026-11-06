# Flash the DeepSeek Harness taskbar button (FLASHW_ALL | FLASHW_TIMERNOFG).
#
# Called by the plugin on platforms without a prebuilt helper, or when the
# bundled helper is missing. Windows keeps the button highlighted until the
# window is activated, which is the WeChat-style reminder users expect.
#
# Exit codes: 0 flashed, 1 FlashWindowEx failed, 2 window not found, 3 already focused.

$ErrorActionPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class DshFlashNotify
{
    [StructLayout(LayoutKind.Sequential)]
    public struct FLASHWINFO
    {
        public uint cbSize;
        public IntPtr hwnd;
        public uint dwFlags;
        public uint uCount;
        public uint dwTimeout;
    }

    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool FlashWindowEx(ref FLASHWINFO pfwi);
    [DllImport("user32.dll")]
    static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")]
    static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int GetClassName(IntPtr hWnd, StringBuilder text, int maxCount);
    [DllImport("user32.dll")]
    static extern IntPtr GetWindow(IntPtr hWnd, uint command);
    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    const uint FLASHW_ALL = 0x3;
    const uint FLASHW_TIMERNOFG = 0xC;
    const uint GW_OWNER = 4;

    public static int Flash()
    {
        IntPtr best = IntPtr.Zero;
        IntPtr fallback = IntPtr.Zero;

        EnumWindows(delegate (IntPtr hWnd, IntPtr lParam)
        {
            if (!IsWindowVisible(hWnd)) return true;
            if (GetWindow(hWnd, GW_OWNER) != IntPtr.Zero) return true;
            if (GetWindowTextLength(hWnd) <= 0) return true;

            StringBuilder cls = new StringBuilder(256);
            GetClassName(hWnd, cls, 256);
            if (cls.ToString() != "Chrome_WidgetWin_1") return true;

            if (fallback == IntPtr.Zero) fallback = hWnd;

            StringBuilder title = new StringBuilder(512);
            GetWindowText(hWnd, title, 512);
            if (title.ToString().IndexOf("DeepSeek", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                best = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);

        IntPtr hwnd = best != IntPtr.Zero ? best : fallback;
        if (hwnd == IntPtr.Zero) return 2;
        if (GetForegroundWindow() == hwnd) return 3;

        FLASHWINFO info = new FLASHWINFO();
        info.cbSize = (uint)Marshal.SizeOf(typeof(FLASHWINFO));
        info.hwnd = hwnd;
        info.dwFlags = FLASHW_ALL | FLASHW_TIMERNOFG;
        info.uCount = 0;
        info.dwTimeout = 0;
        return FlashWindowEx(ref info) ? 0 : 1;
    }
}
'@

exit [DshFlashNotify]::Flash()
