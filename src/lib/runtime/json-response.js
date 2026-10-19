// x.end(JSON.stringify(...)) (#155): linked only when the lowered program
// calls rt.prelude.endJson (src/link.ts). The lowering has already read
// x.end and JSON.stringify and evaluated the arguments; when end is node:http's
// own end method and stringify the intrinsic JSON.stringify, the response is
// serialized straight into UTF-8 bytes (vm.httpJson, registered by node:http
// through the network prelude). Otherwise this returns undefined and the
// lowered code makes the two calls itself; the internal end methods return
// the message, never undefined.
(function () {
    var vm = __nonaRegexpVm,
        stringify = JSON.stringify;
    vm.endJson = function (receiver, end, json, value, replacer, space) {
        var http = vm.httpJson;
        if (
            http === undefined ||
            json !== stringify ||
            (end !== http.end && end !== http.serverEnd)
        )
            return undefined;
        return http.endJson(receiver, end, value, replacer, space);
    };
})();
