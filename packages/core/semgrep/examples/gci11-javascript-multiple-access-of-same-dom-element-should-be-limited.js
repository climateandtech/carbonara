// == Non compliant Code Example

// ruleid: gci11-javascript-multiple-access-of-same-dom-element-should-be-limited
const width = document.getElementById('block').clientWidth;
const height = document.getElementById('block').clientHeight;

// == Compliant Solution

// ok: gci11-javascript-multiple-access-of-same-dom-element-should-be-limited
const blockElement = document.getElementById('block');
const width_compliant = blockElement.clientWidth;
const height_compliant = blockElement.clientHeight;
