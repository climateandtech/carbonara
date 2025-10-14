using System.Collections.Generic;
using System.Linq;

class CastHandler {
    public void nonCompliantMethod(IEnumerable<string> items) {
    // ruleid: gci90-csharp-use-cast-instead-of-select-to-cast
        var asObjects = items.Select(x => (object)x);
    }

    // ok: gci90-csharp-use-cast-instead-of-select-to-cast
    public void compliantMethod(IEnumerable<string> items) {
        var asObjects = items.Cast<object>();
    }
}
