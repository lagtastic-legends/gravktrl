using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.Diagnostics;

namespace GravKtrlScreenService {
    class Program {
        [DllImport("user32.dll")]
        static extern IntPtr GetDesktopWindow();

        [DllImport("user32.dll")]
        static extern IntPtr GetWindowDC(IntPtr hWnd);

        [DllImport("user32.dll")]
        static extern IntPtr ReleaseDC(IntPtr hWnd, IntPtr hDC);

        [DllImport("user32.dll")]
        static extern int GetSystemMetrics(int nIndex);

        [DllImport("gdi32.dll")]
        static extern IntPtr CreateCompatibleDC(IntPtr hdc);

        [DllImport("gdi32.dll")]
        static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int nWidth, int nHeight);

        [DllImport("gdi32.dll")]
        static extern IntPtr SelectObject(IntPtr hdc, IntPtr hgdiobj);

        [DllImport("gdi32.dll")]
        static extern bool BitBlt(IntPtr hdcDest, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hdcSrc, int nXSrc, int nYSrc, int dwRop);

        [DllImport("gdi32.dll")]
        static extern bool DeleteDC(IntPtr hdc);

        [DllImport("gdi32.dll")]
        static extern bool DeleteObject(IntPtr hObject);

        [DllImport("user32.dll")]
        static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);

        [DllImport("user32.dll")]
        static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, UIntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        static extern uint SendInput(uint nInputs, [MarshalAs(UnmanagedType.LPArray), In] INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
        delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll")]
        static extern bool IsWindowVisible(IntPtr hWnd);

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        const int SRCCOPY = 0x00CC0020;
        const int SM_CXSCREEN = 0;
        const int SM_CYSCREEN = 1;
        const int SW_RESTORE = 9;

        const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        const uint MOUSEEVENTF_LEFTUP = 0x0004;
        const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        const uint MOUSEEVENTF_WHEEL = 0x0800;

        const int INPUT_KEYBOARD = 1;
        const uint KEYEVENTF_KEYUP = 0x0002;
        const uint KEYEVENTF_UNICODE = 0x0004;

        [StructLayout(LayoutKind.Sequential)]
        struct INPUT {
            public uint type;
            public InputUnion u;
        }

        [StructLayout(LayoutKind.Explicit)]
        struct InputUnion {
            [FieldOffset(0)]
            public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct KEYBDINPUT {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        static ImageCodecInfo jpegCodec = null;

        static void InitCodec() {
            foreach (var c in ImageCodecInfo.GetImageEncoders()) {
                if (c.MimeType == "image/jpeg") {
                    jpegCodec = c;
                    break;
                }
            }
        }

        static IntPtr FindAntigravityHwnd(out string outTitle, out RECT outRect) {
            IntPtr targetHwnd = IntPtr.Zero;
            string foundTitle = "";
            RECT foundRect = new RECT();

            EnumWindows((hWnd, lParam) => {
                if (!IsWindowVisible(hWnd)) return true;
                StringBuilder sb = new StringBuilder(256);
                GetWindowText(hWnd, sb, 256);
                string title = sb.ToString();

                uint pid;
                GetWindowThreadProcessId(hWnd, out pid);

                if (pid != 0) {
                    try {
                        Process proc = Process.GetProcessById((int)pid);
                        string pName = proc.ProcessName;
                        if (pName.IndexOf("Antigravity", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            pName.IndexOf("Cursor", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            pName.IndexOf("Code", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            title.IndexOf("Antigravity", StringComparison.OrdinalIgnoreCase) >= 0) {
                            
                            RECT r;
                            GetWindowRect(hWnd, out r);
                            int w = r.Right - r.Left;
                            int h = r.Bottom - r.Top;
                            if (w > 200 && h > 200) {
                                targetHwnd = hWnd;
                                foundTitle = string.IsNullOrEmpty(title) ? pName : title;
                                foundRect = r;
                                return false; // stop enumeration
                            }
                        }
                    } catch {}
                }
                return true;
            }, IntPtr.Zero);

            outTitle = foundTitle;
            outRect = foundRect;
            return targetHwnd;
        }

        static byte[] CaptureDesktop(int quality, float scale) {
            int width = GetSystemMetrics(SM_CXSCREEN);
            int height = GetSystemMetrics(SM_CYSCREEN);
            if (width <= 0) width = 1920;
            if (height <= 0) height = 1080;

            IntPtr hDesktop = GetDesktopWindow();
            IntPtr hdcSrc = GetWindowDC(hDesktop);
            IntPtr hdcDest = CreateCompatibleDC(hdcSrc);
            IntPtr hBitmap = CreateCompatibleBitmap(hdcSrc, width, height);
            IntPtr hOld = SelectObject(hdcDest, hBitmap);

            BitBlt(hdcDest, 0, 0, width, height, hdcSrc, 0, 0, SRCCOPY);
            SelectObject(hdcDest, hOld);

            Bitmap bmp = Image.FromHbitmap(hBitmap);
            DeleteDC(hdcDest);
            ReleaseDC(hDesktop, hdcSrc);
            DeleteObject(hBitmap);

            return EncodeBitmap(bmp, quality, scale);
        }

        static byte[] CaptureWindow(IntPtr hWnd, int quality, float scale) {
            RECT rect;
            GetWindowRect(hWnd, out rect);
            int width = rect.Right - rect.Left;
            int height = rect.Bottom - rect.Top;

            if (width <= 50 || height <= 50) {
                return CaptureDesktop(quality, scale);
            }

            IntPtr hdcSrc = GetWindowDC(hWnd);
            IntPtr hdcDest = CreateCompatibleDC(hdcSrc);
            IntPtr hBitmap = CreateCompatibleBitmap(hdcSrc, width, height);
            IntPtr hOld = SelectObject(hdcDest, hBitmap);

            // PW_RENDERFULLCONTENT = 2
            bool ok = PrintWindow(hWnd, hdcDest, 2);
            if (!ok) {
                // Fallback to BitBlt
                BitBlt(hdcDest, 0, 0, width, height, hdcSrc, 0, 0, SRCCOPY);
            }
            SelectObject(hdcDest, hOld);

            Bitmap bmp = Image.FromHbitmap(hBitmap);
            DeleteDC(hdcDest);
            ReleaseDC(hWnd, hdcSrc);
            DeleteObject(hBitmap);

            return EncodeBitmap(bmp, quality, scale);
        }

        static byte[] EncodeBitmap(Bitmap source, int quality, float scale) {
            Bitmap toEncode = source;
            bool wasResized = false;

            if (scale > 0.1f && scale < 0.99f) {
                int newW = Math.Max(100, (int)(source.Width * scale));
                int newH = Math.Max(100, (int)(source.Height * scale));
                Bitmap scaled = new Bitmap(newW, newH);
                using (Graphics g = Graphics.FromImage(scaled)) {
                    g.InterpolationMode = InterpolationMode.Bilinear;
                    g.DrawImage(source, 0, 0, newW, newH);
                }
                toEncode = scaled;
                wasResized = true;
            }

            using (MemoryStream ms = new MemoryStream()) {
                EncoderParameters ep = new EncoderParameters(1);
                ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)Math.Max(10, Math.Min(100, quality)));
                toEncode.Save(ms, jpegCodec, ep);

                if (wasResized) {
                    toEncode.Dispose();
                }
                source.Dispose();
                return ms.ToArray();
            }
        }

        static void SendClick(float normX, float normY, string button) {
            int screenW = GetSystemMetrics(SM_CXSCREEN);
            int screenH = GetSystemMetrics(SM_CYSCREEN);
            int x = (int)Math.Round(Math.Max(0f, Math.Min(1f, normX)) * (screenW - 1));
            int y = (int)Math.Round(Math.Max(0f, Math.Min(1f, normY)) * (screenH - 1));

            SetCursorPos(x, y);

            if (button == "right") {
                mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, UIntPtr.Zero);
                System.Threading.Thread.Sleep(30);
                mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, UIntPtr.Zero);
            } else if (button == "double") {
                mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
                mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
                System.Threading.Thread.Sleep(50);
                mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
                mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
            } else {
                mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
                System.Threading.Thread.Sleep(30);
                mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
            }
        }

        static void SendScroll(float normX, float normY, int deltaY) {
            int screenW = GetSystemMetrics(SM_CXSCREEN);
            int screenH = GetSystemMetrics(SM_CYSCREEN);
            int x = (int)Math.Round(Math.Max(0f, Math.Min(1f, normX)) * (screenW - 1));
            int y = (int)Math.Round(Math.Max(0f, Math.Min(1f, normY)) * (screenH - 1));

            SetCursorPos(x, y);
            mouse_event(MOUSEEVENTF_WHEEL, 0, 0, deltaY, UIntPtr.Zero);
        }

        static void SendUnicodeText(string text) {
            if (string.IsNullOrEmpty(text)) return;
            INPUT[] inputs = new INPUT[text.Length * 2];
            int idx = 0;

            for (int i = 0; i < text.Length; i++) {
                char c = text[i];
                // Key down
                inputs[idx].type = INPUT_KEYBOARD;
                inputs[idx].u.ki.wVk = 0;
                inputs[idx].u.ki.wScan = (ushort)c;
                inputs[idx].u.ki.dwFlags = KEYEVENTF_UNICODE;
                inputs[idx].u.ki.time = 0;
                inputs[idx].u.ki.dwExtraInfo = IntPtr.Zero;
                idx++;

                // Key up
                inputs[idx].type = INPUT_KEYBOARD;
                inputs[idx].u.ki.wVk = 0;
                inputs[idx].u.ki.wScan = (ushort)c;
                inputs[idx].u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
                inputs[idx].u.ki.time = 0;
                inputs[idx].u.ki.dwExtraInfo = IntPtr.Zero;
                idx++;
            }

            int structSize = Marshal.SizeOf(typeof(INPUT));
            SendInput((uint)inputs.Length, inputs, structSize);
        }

        static void WriteText(Stream stdout, string text) {
            byte[] b = Encoding.UTF8.GetBytes(text + "\n");
            stdout.Write(b, 0, b.Length);
            stdout.Flush();
        }

        static void Main(string[] args) {
            InitCodec();
            Stream stdout = Console.OpenStandardOutput();
            Stream stdin = Console.OpenStandardInput();
            StreamReader reader = new StreamReader(stdin, Encoding.UTF8);

            Console.Error.WriteLine("[GravKtrlScreen] Native Screen Service Started");

            string line;
            while ((line = reader.ReadLine()) != null) {
                line = line.Trim();
                if (string.IsNullOrEmpty(line)) continue;

                if (line == "QUIT") {
                    break;
                }

                if (line == "INFO") {
                    int screenW = GetSystemMetrics(SM_CXSCREEN);
                    int screenH = GetSystemMetrics(SM_CYSCREEN);
                    string agyTitle;
                    RECT agyRect;
                    IntPtr agyHwnd = FindAntigravityHwnd(out agyTitle, out agyRect);

                    string json = "{" +
                        "\"screenWidth\":" + screenW + "," +
                        "\"screenHeight\":" + screenH + "," +
                        "\"antigravity\":{" +
                            "\"found\":" + (agyHwnd != IntPtr.Zero ? "true" : "false") + "," +
                            "\"hWnd\":" + agyHwnd.ToInt64() + "," +
                            "\"title\":\"" + agyTitle.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"," +
                            "\"rect\":{" +
                                "\"left\":" + agyRect.Left + "," +
                                "\"top\":" + agyRect.Top + "," +
                                "\"width\":" + Math.Max(0, agyRect.Right - agyRect.Left) + "," +
                                "\"height\":" + Math.Max(0, agyRect.Bottom - agyRect.Top) +
                            "}" +
                        "}" +
                    "}";
                    WriteText(stdout, "INFO " + json);
                    continue;
                }

                if (line.StartsWith("SHOT")) {
                    string[] parts = line.Split(' ');
                    string target = parts.Length > 1 ? parts[1] : "desktop";
                    int quality = parts.Length > 2 ? int.Parse(parts[2]) : 65;
                    float scale = parts.Length > 3 ? float.Parse(parts[3], System.Globalization.CultureInfo.InvariantCulture) : 1.0f;

                    byte[] jpegBytes;
                    if (target == "antigravity") {
                        string t;
                        RECT r;
                        IntPtr hWnd = FindAntigravityHwnd(out t, out r);
                        if (hWnd != IntPtr.Zero) {
                            jpegBytes = CaptureWindow(hWnd, quality, scale);
                        } else {
                            jpegBytes = CaptureDesktop(quality, scale);
                        }
                    } else {
                        jpegBytes = CaptureDesktop(quality, scale);
                    }

                    // Write FRAME <length>\n followed by raw jpeg bytes and \n
                    string frameHdr = "FRAME " + jpegBytes.Length + "\n";
                    byte[] hdrBytes = Encoding.ASCII.GetBytes(frameHdr);
                    stdout.Write(hdrBytes, 0, hdrBytes.Length);
                    stdout.Write(jpegBytes, 0, jpegBytes.Length);
                    stdout.Write(new byte[] { 10 }, 0, 1);
                    stdout.Flush();
                    continue;
                }

                if (line.StartsWith("CLICK")) {
                    string[] parts = line.Split(' ');
                    float nx = float.Parse(parts[1], System.Globalization.CultureInfo.InvariantCulture);
                    float ny = float.Parse(parts[2], System.Globalization.CultureInfo.InvariantCulture);
                    string btn = parts.Length > 3 ? parts[3] : "left";
                    SendClick(nx, ny, btn);
                    WriteText(stdout, "OK");
                    continue;
                }

                if (line.StartsWith("SCROLL")) {
                    string[] parts = line.Split(' ');
                    float nx = float.Parse(parts[1], System.Globalization.CultureInfo.InvariantCulture);
                    float ny = float.Parse(parts[2], System.Globalization.CultureInfo.InvariantCulture);
                    int delta = parts.Length > 3 ? int.Parse(parts[3]) : -120;
                    SendScroll(nx, ny, delta);
                    WriteText(stdout, "OK");
                    continue;
                }

                if (line.StartsWith("TEXT")) {
                    string b64 = line.Substring(4).Trim();
                    byte[] raw = Convert.FromBase64String(b64);
                    string text = Encoding.UTF8.GetString(raw);
                    SendUnicodeText(text);
                    WriteText(stdout, "OK");
                    continue;
                }

                if (line == "FOCUS") {
                    string t;
                    RECT r;
                    IntPtr hWnd = FindAntigravityHwnd(out t, out r);
                    if (hWnd != IntPtr.Zero) {
                        ShowWindow(hWnd, SW_RESTORE);
                        SetForegroundWindow(hWnd);
                        WriteText(stdout, "OK");
                    } else {
                        WriteText(stdout, "NOT_FOUND");
                    }
                    continue;
                }

                WriteText(stdout, "UNKNOWN_COMMAND");
            }
        }
    }
}
