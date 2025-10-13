<?php
// Non-compliant examples
$aGlobal = "Hello";

function globalLength() {
    global $aGlobal;  // Noncompliant: accessing global variable
    $length = strlen($aGlobal);
    echo $length;
}

globalLength();


// Compliant solutions
$aGlobal = "Hello";

function someVarLength($str) {  // Compliant: passed as parameter
    $length = strlen($str);
    echo $length;
}

someVarLength($aGlobal);
