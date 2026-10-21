// lodash 4.17.21 doing what application code does with it: groupBy, sortBy,
// uniqBy, chunk, debounce-free data shaping, template-free string helpers and
// deep clone/equality over S(50 000) records. Run from bench/real after
// `node bench/real/fetch.mjs`.
import _ from "./vendor/lodash/lodash.js";
const SCALE = Number(process.env.SCALE) || 1;
const S = (n) => Math.max(1, Math.round(n * SCALE));

const users = [];
let seed = 11;
const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
for (let i = 0; i < S(50000); i++)
    users.push({
        id: i,
        name: "user_" + (next() % 5000),
        age: 18 + (next() % 60),
        city: "city" + (next() % 50),
        scores: [next() % 100, next() % 100, next() % 100],
        profile: { active: i % 2 === 0, tags: ["a", "b", "c"].slice(0, i % 3) },
    });

let check = 0;
let t = performance.now();
const byCity = _.groupBy(users, "city");
const sorted = _.sortBy(users, ["city", "age"]);
const unique = _.uniqBy(users, "name");
check += Object.keys(byCity).length + sorted[0].id + unique.length;
const tCollections = performance.now() - t;

t = performance.now();
const chunks = _.chunk(users, 100);
const totals = _.map(chunks, (chunk) =>
    _.sumBy(chunk, (u) => _.mean(u.scores)),
);
const ages = _.countBy(users, (u) => Math.floor(u.age / 10) * 10);
const picked = _.map(users, (u) => _.pick(u, ["id", "name", "age"]));
check += totals.length + Object.keys(ages).length + picked.length;
const tFunctional = performance.now() - t;

t = performance.now();
let strings = 0;
for (let i = 0; i < S(50000); i++) {
    const u = users[i];
    strings += _.camelCase(u.name + " " + u.city).length;
    strings += _.kebabCase(u.city + "_" + u.id).length;
    strings += _.capitalize(u.name).length;
}
check += strings;
const tStrings = performance.now() - t;

t = performance.now();
const cloned = _.cloneDeep(users.slice(0, S(10000)));
let equal = 0;
for (let i = 0; i < cloned.length; i++)
    if (_.isEqual(cloned[i], users[i])) equal++;
const merged = _.merge({}, { a: users[0] }, { a: { extra: 1 } });
check += equal + Object.keys(merged.a).length;
const tDeep = performance.now() - t;

console.log(
    JSON.stringify({
        collections: tCollections,
        functional: tFunctional,
        strings: tStrings,
        deep: tDeep,
        check,
    }),
);
