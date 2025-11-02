using System;

class GCHandler {
    public void nonCompliantMethod1() {
    // ruleid: gci86-csharp-gc-collect-should-not-be-called
        GC.Collect(); // Noncompliant, same as GC.Collect(generation: GC.MaxGeneration)
    }

    public void nonCompliantMethod2() {
    // ruleid: gci86-csharp-gc-collect-should-not-be-called
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
