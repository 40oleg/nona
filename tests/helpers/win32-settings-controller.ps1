param([int]$TargetPid)
$ErrorActionPreference = 'Stop'
# Only posted messages to windows belonging to the child process. Never use
# SendInput, move the shared desktop cursor, or discover a window by title alone.
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class SettingsController {
    public delegate bool EnumProc(IntPtr h, IntPtr arg);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr arg);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern IntPtr GetDlgItem(IntPtr h, int id);
    [DllImport("user32.dll")] static extern int GetDlgCtrlID(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsChild(IntPtr parent, IntPtr child);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out UIntPtr result);
    [DllImport("user32.dll", EntryPoint="SendMessageTimeoutW", CharSet=CharSet.Unicode)] static extern IntPtr ReadText(IntPtr h, uint msg, IntPtr w, StringBuilder text, uint flags, uint timeout, out UIntPtr result);
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int l,t,r,b; }
    [StructLayout(LayoutKind.Sequential)] struct GuiInfo {
        public uint size,flags; public IntPtr active,focus,capture,menuOwner,moveSize,caret; public Rect rect;
    }
    [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint thread, ref GuiInfo info);
    [StructLayout(LayoutKind.Sequential)] struct ComboInfo {
        public int size; public Rect item,button; public uint state; public IntPtr combo,edit,list;
    }
    [DllImport("user32.dll")] static extern bool GetComboBoxInfo(IntPtr combo, ref ComboInfo info);
    public static IntPtr Find(int target, string title) {
        IntPtr found=IntPtr.Zero;
        EnumWindows((h,arg) => {
            uint pid; GetWindowThreadProcessId(h,out pid);
            if(pid == target && Text(h)==title) {found=h; return false;}
            return true;
        },IntPtr.Zero);
        return found;
    }
    static string Text(IntPtr h) {
        // WM_GETTEXT is marshalled across processes for both captions and
        // child controls. Keep the read bounded if the application stalls.
        var text=new StringBuilder(512); UIntPtr length;
        if(ReadText(h,0xd,(IntPtr)text.Capacity,text,2,1000,out length)==IntPtr.Zero) throw new Exception("text timeout");
        return text.ToString();
    }
    static long Query(IntPtr h,uint msg) {
        UIntPtr value;
        if(SendMessageTimeout(h,msg,IntPtr.Zero,IntPtr.Zero,2,1000,out value)==IntPtr.Zero) throw new Exception("query timeout");
        return unchecked((long)value.ToUInt64());
    }
    static IntPtr Focus(IntPtr window) {
        uint pid; uint thread=GetWindowThreadProcessId(window,out pid);
        var info=new GuiInfo(); info.size=(uint)Marshal.SizeOf(info);
        if(!GetGUIThreadInfo(thread,ref info) || (info.focus!=window && !IsChild(window,info.focus))) throw new Exception("no child focus");
        return info.focus;
    }
    public static string Act(int target, IntPtr window, string action, int arg) {
        uint pid; GetWindowThreadProcessId(window,out pid);
        if(pid!=target) throw new Exception("window no longer belongs to child");
        if(action=="visible") return IsWindowVisible(window).ToString();
        if(action=="state") return Query(GetDlgItem(window,100),0xf0)+"|"+Query(GetDlgItem(window,101),0x147)+"|"+Query(GetDlgItem(window,101),0x146)+"|"+Text(GetDlgItem(window,102));
        if(action=="focus") return GetDlgCtrlID(Focus(window)).ToString();
        if(action=="dropped") return Query(GetDlgItem(window,101),0x157).ToString();
        if(action=="mouseChoice") {
            var info=new ComboInfo(); info.size=Marshal.SizeOf(info);
            if(arg<0 || arg>6 || !GetComboBoxInfo(GetDlgItem(window,101),ref info)) throw new Exception("no combo list");
            uint listPid; GetWindowThreadProcessId(info.list,out listPid);
            if(listPid!=target) throw new Exception("foreign list");
            UIntPtr height;
            if(SendMessageTimeout(info.combo,0x154,IntPtr.Zero,IntPtr.Zero,2,1000,out height)==IntPtr.Zero) throw new Exception("height timeout");
            int y=arg*(int)height.ToUInt64()+3;
            IntPtr point=(IntPtr)((y<<16)|8);
            if(!PostMessage(info.list,0x201,(IntPtr)1,point) || !PostMessage(info.list,0x202,IntPtr.Zero,point)) throw new Exception("list mouse failed");
            return "posted";
        }
        if(action=="mouse") {
            IntPtr control=GetDlgItem(window,arg);
            if(control==IntPtr.Zero) throw new Exception("no control");
            // Real button window-procedure mouse path, not BM_CLICK/WM_COMMAND.
            if(!PostMessage(control,0x201,(IntPtr)1,(IntPtr)0x80008) || !PostMessage(control,0x202,IntPtr.Zero,(IntPtr)0x80008)) throw new Exception("mouse failed");
        } else if(action=="key") {
            IntPtr focus=Focus(window);
            if(!PostMessage(focus,0x100,(IntPtr)arg,(IntPtr)1) || !PostMessage(focus,0x101,(IntPtr)arg,(IntPtr)0xc0000001L)) throw new Exception("key failed");
        } else if(action=="close") {
            // The system command produced by the title-bar close button. The
            // dialog manager must route it through WM_CLOSE, not an app event.
            if(!PostMessage(window,0x112,(IntPtr)0xf060,IntPtr.Zero)) throw new Exception("close failed");
        } else throw new Exception("unknown action");
        return "posted";
    }
}
'@
$window = [IntPtr]::Zero
while ($null -ne ($line = [Console]::ReadLine())) {
    try {
        $parts = $line.Split(' ')
        if ($parts[0] -eq 'find') {
            $window = [SettingsController]::Find($TargetPid, $parts[1])
            [Console]::WriteLine("OK $($window.ToInt64())")
        } else {
            $arg = 0
            if ($parts.Length -gt 1) { $arg = [int]$parts[1] }
            $value = [SettingsController]::Act($TargetPid, $window, $parts[0], $arg)
            [Console]::WriteLine("OK $value")
        }
    } catch {
        [Console]::WriteLine("ERROR $($_.Exception.Message)")
    }
}
