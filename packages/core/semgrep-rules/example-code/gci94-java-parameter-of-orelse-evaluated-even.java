// Non-compliant examples
Optional.of("creedengo").orElse(getUnpredictedMethod());

Optional.of("creedengo").orElseGet(() -> getUnpredictedMethod());

randomClass.orElse(getUnpredictedMethod());
