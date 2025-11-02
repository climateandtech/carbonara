<?php
function foo() {
    // ...
    $dbhost = "localhost";
    $dbuser = "root";
    $dbpass = "password";
    $dbname = "test";
    $this_Query = "SELECT * FROM users";

    for ($i = 0; $i < 20; ++$i) {
        $query = "SELECT name FROM users where id = " . $i;
        $connection = mysql_connect($dbhost, $dbuser, $dbpass) or die("Unable to Connect to '$dbhost'");
            mysql_select_db($dbname) or die("Could not open the db '$dbname'");
    // ruleid: gci72-php-avoid-sql-request-in-loop
        $result = mysql_query($this_Query); // Noncompliant

        // iterate through the result
        // ...
        mysql_close($connection);
    }
    // ...
}

function bar() {
    // ...
    $dbhost = "localhost";
    $dbuser = "root";
    $dbpass = "password";
    $dbname = "test";
    $this_Query = "SELECT name FROM users where id in (";

    // ok: gci72-php-avoid-sql-request-in-loop
    for ($i = 0; $i < 20; ++$i) {
        $this_Query .= ',' . $i;
    }
    $this_Query .= ')';

    $connection = mysql_connect($dbhost, $dbuser, $dbpass) or die("Unable to Connect to '$dbhost'");
    mysql_select_db($dbname) or die("Could not open the db '$dbname'");
    $result = mysql_query($this_Query); // compliant

    // iterate through the result
    // ...
    mysql_close($connection);
}
?>
