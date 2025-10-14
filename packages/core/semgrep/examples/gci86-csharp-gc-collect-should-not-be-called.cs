using System;

class GCHandler {
    // ruleid: gci86-csharp-gc-collect-should-not-be-called
    public void nonCompliantMethod1() {
        GC.Collect(); // Noncompliant, same as GC.Collect(generation: GC.MaxGeneration)
    }

    // ruleid: gci86-csharp-gc-collect-should-not-be-called
    public void nonCompliantMethod2() {
        GC.Collect(generation: 2); // Noncompliant
    }

    // ok: gci86-csharp-gc-collect-should-not-be-called
    public void compliantMethod1() {
        GC.Collect(generation: 0); // Compliant
    }

    // ok: gci86-csharp-gc-collect-should-not-be-called
    public void compliantMethod2() {
        GC.Collect(generation: 0, mode: GCCollectionMode.Optimized); // Compliant
    }
}
