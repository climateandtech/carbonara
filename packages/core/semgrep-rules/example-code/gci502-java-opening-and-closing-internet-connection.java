// Non-compliant examples
for (int val : myArray) {
    URL.openConnection();
}


// Compliant solutions
URLConnection connection = URL.openConnection();
for (int val : myArray) {
    // Use the same connection
}
