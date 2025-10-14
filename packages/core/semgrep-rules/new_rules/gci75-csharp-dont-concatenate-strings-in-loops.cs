using System;
using System.Text;

class LoopHandler {
    // ruleid: gci75-csharp-dont-concatenate-strings-in-loops
    public void nonCompliantLoop() {
        string myString = string.Empty;
        for (int i = 0; i < 100; i++)
            myString += i; // Non compliant : this requires a new string allocation on each iteration
    }

    // ok: gci75-csharp-dont-concatenate-strings-in-loops
    public void compliantLoop() {
        var builder = new StringBuilder(); // Creating the buffer itself requires an allocation
        for (int i = 0; i < 100; i++)
            _ = builder.Append(i); // Update the buffer, no allocation required

        string myString = builder.ToString(); // Triggers a string allocation, but only once
    }
}
