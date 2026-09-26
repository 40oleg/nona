console.log('é'.normalize('NFD'), 'e\u0301'.normalize('NFC'));
console.log('Å'.normalize('NFKD'), '각'.normalize('NFD'), '각'.normalize('NFC'));
console.log('़̣̀'.normalize('NFD'), 'ﬁ'.normalize('NFKC'));
var receiver = {toString: function () { return 'e\u0301'; }};
var form = {toString: function () { return 'NFC'; }};
console.log(String.prototype.normalize.call(receiver, form));
