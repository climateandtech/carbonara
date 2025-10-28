<?php
// When iterating over any collection, fetch the size of the collection in advance to avoid fetching it on each iteration, this saves CPU cycles, and therefore consumes less power.
// NB : note that we are using the `count()` method to get the size of an array but it would work the same with the `sizeof()` and `iterator_count()` methods.

// == Non compliant Code Example

$array = array('orange', 'banana', 'apple', 'carrot', 'collard', 'pea');
// ruleid: gci3-php-avoid-getting-the-size-of-the-collection-in-the-loop
for ($i = 0; $i < count($array); ++$i) {
	var_dump($array[$i]);
}

// ruleid: gci3-php-avoid-getting-the-size-of-the-collection-in-the-loop
for ($i = 0; count($array) > $i; ++$i) {
	var_dump($array[$i]);
}

$i = 0;
// ruleid: gci3-php-avoid-getting-the-size-of-the-collection-in-the-loop
while($i < count($array)) {
	var_dump($array[$i]);
	++$i;
}

$i = 0;
// ruleid: gci3-php-avoid-getting-the-size-of-the-collection-in-the-loop
while(count($array) > $i) {
	var_dump($array[$i]);
	++$i;
}

$i = 0;
// ruleid: gci3-php-avoid-getting-the-size-of-the-collection-in-the-loop
do {
	var_dump($array[$i]);
	++$i;
} while ($i < count($array));

$i = 0;
// ruleid: gci3-php-avoid-getting-the-size-of-the-collection-in-the-loop
do {
	var_dump($array[$i]);
	++$i;
} while (count($array) > $i);

// == Compliant Solution

// ok: gci3-php-avoid-getting-the-size-of-the-collection-in-the-loop
$size = sizeof($array);
for ($i = 0; $i < $size; ++$i) {
	var_dump($array[$i]);
}

// ok: gci3-php-avoid-getting-the-size-of-the-collection-in-the-loop
$size = sizeof($array);
for ($i = 0; $size > $i; ++$i) {
	var_dump($array[$i]);
}

// ok: gci3-php-avoid-getting-the-size-of-the-collection-in-the-loop
$i = 0;
$size = count($array);
while($i < $size) {
	var_dump($array[$i]);
	++$i;
}

// ok: gci3-php-avoid-getting-the-size-of-the-collection-in-the-loop
$i = 0;
$size = count($array);
while($size > $i) {
	var_dump($array[$i]);
	++$i;
}

// ok: gci3-php-avoid-getting-the-size-of-the-collection-in-the-loop
$i = 0;
$size = count($array);
do {
	var_dump($array[$i]);
	++$i;
} while ($i < $size);

// ok: gci3-php-avoid-getting-the-size-of-the-collection-in-the-loop
$i = 0;
$size = count($array);
do {
	var_dump($array[$i]);
	++$i;
} while ($size > $i);
?>
