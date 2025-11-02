using System.Threading.Tasks;

class TaskHandler {
    static Task MyAsyncMethod() { return Task.Delay(100); }

    public static async Task Test1NonCompliant() {
    // ruleid: gci93-csharp-return-task-directly
        await Task.Delay(1000); // Noncompliant, return the Task directly.
    }

    public static async Task Test2NonCompliant() {
    // ruleid: gci93-csharp-return-task-directly
        await MyAsyncMethod(); // Noncompliant, exceptions within MyAsyncMethod are handled by the method itself.
    }

    // ok: gci93-csharp-return-task-directly
    public static Task Test1Compliant() {
        return Task.Delay(1000); // Compliant
    }

    // ok: gci93-csharp-return-task-directly
    public static Task Test2Compliant() {
        return MyAsyncMethod(); // Compliant, exceptions within MyAsyncMethod are handled by the caller of Test2.
    }
}
