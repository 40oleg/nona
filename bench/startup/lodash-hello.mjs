// Start-up of a mid-size program: load lodash 4.17.21 (17 000 lines) and use
// one function. Measured by the start-up table of PERFORMANCE.md (bench/report.mjs
// --suite startup) after `node bench/real/fetch.mjs`.
import _ from "../real/vendor/lodash/lodash.js";
console.log(_.camelCase("hello world") + " " + _.VERSION);
