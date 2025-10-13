<?php
// Non-compliant examples
public function foo() {
    // ...
    $baseQuery = "SELECT name FROM users where id = ";

    for ($i = 0; $i < 20; ++$i) {

        $query = $baseQuery . $i;
        $connection = mysql_connect($dbhost, $dbuser, $dbpass) or die("Unable to Connect to '$dbhost'");
            mysql_select_db($dbname) or die("Could not open the db '$dbname'");
        $result = mysql_query($this->Query);// Noncompliant

        // iterate through the result
        // ...
        mysql_close($connection);
    }
    // ...
}


// Compliant solutions
public function foo() {
    // ...
    $query = "SELECT name FROM users where id in (";

    for ($i = 0; $i < 20; ++$i) {
        $query .= ',' . $i;
    }
    $query .= ')';

    $connection = mysql_connect($dbhost, $dbuser, $dbpass) or die("Unable to Connect to '$dbhost'");
    mysql_select_db($dbname) or die("Could not open the db '$dbname'");
    $result = mysql_query($this->Query); // compliant

    // iterate through the result
    // ...
    mysql_close($connection);
}
