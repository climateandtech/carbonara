// Non-compliant examples
Optional.of("creedengo").orElse(getUnpredictedMethod());

Optional.of("creedengo").orElseGet(() -> getUnpredictedMethod());

randomClass.orElse(getUnpredictedMethod());


// Compliant solutions
Optional<String> opt = Optional.empty();
opt.orElse("default_value");
