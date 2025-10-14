// When iterating over any collection, fetch the size of the collection in advance to avoid fetching it on each iteration, this saves CPU cycles, and therefore consumes less power. The example provided below illustrates what should be avoided.

// == Non compliant Code Example

// [source,java]
// ----
List<String> objList = getData();

// ruleid: gci3-java-avoid-getting-the-size-of-the-collection-in-the-loop
for (int i = 0; i < objList.size(); i++) {  // Noncompliant
    // execute code
}
// ----

// == Compliant Solution

// [source,java]
// ----
// ok: gci3-java-avoid-getting-the-size-of-the-collection-in-the-loop
List<String> objList = getData();

int size = objList.size();
for (int i = 0; i < size; i++) {
    // execute code
}
// ----
