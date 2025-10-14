using System;
using System.Threading.Tasks;

class AsyncHandler {
    // ruleid: gci84-csharp-avoid-async-void-methods
    public async void AsyncMethodNonCompliant() {
        Console.WriteLine();
        await Task.Delay(1000);
    }

    // ok: gci84-csharp-avoid-async-void-methods
    public async Task AsyncMethodCompliant() {
        Console.WriteLine();
        await Task.Delay(100);
    }
}
