// == Non compliant Code Example

// ruleid: gci26-javascript-shorthand-css-notations-should-be-used-to-reduce-stylesheets-size
<div style={{ marginTop: "1em", marginRight: 0, marginBottom: "2em", marginLeft: "0.5em" }}>
    {/* Noncompliant: these properties can be grouped together in the "margin" property */}
</div>

// == Compliant Solution

// ok: gci26-javascript-shorthand-css-notations-should-be-used-to-reduce-stylesheets-size
<div style={{ margin: "1em 0 2em 0.5em" }}>
    {/* Compliant usage of shorthand property */}
</div>

// ok: gci26-javascript-shorthand-css-notations-should-be-used-to-reduce-stylesheets-size
<div style={{ marginLeft: "1em" }}>
    {/* Compliant because we only want a left margin */}
</div>
