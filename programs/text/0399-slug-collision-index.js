const titles = ['Hello World', 'Hello World!', 'Other Page', 'hello-world'];
const counts = new Map();
const slugs = titles.map(title => {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const number = (counts.get(base) || 0) + 1;
  counts.set(base, number);
  const slug = number === 1 ? base : base + '-' + number;
  return slug;
});
console.log(JSON.stringify(slugs));
