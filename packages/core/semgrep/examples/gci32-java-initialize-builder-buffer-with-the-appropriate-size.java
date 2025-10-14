// == Non compliant Code Example

class NonCompliantBuilder {
    public String buildString() {
        StringBuilder sb = new StringBuilder();
// ruleid: gci32-java-initialize-builder-buffer-with-the-appropriate-size
        for (int i = 0; i < 100; i++) {
            sb.append("a");
        }
        return sb.toString();
    }
}

// == Compliant Solution

// ok: gci32-java-initialize-builder-buffer-with-the-appropriate-size
class CompliantBuilder {
    public String buildString() {
        StringBuilder sb = new StringBuilder(100);
        for (int i = 0; i < 100; i++) {
            sb.append("a");
        }
        return sb.toString();
    }
}
