// Non-compliant examples
public void readPreferences(String filename) {
    //...
    InputStream in = null;
    try {
        in = new FileInputStream(filename);
    } catch (FileNotFoundException e) {
        logger.log(e);
    }
    in.read(...);
    //...
}


// Compliant solutions
public void readPreferences(String filename) throws IllegalArgumentException, FileNotFoundException, IOException {
    if (filename == null) {
        throw new IllegalArgumentException ("filename is null");
    }
    //...
    InputStream in = new FileInputStream(filename);
    //...
}
