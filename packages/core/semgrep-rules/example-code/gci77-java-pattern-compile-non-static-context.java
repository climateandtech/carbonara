// Non-compliant examples
public class AvoidRegexPatternNotStatic {
    public boolean foo() {
        final Pattern pattern = Pattern.compile("foo"); // Noncompliant
        return pattern.matcher("foo").find();
    }
}


// Compliant solutions
public class ValidRegexPattern {
    private static final Pattern pattern = Pattern.compile("foo"); // Compliant

    public boolean foo() {
        return pattern.matcher("foo").find();
    }
}

public class ValidRegexPattern2 {
    private final Pattern pattern = Pattern.compile("foo"); // Compliant

    public boolean foo() {
        return pattern.matcher("foo").find();
    }
}

public class ValidRegexPattern3 {
    private final Pattern pattern;

    public ValidRegexPattern3() {
        pattern = Pattern.compile("foo"); // Compliant
    }

    public boolean foo() {
        return pattern.matcher("foo").find();
    }
}
