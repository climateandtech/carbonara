using System;

class ConstantHandler {
    // ruleid: gci82-csharp-variable-can-be-made-constant
    public void nonCompliantMethod1() {
        int i = 0; // Non compliant, i is never reassigned and can be made constant
        Console.WriteLine(i);
    }

    // ok: gci82-csharp-variable-can-be-made-constant
    public void compliantMethod1() {
        const int i = 0; // Compliant, i is declared as constant
        Console.WriteLine(i);
    }

    // ok: gci82-csharp-variable-can-be-made-constant
    public void compliantMethod2() {
        int i = 0; // Compliant, i is reassigned in the next line
        Console.WriteLine(i++);
    }
}
