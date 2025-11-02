using System.Runtime.InteropServices;

class StructHandler {
    // ruleid: gci81-csharp-specify-struct-layout
    public struct MyStructNonCompliant {
        public int A;
        public double B;
        public int C;
    }

    // ok: gci81-csharp-specify-struct-layout
    [StructLayout(LayoutKind.Sequential)]
    public struct MyStructCompliantSequential {
        public int A;
        public double B;
        public int C;
    }

    // ok: gci81-csharp-specify-struct-layout
    [StructLayout(LayoutKind.Auto)]
    public struct MyStructCompliantAuto {
        public int A;
        public double B;
        public int C;
    }
}
