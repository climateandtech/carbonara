using System;

class StringHandler {
    // ruleid: gci92-csharp-use-string-length-instead-of-comparison-with-empty-string
    public void nonCompliantMethod1() {
        string s = "";
        if (s == "") // Noncompliant
        {
            Console.WriteLine("Empty string");
        }
    }

    // ruleid: gci92-csharp-use-string-length-instead-of-comparison-with-empty-string
    public void nonCompliantMethod2() {
        string s = "hello";
        if (s != "") // Noncompliant
        {
            Console.WriteLine("Not empty string");
        }
    }

    // ok: gci92-csharp-use-string-length-instead-of-comparison-with-empty-string
    public void compliantMethod1() {
        string s = "";
        if (s.Length == 0) // Compliant
        {
            Console.WriteLine("Empty string");
        }
    }

    // ok: gci92-csharp-use-string-length-instead-of-comparison-with-empty-string
    public void compliantMethod2() {
        string s = "hello";
        if (s.Length != 0) // Compliant
        {
            Console.WriteLine("Not empty string");
        }
    }
}
