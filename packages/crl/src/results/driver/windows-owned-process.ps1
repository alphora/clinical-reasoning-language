param([Parameter(Mandatory=$true)][string]$Request)
$ErrorActionPreference = 'Stop'
$inputRequest = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Request)) | ConvertFrom-Json
try {
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class CrlOwnedProcess {
    [StructLayout(LayoutKind.Sequential)] struct Limits {
        public long processTime, jobTime; public uint flags;
        public UIntPtr minWorking, maxWorking; public uint activeLimit;
        public UIntPtr affinity; public uint priority, scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
        public Limits basic;
        public ulong readOps, writeOps, otherOps, readBytes, writeBytes, otherBytes;
        public UIntPtr processMemory, jobMemory, peakProcessMemory, peakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential)] struct Accounting {
        public long user, kernel, periodUser, periodKernel;
        public uint faults, total, active, terminated;
    }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct Startup {
        public int cb; public string reserved, desktop, title;
        public uint x,y,xSize,ySize,xChars,yChars,fill,flags; public ushort show, reservedSize;
        public IntPtr reservedBytes, stdin, stdout, stderr;
    }
    [StructLayout(LayoutKind.Sequential)] struct StartupEx { public Startup basic; public IntPtr attributes; }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process, thread; public uint pid, tid; }
    [StructLayout(LayoutKind.Sequential)] struct Security { public int length; public IntPtr descriptor; public int inherit; }
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int type, ref ExtendedLimits info, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job, int type, out Accounting info, uint size, IntPtr returned);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool CreateProcess(string app, StringBuilder command, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref StartupEx startup, out ProcessInfo process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr handle, out uint code);
    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int which);
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern IntPtr CreateFile(string path, uint access, uint share, ref Security security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    static void Check(bool ok) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    static string Quote(string value) {
        var text = new StringBuilder("\""); int slashes = 0;
        foreach (char c in value) {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') text.Append('\\', slashes * 2 + 1).Append(c);
            else text.Append('\\', slashes).Append(c);
            slashes = 0;
        }
        return text.Append('\\', slashes * 2).Append('"').ToString();
    }
    public static int Run(string executable, string[] args, int ownerPid, long deadline, string token) {
        IntPtr job=IntPtr.Zero, owner=IntPtr.Zero, list=IntPtr.Zero, jobValue=IntPtr.Zero, input=IntPtr.Zero;
        ProcessInfo child = new ProcessInfo(); bool listReady=false, launched=false, confirmed=false;
        uint exitCode=1; string reason="spawn-error";
        var cancelled = new ManualResetEvent(false);
        try {
            owner=OpenProcess(0x100000, false, ownerPid); Check(owner!=IntPtr.Zero);
            job=CreateJobObject(IntPtr.Zero, null); Check(job!=IntPtr.Zero);
            var limits=new ExtendedLimits(); limits.basic.flags=0x2000; // KILL_ON_JOB_CLOSE
            Check(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(ExtendedLimits))));
            IntPtr size=IntPtr.Zero;
            InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);
            list=Marshal.AllocHGlobal(size); Check(InitializeProcThreadAttributeList(list,1,0,ref size)); listReady=true;
            jobValue=Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(jobValue,job);
            // Windows 10+/Server 2016+: atomic job membership, before any child code runs.
            Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x2000D),jobValue,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero));
            var security=new Security { length=Marshal.SizeOf(typeof(Security)), inherit=1 };
            input=CreateFile("NUL",0x80000000,3,ref security,3,0,IntPtr.Zero); Check(input!=new IntPtr(-1));
            var startup=new StartupEx();
            startup.basic.cb=Marshal.SizeOf(typeof(StartupEx)); startup.basic.flags=0x100;
            startup.basic.stdin=input; startup.basic.stdout=GetStdHandle(-11); startup.basic.stderr=GetStdHandle(-12);
            startup.attributes=list;
            ThreadPool.QueueUserWorkItem(delegate { try { Console.OpenStandardInput().ReadByte(); } catch {} cancelled.Set(); });
            var command=new StringBuilder(Quote(executable)); foreach (var arg in args) command.Append(' ').Append(Quote(arg));
            if (WaitForSingleObject(owner,0)==0 || cancelled.WaitOne(0)) reason="cancelled";
            else if (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()>=deadline) reason="timeout";
            else {
                Check(CreateProcess(executable,command,IntPtr.Zero,IntPtr.Zero,true,0x80000,IntPtr.Zero,null,ref startup,out child));
                launched=true;
                while (true) {
                    if (WaitForSingleObject(child.process,20)==0) { Check(GetExitCodeProcess(child.process,out exitCode)); reason="exit"; break; }
                    if (WaitForSingleObject(owner,0)==0 || cancelled.WaitOne(0)) { reason="cancelled"; break; }
                    if (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()>=deadline) { reason="timeout"; break; }
                }
            }
        } catch (Exception e) { Console.Error.WriteLine("CRL process launch/ownership: "+e.Message); }
        finally {
            try {
                if (!launched) confirmed=true;
                else {
                    Check(TerminateJobObject(job,1));
                    long until=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()+10000;
                    do {
                        Accounting accounting;
                        Check(QueryInformationJobObject(job,1,out accounting,(uint)Marshal.SizeOf(typeof(Accounting)),IntPtr.Zero));
                        if (accounting.active==0) { confirmed=true; break; }
                        Thread.Sleep(20);
                    } while(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()<until);
                }
            } catch(Exception e) { Console.Error.WriteLine("CRL process cleanup: "+e.Message); }
            if(child.thread!=IntPtr.Zero) CloseHandle(child.thread);
            if(child.process!=IntPtr.Zero) CloseHandle(child.process);
            if(input!=IntPtr.Zero && input!=new IntPtr(-1)) CloseHandle(input);
            if(listReady) DeleteProcThreadAttributeList(list);
            if(list!=IntPtr.Zero) Marshal.FreeHGlobal(list);
            if(jobValue!=IntPtr.Zero) Marshal.FreeHGlobal(jobValue);
            if(job!=IntPtr.Zero) CloseHandle(job);
            if(owner!=IntPtr.Zero) CloseHandle(owner);
            // The caller requires this nonce-bound acknowledgement and wrapper close.
            Console.Error.WriteLine("\nCRL_JOB_DONE:"+token+":"+reason+":"+(confirmed?"confirmed":"unconfirmed")+":"+exitCode);
        }
        return reason=="exit" ? unchecked((int)exitCode) : 1;
    }
}
'@
exit [CrlOwnedProcess]::Run($inputRequest.executable, [string[]]$inputRequest.arguments, $inputRequest.ownerPid, $inputRequest.deadline, $inputRequest.token)
} catch {
    [Console]::Error.WriteLine("CRL Windows ownership unavailable: " + $_.Exception.Message)
    [Console]::Error.WriteLine("CRL_JOB_DONE:" + $inputRequest.token + ":spawn-error:confirmed:1")
    exit 1
}
