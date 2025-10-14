using System.IO;
using System.Threading.Tasks;

class ResourceHandler {
    // ruleid: gci88-csharp-dispose-resource-asynchronously
    public static async Task TestNonCompliant() {
        using var stream = new MemoryStream(); // Noncompliant, can be disposed asynchronously
    }

    // ok: gci88-csharp-dispose-resource-asynchronously
    public static async Task TestCompliantAsync() {
        await using var stream = new MemoryStream(); // Compliant
    }

    // ok: gci88-csharp-dispose-resource-asynchronously
    public static void TestCompliantSync() {
        using var stream = new MemoryStream(); // Compliant, method is synchronous
    }
}
