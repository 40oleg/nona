class FieldSplitter {
  [Symbol.split](text, limit = Infinity) {
    const fields = []; let current = "", quoted = false;
    for (const char of text) {
      if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { fields.push(current); current = ""; }
      else current += char;
    }
    fields.push(current); return fields.slice(0, limit);
  }
}
console.log(JSON.stringify('a,"b,c",d'.split(new FieldSplitter(), 2)));
