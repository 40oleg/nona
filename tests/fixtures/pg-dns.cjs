// Self-contained equivalent of pg@8.16.3 connection-parameters.js's DNS call.
// Only the hostaddr portion of getLibpqConnectionString is reproduced here.
const dns = require("dns");
exports.lookup = dns.lookup;
exports.hostaddr = function (host, callback) {
    dns.lookup(host, function (error, address) {
        if (error) return callback(error, null);
        return callback(null, "hostaddr='" + address + "'");
    });
};
