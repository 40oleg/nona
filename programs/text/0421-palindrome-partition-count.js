const text = 'aababa';
const ways = Array(text.length + 1).fill(0);
ways[text.length] = 1;
for (let start = text.length - 1; start >= 0; start--) {
  for (let end = start; end < text.length; end++) {
    let palindrome = true;
    for (let l = start, r = end; l < r; l++, r--) if (text[l] !== text[r]) palindrome = false;
    if (palindrome) ways[start] += ways[end + 1];
  }
}
console.log(JSON.stringify({ count: ways[0], suffixCounts: ways }));
