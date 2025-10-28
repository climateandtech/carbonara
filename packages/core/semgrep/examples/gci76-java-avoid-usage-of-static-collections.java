import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

class AvoidUsageOfStaticCollections {
    // ruleid: gci76-java-avoid-usage-of-static-collections
    public static final List<String> LIST = new ArrayList<>();
    // ruleid: gci76-java-avoid-usage-of-static-collections
    public static final Set<String> SET = new HashSet<>();
    // ruleid: gci76-java-avoid-usage-of-static-collections
    public static final Map<String, String> MAP = new HashMap<>();
}

class GoodUsageOfStaticCollections {
    // ok: gci76-java-avoid-usage-of-static-collections
    public static volatile GoodUsageOfStaticCollections INSTANCE = new GoodUsageOfStaticCollections();

    public final List<String> LIST = new ArrayList<>();
    public final Set<String> SET = new HashSet<>();
    public final Map<String, String> MAP = new HashMap<>();

    private GoodUsageOfStaticCollections() {
    }
}
