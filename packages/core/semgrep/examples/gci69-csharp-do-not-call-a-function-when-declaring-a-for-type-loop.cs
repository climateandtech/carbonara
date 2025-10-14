using System;

class LoopHandler {
    static int getMaxValue() => 10;
    static int getValue(int n) => n;

    // ruleid: gci69-csharp-do-not-call-a-function-when-declaring-a-for-type-loop
    public void nonCompliantLoop1() {
        for (int i = 0; i < getMaxValue(); i++)
            Console.WriteLine(i);
    }

    // ruleid: gci69-csharp-do-not-call-a-function-when-declaring-a-for-type-loop
    public void nonCompliantLoop2() {
        int j = 10;
        for (int i = 0; i < getValue(j); i++)
            Console.WriteLine(i);
    }

    // ok: gci69-csharp-do-not-call-a-function-when-declaring-a-for-type-loop
    public void compliantLoop1() {
        int maxValue = getMaxValue();
        for (int i = 0; i < maxValue; i++)
            Console.WriteLine(i);
    }

    // ok: gci69-csharp-do-not-call-a-function-when-declaring-a-for-type-loop
    public void compliantLoop2() {
        int j = 10;
        for (int i = 0; i < getValue(j); i++) {
            if (i % 2 == 0) j--;
            Console.WriteLine(i);
        }
    }
}
