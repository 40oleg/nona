// Linked with the native helpers of node:net and node:http. node:http hands
// its JSON response path (#155) to the json-response prelude through this
// hook; nona:internal/native takes it from the global object and deletes it,
// as it does the host functions.
(function () {
    var vm = __nonaRegexpVm;
    Object.defineProperty(globalThis, "__nonaHttpJson", {
        value: function (http) {
            vm.httpJson = http;
        },
        writable: true,
        configurable: true,
    });
})();
