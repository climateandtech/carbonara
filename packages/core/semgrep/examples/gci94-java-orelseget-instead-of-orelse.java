import java.util.Optional;

class OptionalHandler {
    String getUnpredictedMethod() { return "default"; }

    public void nonCompliantMethod1() {
    // ruleid: gci94-java-orelseget-instead-of-orelse
        Optional.of("creedengo").orElse(getUnpredictedMethod());
    }

    public void nonCompliantMethod2() {
        Optional<String> randomClass = Optional.empty();
    // ruleid: gci94-java-orelseget-instead-of-orelse
        randomClass.orElse(getUnpredictedMethod());
    }

    // ok: gci94-java-orelseget-instead-of-orelse
    public void compliantMethod() {
        Optional.of("creedengo").orElseGet(() -> getUnpredictedMethod());
    }
}
