// Non-compliant examples
i++  // Noncompliant


// Compliant solutions
++i

void bar(int value) {
    // ...
}

int foo() {
    int i = 0;
    bar(i++);
    return i;
}
