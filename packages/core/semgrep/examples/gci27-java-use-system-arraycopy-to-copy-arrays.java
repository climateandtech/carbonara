// == Non compliant Code Example

class ArrayCopyNonCompliant {
    public boolean[] copyArray(boolean[] array) {
        int len = array.length;
        boolean[] copy = new boolean[array.length];
// ruleid: gci27-java-use-system-arraycopy-to-copy-arrays
        for (int i = 0; i < len; i++) {
            copy[i] = array[i];
        }
        return copy;
    }
}

// == Compliant Solution

// ok: gci27-java-use-system-arraycopy-to-copy-arrays
class ArrayCopyCompliant {
    public int[] copyArray(int[] array) {
        int[] copy = new int[array.length];
        System.arraycopy(array, 0, copy, 0, array.length);
        return copy;
    }
}
