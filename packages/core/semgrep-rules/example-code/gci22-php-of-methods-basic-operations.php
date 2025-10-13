# Non-compliant examples
$min = min($a, $b);  // Noncompliant


# Compliant solutions
$min = $a < $b ? $a : $b;
