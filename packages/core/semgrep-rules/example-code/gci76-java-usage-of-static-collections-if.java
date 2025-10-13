// Non-compliant examples
/**
 * Not compliant
 */
public class AvoidUsageOfStaticCollections {
    public static final List<> LIST = new ArrayList<>();
    public static final Set<> SET = new HashSet<>();
    public static final Map<> MAP = new HashMap<>();
}


// Compliant solutions
/**
 * Compliant
 */
public class GoodUsageOfStaticCollections {
    public static volatile GoodUsageOfStaticCollections INSTANCE = new GoodUsageOfStaticCollections();

    public final List<> LIST = new ArrayList<>();
    public final Set<> SET = new HashSet<>();
    public final Map<> MAP = new HashMap<>();

    private GoodUsageOfStaticCollections() {
    }
}
