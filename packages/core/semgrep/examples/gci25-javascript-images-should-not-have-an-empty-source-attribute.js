// == Non compliant Code Example

return (
  <>
    // ruleid: gci25-javascript-images-should-not-have-an-empty-source-attribute
    <img src="" />
    // ruleid: gci25-javascript-images-should-not-have-an-empty-source-attribute
    <img />
  </>
)

// == Compliant Solution

import myLogo from "./logo.svg"
return (
  <>
    // ok: gci25-javascript-images-should-not-have-an-empty-source-attribute
    <img src="./logo.svg" />
    // ok: gci25-javascript-images-should-not-have-an-empty-source-attribute
    <img src={myLogo} />
  </>
)
