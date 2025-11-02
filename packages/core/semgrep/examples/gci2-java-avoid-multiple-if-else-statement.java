// If we are using too many conditional IF, ELSEIF or ELSE statements it will impact performance.
// We can think of using a switch statement instead of multiple if-else if possible, or refactor code
// to reduce number of IF, ELSEIF and ELSE statements. Sometimes called "complexity cyclomatic".
// Switch statement has a performance advantage over if – else.

// == Non compliant Code Example

// [source,java]
// ----
int index = 1;
int nb = 2;
//...
// ruleid: gci2-java-avoid-multiple-if-else-statement
if (nb == 0) {
    nb = index;
} else if (nb == 1) {
    nb = index * 2;
} else if (nb == 2) {
    nb = index * 3;
} else {
    nb = -1;
}
// ----

// == Compliant Code Example

// [source,java]
// ----
// ok: gci2-java-avoid-multiple-if-else-statement
int index = 1;
int nb = 2;
//...
switch (nb) {
    case 0:
    case 1:
    case 2:
        nb = index * (nb + 1);
        break;
    default:
        nb = -1;
}
// ----
