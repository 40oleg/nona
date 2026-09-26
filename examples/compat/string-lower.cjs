console.log('ABC À İ 𐐀'.toLowerCase());
console.log('AΣ AΣB A.Σ AΣ.b AͅΣ AΣͅB'.toLowerCase());
console.log(String.prototype.toLowerCase.call({ toString: function () { return 'AΣ'; } }));
