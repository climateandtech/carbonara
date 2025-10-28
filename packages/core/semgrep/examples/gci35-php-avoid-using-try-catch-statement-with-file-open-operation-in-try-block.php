<?php
// == Non compliant Code Example

try
{
// ruleid: gci35-php-avoid-using-try-catch-statement-with-file-open-operation-in-try-block
  $picture = PDF_open_image_file($PDF, "jpeg", $imgFile, "", 0);
}
catch(Exception $ex)
{
  $msg = "Error opening $imgFile for Product $row['Identifier']";
  throw new Exception($msg);
}

try {
// ruleid: gci35-php-avoid-using-try-catch-statement-with-file-open-operation-in-try-block
    $handle = fopen("file.txt", "r");
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}

// == Compliant Solution

// ok: gci35-php-avoid-using-try-catch-statement-with-file-open-operation-in-try-block
if (file_exists($imgFile)) {
    $picture = PDF_open_image_file($PDF, "jpeg", $imgFile, "", 0);
}

if (!$picture) {
   $msg = "Error opening $imgFile for Product $row['Identifier']";
   print $msg;
}

// ok: gci35-php-avoid-using-try-catch-statement-with-file-open-operation-in-try-block
if (file_exists("file.txt")) {
    $handle = fopen("file.txt", "r");
} else {
    echo "File not found!";
}
?>
