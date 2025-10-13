# Non-compliant examples
for ($i = 0; $i <= foo(); $i++) {  // Noncompliant
	// ......
}


# Compliant solutions
$maxI = foo();
for ($i = 0; $i <= $maxI; $i++) {
  .....
}

  OR

for ($i = 0, $maxI = foo(); $i <= $maxI; $i++) {
  .....
}
}
