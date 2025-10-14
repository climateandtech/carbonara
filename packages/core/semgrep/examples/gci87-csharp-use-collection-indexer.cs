using System;
using System.Collections.Generic;
using System.Linq;

class CollectionHandler {
    public static void Test(int[] arr) {
        // ruleid: gci87-csharp-use-collection-indexer
        int first = arr.First(); // Noncompliant, use arr[0]
        // ruleid: gci87-csharp-use-collection-indexer
        int last = arr.Last(); // Noncompliant, use arr[^1], or arr[arr.Length - 1] if C# < 8
        // ruleid: gci87-csharp-use-collection-indexer
        int third = arr.ElementAt(2); // Noncompliant, use arr[2]
    }

    public static void TestCompliant(List<int> list) {
        // ok: gci87-csharp-use-collection-indexer
        int first = list[0];
        // ok: gci87-csharp-use-collection-indexer
        int last = list[^1]; // Or list[list.Count - 1] if C# < 8
        // ok: gci87-csharp-use-collection-indexer
        int third = list[2];
    }
}
