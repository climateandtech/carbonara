// Non-compliant examples
int len = array.length;
boolean[] copy = new boolean[array.length];
for (int i = 0; i < len; i++) {
    copy[i] = array[i];  // Noncompliant
}
return copy;


// Compliant solutions
int[] copy = new int[array.length];
System.arraycopy(array, 0, copy, 0, array.length);
return copy;
