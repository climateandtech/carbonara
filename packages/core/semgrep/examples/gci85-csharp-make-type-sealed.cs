using System;

class TypeHandler {
    // ruleid: gci85-csharp-make-type-sealed
    public class Class1NonCompliant {
        public void Method();
    }

    // ruleid: gci85-csharp-make-type-sealed
    public class Class2NonCompliant {
        public sealed void Method();
    }

    // ruleid: gci85-csharp-make-type-sealed
    internal class Class3NonCompliant { // Noncompliant if not inherited from because the type is not public, even with a virtual method
        public virtual void Method();
    }

    // ok: gci85-csharp-make-type-sealed
    public class Class4Compliant { // Compliant even if not inherited from, the virtual method hints at being overridable from other assemblies
        public virtual void Method();
    }

    // ruleid: gci85-csharp-make-type-sealed
    public class Class5NonCompliant : Class4Compliant { // Noncompliant if not inherited from, make type sealed
        public sealed override void Method();
    }

    // ok: gci85-csharp-make-type-sealed
    public class Class6Compliant : Class4Compliant { // Compliant, Method() is still overridable
        public override void Method();
    }

    // ok: gci85-csharp-make-type-sealed
    public sealed class Class1CompliantSealed {
        public void Method();
    }

    // ok: gci85-csharp-make-type-sealed
    public sealed class Class2CompliantSealed {
        public void Method();
    }

    // ok: gci85-csharp-make-type-sealed
    internal sealed class Class3CompliantSealed {
        public void Method();
    }
}
