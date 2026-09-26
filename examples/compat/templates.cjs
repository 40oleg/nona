var count = 0;
function next() { return ++count; }
console.log(`first=${next()}, second=${next()}`);

var value = {toString() { return "text"; }, valueOf() { return 8; }};
console.log(`value=${value}`);
console.log(`nested=${`item${count}`}`);
