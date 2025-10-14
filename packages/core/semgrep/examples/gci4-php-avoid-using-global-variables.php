<?php
// ruleid: gci4-php-avoid-using-global-variables
$a = 1;
function my_func() {
    global $a;
    $a = 2;
}

// ruleid: gci4-php-avoid-using-global-variables
$b = 1;
function my_other_func() {
    $GLOBALS['b'] = 2;
}

// ok: gci4-php-avoid-using-global-variables
$c = 1;
function my_compliant_func(&$c_arg) {
    $c_arg = 2;
}
my_compliant_func($c);
?>
