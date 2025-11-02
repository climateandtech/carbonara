import java.util.List;
import java.util.stream.Collectors;

class StreamHandler {
    public void nonCompliantStream(List<String> list) {
    // ruleid: gci91-java-use-where-before-orderby-use-filter-before-sorted
        list.stream()
                .sorted()
                .filter(s -> s.startsWith("A"))
                .collect(Collectors.toList());
    }

    // ok: gci91-java-use-where-before-orderby-use-filter-before-sorted
    public void compliantStream(List<String> list) {
        list.stream()
                .filter(s -> s.startsWith("A"))
                .sorted()
                .collect(Collectors.toList());
    }
}
