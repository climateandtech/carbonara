class IncrementHandler {
    int i = 0;

    public void nonCompliantIncrement() {
    // ruleid: gci67-java-use-plus-plus-i-instead-of-i-plus-plus
        i++;
    }

    // ok: gci67-java-use-plus-plus-i-instead-of-i-plus-plus
    public void compliantIncrement() {
        ++i;
    }

    // ok: gci67-java-use-plus-plus-i-instead-of-i-plus-plus
    void bar(int value) {
        // ...
    }

    // ok: gci67-java-use-plus-plus-i-instead-of-i-plus-plus
    int foo() {
        int i = 0;
        bar(i++);
        return i;
    }

    // ok: gci67-java-use-plus-plus-i-instead-of-i-plus-plus
    int foo2() {
        return this.i++;
    }
}
