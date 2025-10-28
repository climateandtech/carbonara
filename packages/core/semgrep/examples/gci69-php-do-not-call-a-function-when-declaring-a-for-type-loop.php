<?php
function foo() { return 10; }

// ruleid: gci69-php-do-not-call-a-function-when-declaring-a-for-type-loop
for ($i = 0; $i <= foo(); $i++) {
	// ......
}

// ok: gci69-php-do-not-call-a-function-when-declaring-a-for-type-loop
$maxI = foo();
for ($i = 0; $i <= $maxI; $i++) {
  // .....
}

// ok: gci69-php-do-not-call-a-function-when-declaring-a-for-type-loop
for ($i = 0, $maxI = foo(); $i <= $maxI; $i++) {
  // .....
}
?>
