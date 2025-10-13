// Non-compliant examples
public void foo() {
    for (int i = 0; i < getMyValue(); i++) {  // Noncompliant
        System.out.println(i);
        boolean b = getMyValue() > 6;
    }
}


// Compliant solutions
public void foo() {
    int myValue = getMyValue();
    for (int i = 0; i < myValue; i++) {
        System.out.println(i);
        boolean b = getMyValue() > 6;
    }
}
