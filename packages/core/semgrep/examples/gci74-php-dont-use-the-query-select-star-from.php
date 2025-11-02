<?php
function foo() {
    // ruleid: gci74-php-dont-use-the-query-select-star-from
    $baseQuery = "SELECT * FROM users";
}

function bar() {
    // ok: gci74-php-dont-use-the-query-select-star-from
    $baseQuery = "SELECT id, name, address FROM users";
}
?>
