using System;

class EnumHandler {
    private enum Letter { A, B, C }

    public void nonCompliantMethod() {
    // ruleid: gci83-csharp-replace-enum-tostring-with-nameof
        Console.WriteLine(Letter.A.ToString()); // Noncompliant, use nameof
    }

    // ok: gci83-csharp-replace-enum-tostring-with-nameof
    public void compliantMethod1() {
        Console.WriteLine(Letter.A.ToString("D")); // Compliant, the string format impacts the result
    }

    // ok: gci83-csharp-replace-enum-tostring-with-nameof
    public void compliantMethod2() {
        Console.WriteLine(nameof(Letter.A)); // Compliant
    }
}
