<?php
// == Non compliant Code Example

// ruleid: gci35-php-avoid-using-try-catch-statement-with-file-open-operation-in-try-block
try
{
  $picture = PDF_open_image_file($PDF, "jpeg", $imgFile, "", 0);
}
catch(Exception $ex)
{
  $msg = "Error opening $imgFile for Product $row['Identifier']";
  throw new Exception($msg);
}

// ruleid: gci35-php-avoid-using-try-catch-statement-with-file-open-operation-in-try-block
try {
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
