// == Non compliant Code Example

// ruleid: gci9-javascript-importing-everything-from-library-should-be-avoided
import lodash from "lodash";

// ruleid: gci9-javascript-importing-everything-from-library-should-be-avoided
import * as lodash from "lodash";

// ruleid: gci9-javascript-importing-everything-from-library-should-be-avoided
import _ from "underscore";

// == Compliant Solution

// ok: gci9-javascript-importing-everything-from-library-should-be-avoided
import { isEmpty } from "lodash";
// ok: gci9-javascript-importing-everything-from-library-should-be-avoided
import isEmpty from "lodash/isEmpty";
// ok: gci9-javascript-importing-everything-from-library-should-be-avoided
import intersect from "lodash/intersect";
// ok: gci9-javascript-importing-everything-from-library-should-be-avoided
import map from "underscore/modules/map.js";
