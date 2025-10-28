using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

class LinqHandler {
    IEnumerable<int> items = new List<int> { 1, 2, 3, 11, 12, 13 };

    public static async Task nonCompliantMethod1(IEnumerable<int> items) {
    // ruleid: gci91-csharp-use-where-before-orderby-use-filter-before-sorted
        var query = items
            .OrderBy(x => x)
            .Where(x => x > 10);
    }

    public static async Task nonCompliantMethod2(IEnumerable<int> items) {
    // ruleid: gci91-csharp-use-where-before-orderby-use-filter-before-sorted
        var query = items
            .OrderBy(x => x)
            .ThenByDescending(x => x)
            .Where(x => x > 10);
    }

    public static async Task nonCompliantMethod3(IEnumerable<int> items) {
    // ruleid: gci91-csharp-use-where-before-orderby-use-filter-before-sorted
        var query = from item in items
                    orderby item
                    where item > 10
                    select item;
    }

    public static async Task nonCompliantMethod4(IEnumerable<int> items) {
    // ruleid: gci91-csharp-use-where-before-orderby-use-filter-before-sorted
        var query = from item in items
                    orderby item descending
                    where item > 10
                    select item;
    }

    // ok: gci91-csharp-use-where-before-orderby-use-filter-before-sorted
    public static async Task compliantMethod1(IEnumerable<int> items) {
        var query = items
            .Where(x => x > 10)
            .OrderBy(x => x);
    }

    // ok: gci91-csharp-use-where-before-orderby-use-filter-before-sorted
    public static async Task compliantMethod2(IEnumerable<int> items) {
        var query = items
            .Where(x => x > 10)
            .OrderBy(x => x)
            .ThenByDescending(x => x);
    }

    // ok: gci91-csharp-use-where-before-orderby-use-filter-before-sorted
    public static async Task compliantMethod3(IEnumerable<int> items) {
        var query = from item in items
                    where item > 10
                    orderby item
                    select item;
    }

    // ok: gci91-csharp-use-where-before-orderby-use-filter-before-sorted
    public static async Task compliantMethod4(IEnumerable<int> items) {
        var query = from item in items
                    where item > 10
                    orderby item descending
                    select item;
    }
}
