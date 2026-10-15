# হোস্ট API

::: info অনুবাদ
এই পৃষ্ঠাটি ইংরেজি পৃষ্ঠা [Host APIs](/reference/host-apis)-এর অনুবাদ, যা [`docs/host-apis.md`](https://github.com/40oleg/nona/blob/main/docs/host-apis.md) থেকে তৈরি। ইংরেজি সংস্করণটিই প্রামাণিক এবং সেটি আরও নতুন হতে পারে।
:::

Nona প্রোগ্রাম Node.js ছাড়াই চলে। নিচের হোস্ট API-গুলো বাস্তবায়ন করে নেটিভ রানটাইম এবং ছোট JavaScript প্রিলিউড, যা প্রতিটি এক্সিকিউটেবলে কম্পাইল হয়।

## Paths (`node:path`)

`node:path` / `path` implements Node.js 26 path utilities on all eight native targets.
Use `posix`, `win32`, or explicit flavor modules (`node:path/posix`,
`node:path/win32`, `path/posix`, `path/win32`). Functions: `normalize`, `join`,
`resolve`, `relative`, `parse`, `format`, `basename`, `dirname`, `extname`,
`isAbsolute`, `toNamespacedPath`, `matchesGlob`; properties: `sep`, `delimiter`.
The target selects the default flavor; resolution reads the executable's runtime
current directory. Working-directory information is read on demand; importing
Path does not initialize the full process object. [Full reference](https://github.com/40oleg/nona/blob/main/docs/path.md).

## টাইমার ও ইভেন্ট লুপ

গ্লোবাল: `setTimeout(callback, delay, ...args)`, `setInterval`, `clearTimeout`, `clearInterval`, `setImmediate(callback, ...args)`, `clearImmediate`, `queueMicrotask(callback)` ও `performance.now()`।

- টপ-লেভেল প্রোগ্রামের পরে এন্ট্রি একটি ইভেন্ট লুপ চালায়: এটি Promise জব কিউ খালি করে, তারপর বারবার নিকটতম টাইমারের সময়সীমার জন্য অপেক্ষা করে, সেই কলব্যাক চালায় এবং আবার জব কিউ খালি করে। কোনো টাইমার বাকি না থাকলে প্রসেস বের হয়ে যায়।
- টাইমারগুলো সময়সীমা অনুযায়ী, তারপর নিবন্ধনের ক্রম অনুযায়ী সাজানো হয়। বিলম্ব (delay) Node.js অনুসরণ করে: এটি `ToNumber` দিয়ে রূপান্তরিত হয়, এবং যে মান `NaN`, 1-এর কম বা 2^31-1-এর বেশি, সেগুলো 1 হয়ে যায়।
- টাইমার id হলো Number (Node.js `Timeout` অবজেক্ট ফেরত দেয়)। `clearTimeout` ও `clearInterval` যেকোনো id গ্রহণ করে; অজানা id উপেক্ষা করা হয়।
- অপেক্ষা Windows-এ `Sleep` এবং Linux-এ `nanosleep` ব্যবহার করে, তাই নিষ্ক্রিয় প্রোগ্রাম CPU ব্যবহার করে না। Windows-এ রেজোলিউশন হলো সিস্টেম টাইমার টিক (সাধারণত 15.6 ms)।
- `performance.now()` মনোটোনিক ঘড়ি (`QueryPerformanceCounter`, `clock_gettime(CLOCK_MONOTONIC)`) ব্যবহার করে এবং প্রোগ্রাম শুরু থেকে মিলিসেকেন্ড গোনে।
- টাইমার কলব্যাকে না-ধরা এক্সেপশন প্রসেসকে এক্সিট কোড 1 দিয়ে বন্ধ করে, ঠিক টপ-লেভেল প্রোগ্রামে না-ধরা এক্সেপশনের মতো।
- Test262 হোস্টের তৈরি realm নিজস্ব টাইমার স্থাপন করে না।

## দীর্ঘ সময় চলা প্রোগ্রাম

- কালেক্টর কমিট করা coroutine স্ট্যাক (প্রতিটি চলমান async ফাংশন বা জেনারেটরের জন্য 1 MiB, `rt.generatorStackBytes`) তার থ্রেশহোল্ডে গণনা করে, তাই পরিত্যক্ত coroutine, যাদের স্ট্যাক কেবল sweep-ই মুক্ত করে, সাধারণ আবর্জনার মতোই কালেকশন চালু করে।
- `tests/stability.test.ts` যাচাই করে যে দশ গুণ বেশি টাইমার ফায়ারিং (প্রতিটি টিকে promise জব ও আবর্জনাসহ) সর্বোচ্চ মেমরি বাড়ায় না, হাজার হাজার পরিত্যক্ত coroutine মুক্ত হয়, এবং দুই সেকেন্ডের টাইমারের জন্য অপেক্ষারত প্রোগ্রাম প্রায় কোনো CPU ব্যবহার করে না।
- জানা সীমাবদ্ধতা: প্রপার্টি, এলিমেন্ট ও Map স্টোরেজ রৈখিক (#36), তাই শত শত জীবিত টাইমার বা বড় অবজেক্টসহ প্রোগ্রাম ধীর হয়ে যায়; Linux-এ প্রতিটি হিপ ব্লক একটি আলাদা মেমরি ম্যাপিং (#37)।

## Events

`node:events`, `events` and `nona:events` share one built-in module. The default
export is `EventEmitter`; listener ordering, once/prepend listeners, removal,
introspection, meta events, error monitoring and rejection capture are supported.
Promise `once` and async-iterator `on` include cleanup, close events, externally
supplied abort signals and emitter watermarks. Listener/max-listener helpers and
disposable `addAbortListener` subscriptions under `Symbol.dispose` are also available.
`Symbol.dispose` and `Symbol.asyncDispose` have the distinct symbol identities used by Node.js 26.

See the [English events reference](/reference/host-apis#events) for the
complete supported API and limitations.

## URL {#url}

গ্লোবাল `URL` ও `URLSearchParams` (যেগুলো `node:url`-ও এক্সপোর্ট করে) [URL Standard](https://url.spec.whatwg.org/) মেনে চলে: ডিফল্ট পোর্টসহ বিশেষ স্কিম (`http`, `https`, `ws`, `wss`, `ftp`, `file`), ব্যাকস্ল্যাশ ও ডট সেগমেন্ট, একটি বেসের সাপেক্ষে আপেক্ষিক রেফারেন্স, authority বা অস্বচ্ছ পাথসহ অন্যান্য স্কিম (`mailto:`, `data:`, `blob:`), মানক পার্সেন্ট-এনকোডিং সেট, যেকোনো নোটেশনে IPv4 সংখ্যা এবং IPv6 ঠিকানা। প্রতিটি অংশ পড়া ও সেট করা যায়; `searchParams` `search`-এর সঙ্গে সিঙ্কে থাকে। `URL.canParse` ও `URL.parse` দেওয়া আছে। হোস্ট ছোট হাতের অক্ষরে রূপান্তরিত হয়, কিন্তু IDNA দিয়ে রূপান্তরিত হয় না: অ-ASCII হোস্টসহ URL `ERR_INVALID_URL` থ্রো করে। প্রোগ্রামের সোর্সে `URL` বা `URLSearchParams` উল্লেখ থাকলেই কেবল পার্সারটি প্রোগ্রামে লিঙ্ক হয়। প্রথম URL বা সার্চ প্যারামিটার অবজেক্ট তৈরি হলে (বা `URL.canParse` ডাকা হলে) এর মেথড ও অ্যাক্সেসর `URL.prototype` ও `URLSearchParams.prototype`-এ বসানো হয়; ফলে যে প্রোগ্রাম কখনো URL পার্স করে না তার হিপ ছোট থাকে।

## Node.js সহায়ক মডিউল {#nodejs-support-modules}

এই মডিউলগুলো মূলত [npm প্যাকেজের](/reference/npm) জন্য, যেগুলো স্টার্টআপে এগুলো লোড করে। প্রতিটি `node:<name>` ও `<name>` নামে উপলব্ধ।

- `node:os`: `EOL`, `devNull`, `platform`, `arch`, `machine`, `type`, `endianness`, `homedir` (`HOME`, বা Windows-এ `USERPROFILE`), `tmpdir` (`TMPDIR`/`TMP`/`TEMP`), `hostname` (`HOSTNAME`/`COMPUTERNAME` বা `localhost`), `userInfo`, `uptime`, `freemem`, `totalmem` ও `constants.signals`/`priority`। `release` ও `version` খালি স্ট্রিং, `cpus()` ও `networkInterfaces()` খালি, `loadavg()` শূন্য ফেরত দেয় এবং `availableParallelism()` হলো 1।
- `node:tty`: `isatty(fd)` জানায় স্ট্যান্ডার্ড ইনপুট, আউটপুট বা এরর টার্মিনাল কি না; `ReadStream` ও `WriteStream` ফিচার শনাক্তকরণের জন্য ন্যূনতম ক্লাস।
- `node:util`: `format` ও `formatWithOptions` (`%s %d %i %f %j %o %O %c %%`), `inspect` (`inspect.custom`, `depth`, `breakLength`, `maxArrayLength`, `customInspect` সহ), `inherits`, `promisify` (`promisify.custom` সহ), `callbackify`, `deprecate` (প্রতি কোডে একবার সতর্ক করে), `debuglog` (`NODE_DEBUG`), `isDeepStrictEqual`, `types`, `styleText`, `stripVTControlCharacters`, `TextEncoder`/`TextDecoder` এবং পুরোনো `is*` প্রেডিকেট। `inspect` Node.js-এর বিন্যাসের কাছাকাছি: অবজেক্ট, অ্যারে, Map, Set, টাইপড অ্যারে, ফাংশন, ক্লাস, এরর, তারিখ, বক্সড মান, গেটার ও সার্কুলার রেফারেন্স দেখানো হয়, কিন্তু রং, `showHidden`, `sorted` এবং দীর্ঘ অ্যারেকে কলামে সাজানোর Node.js-এর পদ্ধতি হুবহু পুনরুৎপাদিত হয় না। `node:util/types` হলো `util.types`।
- `node:url`: `URL`, `URLSearchParams`, `fileURLToPath`, `pathToFileURL` (Windows-এ ড্রাইভ লেটার ও UNC হোস্ট), `urlToHttpOptions`, `domainToASCII`/`domainToUnicode` (কেবল ASCII), এবং পুরোনো `parse`, `format` ও `resolve`।
- `node:assert` ও `node:assert/strict`: `ok`, `equal`, `notEqual`, `strictEqual`, `notStrictEqual`, `deepEqual`, `deepStrictEqual` ও তাদের নেতিবাচক রূপ, `throws`, `doesNotThrow`, `rejects`, `doesNotReject`, `match`, `doesNotMatch`, `ifError`, `fail` ও `AssertionError` (`code` `ERR_ASSERTION`)। ব্যর্থতার বার্তা Node.js-এর diff-এর চেয়ে ছোট।
- `node:crypto`: `randomBytes`, `randomFill`/`randomFillSync`, `randomUUID` (ভার্সন 4), `randomInt`, `getRandomValues` ও `webcrypto.getRandomValues` অপারেটিং সিস্টেমের র‍্যান্ডম উৎস থেকে পড়ে (Windows-এ `BCryptGenRandom`, অন্যত্র `/dev/urandom`)। এ ছাড়া `createHash` (`md5`, `sha1`, `sha256`, `sha384`, `sha512`, `update`, যেকোনো Buffer এনকোডিংয়ে `digest` ও `copy` সহ), `createHmac`, `hash`, `getHashes` ও `timingSafeEqual`। সাইফার, কী, সিগনেচার, কী ডেরিভেশন ও `crypto.subtle` দেওয়া হয় না। গ্লোবাল `crypto` হলো `webcrypto` (`getRandomValues` ও `randomUUID`); যে প্রোগ্রাম `crypto` নাম ব্যবহার করে, তাতে `node:crypto` লিংক হয়, যা প্রথম অ্যাক্সেসে মূল্যায়িত হয়।
- `node:querystring`: `parse`/`decode`, `stringify`/`encode`, `escape`, `unescape`।
- `node:timers`: গ্লোবাল টাইমার ফাংশন। `node:timers/promises`: `setTimeout`, `setImmediate` (দুটিই `AbortSignal` সহ), async ইটারেটর হিসেবে `setInterval`, এবং `scheduler.wait`/`yield`।
- `node:perf_hooks`: `performance`; `PerformanceObserver` ও `monitorEventLoopDelay` কিছুই পর্যবেক্ষণ করে না।
- `node:module`: `builtinModules` ও `isBuiltin`। `createRequire` `ERR_NONA_UNSUPPORTED` থ্রো করে: মডিউল প্রোগ্রাম বিল্ডের সময় রিজলভ হয়।
- `node:worker_threads`: `isMainThread` হলো `true`, `parentPort` ও `workerData` হলো `null`; `Worker` `ERR_NONA_UNSUPPORTED` থ্রো করে।
- `node:child_process`: প্রতিটি ফাংশন ও `ChildProcess` `ERR_NONA_UNSUPPORTED` থ্রো করে। মডিউলটি আছে যাতে যেসব প্যাকেজ কেবল এর উল্লেখ করে সেগুলো লোড হয়।
