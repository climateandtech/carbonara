// == Non compliant Code Example

function NonCompliantComponent() {
  return (
    // ruleid: gci29-javascript-css-animations-should-be-avoided
    <div style={{ border: "1px solid black", transition: "border 2s ease" }}/>
  );
}

// == Compliant Solution

function CompliantComponent() {
  return (
    // ok: gci29-javascript-css-animations-should-be-avoided
    <div style={{ border: "1px solid black" }}/>
  );
}
