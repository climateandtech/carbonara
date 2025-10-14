class LoopHandler {
    int getMyValue() { return 10; }
    boolean hasNext() { return true; }
    Object next() { return new Object(); }

    public void nonCompliantLoop() {
        for (int i = 0; i < getMyValue(); i++) {
    // ruleid: gci69-java-do-not-call-a-function-when-declaring-a-for-type-loop
            System.out.println(i);
            boolean b = getMyValue() > 6;
        }
    }

    // ok: gci69-java-do-not-call-a-function-when-declaring-a-for-type-loop
    public void compliantLoop() {
        int myValue = getMyValue();
        for (int i = 0; i < myValue; i++) {
            System.out.println(i);
            boolean b = getMyValue() > 6;
        }
    }

    // ok: gci69-java-do-not-call-a-function-when-declaring-a-for-type-loop
    public void iteratorLoop() {
        for (int i = 0; hasNext(); i++) {
            System.out.println(next());
        }
    }
}
