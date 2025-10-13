// Non-compliant examples
StringBuilder sb = new StringBuilder(); // Noncompliant
for (int i = 0; i < 100; i++) {
    sb.append(...);
}


// Compliant solutions
StringBuilder sb = new StringBuilder(100);
for (int i = 0; i < 100; i++) {
    sb.append(...);
}
