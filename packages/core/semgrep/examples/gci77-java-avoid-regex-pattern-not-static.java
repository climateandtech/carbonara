import java.util.regex.Pattern;

public class AvoidUsageOfStaticCollections {
    public boolean foo() {
    // ruleid: gci77-java-avoid-regex-pattern-not-static
        final Pattern pattern = Pattern.compile("foo"); // Noncompliant
        return pattern.matcher("foo").find();
    }
}

public class ValidRegexPattern {
    // ok: gci77-java-avoid-regex-pattern-not-static
    private static final Pattern pattern = Pattern.compile("foo"); // Compliant

    public boolean foo() {
        return pattern.matcher("foo").find();
    }
}

public class ValidRegexPattern2 {
    // ok: gci77-java-avoid-regex-pattern-not-static
    private final Pattern pattern = Pattern.compile("foo"); // Compliant

    public boolean foo() {
        return pattern.matcher("foo").find();
    }
}

public class ValidRegexPattern3 {
    private final Pattern pattern;

    // ok: gci77-java-avoid-regex-pattern-not-static
    public ValidRegexPattern3() {
        pattern = Pattern.compile("foo"); // Compliant
    }

    public boolean foo() {
        return pattern.matcher("foo").find();
    }
}
