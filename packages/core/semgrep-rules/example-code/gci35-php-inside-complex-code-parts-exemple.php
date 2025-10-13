# Non-compliant examples
try
{
  $picture = PDF_open_image_file($PDF, "jpeg", $imgFile, "", 0); // This is the original statement, this works on PHP4
}
catch(Exception $ex)
{
  $msg = "Error opening $imgFile for Product $row['Identifier']";
  throw new Exception($msg);
}


# Compliant solutions
//try
if (file_exists($imgFile)) {
    $picture = PDF_open_image_file($PDF, "jpeg", $imgFile, "", 0);
}

//catch
if (!$picture) {
   $msg = "Error opening $imgFile for Product $row['Identifier']";
   print $msg;
}
