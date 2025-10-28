// == Non compliant Code Example

// ruleid: gci12-javascript-multiple-style-changes-should-be-batched
element.style.height = "800px";
element.style.width = "600px";
element.style.color = "red";

// == Compliant Solution

// ok: gci12-javascript-multiple-style-changes-should-be-batched
element.addClass("in-error");
