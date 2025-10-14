// == Non compliant Code Example

// ruleid: gci535-javascript-using-external-libraries-for-number-format-should-be-avoided-in-favor-or-intl-numberformat
import numbro from "numbro";
numbro.setLanguage('en-GB');
var string_numbro = numbro(1000).format({
  thousandSeparated: true,
});

// ruleid: gci535-javascript-using-external-libraries-for-number-format-should-be-avoided-in-favor-or-intl-numberformat
import { format } from "numerable";
var string_numerable = format(1000, '0,0');

// == Compliant Solution

// ok: gci535-javascript-using-external-libraries-for-number-format-should-be-avoided-in-favor-or-intl-numberformat
new Intl.NumberFormat("en-GB").format(1000);
