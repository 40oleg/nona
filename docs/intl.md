# Intl

Nona has its own `Intl` ([#300](https://github.com/40oleg/nona/issues/300)):
ECMA-402 for the **`en` locale only**, without ICU and without data for other
locales. It is a JavaScript prelude, `src/lib/runtime/intl.js`, compiled into
the executable only when the program needs it.

## Design

- The available locales are `en` and `en-US`. Any other requested locale
  (`de-DE`, `ja`, `zh-TW`, …) falls back to the default locale `en-US`, and
  `resolvedOptions().locale` reports the fallback. `supportedLocalesOf` returns
  only `en` and `en-US` (and their `-u-` extension forms).
- The formats follow ICU's `en` data as Node.js uses it, so the same program
  prints the same text on Nona and on Node.js for en-US (the tests in
  `tests/intl.test.ts` compare against Node.js through `runOracle`).
- The time zone is UTC: Nona's local time zone is UTC. `timeZone` accepts
  `UTC`, `Etc/UTC`, `GMT` and fixed offsets (`+05:30`); named IANA zones are
  not available (`RangeError`).
- Collation approximates the root collation order (ICU's CLDR root) for the
  `en` locale: primary letters, then accents, then case, with `sensitivity`,
  `numeric`, `caseFirst`, `ignorePunctuation` and `usage`. It uses the Unicode
  normalization tables, so those are linked with `Intl.Collator` and
  `localeCompare`.
- Only the Gregorian calendar and the `latn` numbering system exist.
- **Linking.** The prelude is linked when the source names `Intl`,
  `toLocaleString`, `toLocaleDateString`, `toLocaleTimeString` or
  `localeCompare` (`src/link.ts`, part `intl`); other programs do not pay for it
  (`--print-link` shows the reason). Like the other preludes it adds no
  top-level bindings.

## Supported API

| Constructor / function                                                               | Supported                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Intl.NumberFormat`                                                                  | `style` `decimal`, `percent`, `currency` (`currencyDisplay` `symbol`, `narrowSymbol`, `code`, `name`; `currencySign` `accounting`), `notation` `standard`, `scientific`, `engineering`, `compact` (`compactDisplay` `short`, `long`), `signDisplay`, `useGrouping`, `minimumIntegerDigits`, minimum/maximum fraction and significant digits, `roundingMode`, `roundingIncrement`, `roundingPriority`, `trailingZeroDisplay`; `format`, `formatToParts`, `resolvedOptions`, `BigInt` and string arguments |
| `Intl.DateTimeFormat`                                                                | `dateStyle`, `timeStyle`, `weekday`, `era`, `year`, `month`, `day`, `dayPeriod`, `hour`, `minute`, `second`, `fractionalSecondDigits`, `timeZoneName`, `hour12`, `hourCycle`, `timeZone` (UTC and fixed offsets), `calendar: "gregory"`; `format`, `formatToParts`, `formatRange`, `formatRangeToParts`, `resolvedOptions`                                                                                                                                                                               |
| `Intl.Collator`                                                                      | `usage`, `sensitivity`, `ignorePunctuation`, `numeric`, `caseFirst`, `collation` `default`; `compare`, `resolvedOptions`                                                                                                                                                                                                                                                                                                                                                                                 |
| `Intl.PluralRules`                                                                   | `type` `cardinal`, `ordinal` (English rules); `select`, `resolvedOptions`                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Intl.getCanonicalLocales`, `Intl.supportedValuesOf`                                 | structurally valid BCP 47 tags are canonicalized; `supportedValuesOf` knows `calendar`, `collation`, `currency`, `numberingSystem`, `timeZone`, `unit`                                                                                                                                                                                                                                                                                                                                                   |
| `Intl.*.supportedLocalesOf`                                                          | on every constructor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `Number`/`BigInt`/`Date.prototype.toLocale*String`, `String.prototype.localeCompare` | delegate to the constructors above                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Not implemented: `Intl.RelativeTimeFormat`, `ListFormat`, `DisplayNames`,
`Segmenter`, `Locale`, `DurationFormat`; `NumberFormat` `style: "unit"` and
`formatRange`; non-Latin numbering systems; non-Gregorian calendars; named time
zones; data for any locale other than `en`.

## Test262 `intl402`

The runner (`scripts/test262-smoke.mjs`) needs no changes: it already supplies
the `testIntl.js` includes, and the prelude is linked because the tests name
`Intl`. Revision `7ab7fafa0003f73fc85c1b95d88094d33f7eb8bd`, Windows x64,
`TEST262_EXCLUDE_FEATURES=post-es2020` (which already drops `Temporal`,
`Intl.Locale-info`, `Intl.DurationFormat` and `Intl.Era-monthcode`). Sparse
checkout: add `test/intl402` to the directories in
[test262.md](test262.md). Each group:

```sh
TEST262_EXCLUDE_FEATURES=post-es2020 TEST262_JOBS=2 node scripts/test262-smoke.mjs intl402/NumberFormat
```

| Group (`intl402/…`)               | Pass | Fail |
| --------------------------------- | ---: | ---: |
| `NumberFormat`                    |  178 |   73 |
| `DateTimeFormat`                  |  148 |   23 |
| `Collator`                        |   60 |    5 |
| `PluralRules`                     |   43 |   10 |
| `Intl/getCanonicalLocales`        |   22 |   16 |
| `Intl/supportedValuesOf`          |   16 |    8 |
| `Number/prototype/toLocaleString` |    7 |    0 |
| `String/prototype/localeCompare`  |   10 |    0 |
| `Date/prototype`                  |   12 |    0 |
| `BigInt/prototype/toLocaleString` |   10 |    1 |
| **Total**                         |  506 |  136 |

The 29 passing `toLocale*`/`localeCompare` tests are in
`tests/test262-smoke.json` (the reviewed manifest).

### Classification of the 136 failures

- **Locales other than `en`** (the largest class): `de-DE`, `ja-JP`, `ko-KR`,
  `zh-TW`, `en-IN`, `pt-PT` formats and `useGrouping`/`signDisplay`/compact
  checks, `german-weekday-no-year`, `related-year-zh`, `Collator/usage-de`,
  `ignorePunctuation-default` (`th`), `hourCycle-default` (`ja`),
  `BigInt/…/de-DE`. By design these fall back to `en-US`.
- **`NumberFormat` `style: "unit"`** and the unit tests
  (`constructor-unit`, `unit-*`, `units`, `style-unit`,
  `currency-digits-nonstandard-notation`, `return-keys-order-default`,
  `supportedValuesOf/units-*`). Not implemented.
- **`NumberFormat.prototype.formatRange`/`formatRangeToParts`**
  (Intl.NumberFormat v3). Not implemented (`DateTimeFormat` has them).
- **Missing constructors** used by the test: `supportedValuesOf` tests that
  cross-check `DisplayNames`, `RelativeTimeFormat`; `getCanonicalLocales/Locale-object`.
- **Non-Gregorian calendars, non-Latin numbering systems, named time zones**:
  `chinese-calendar-dates`, `dangi-calendar-dates`, `pattern-on-calendar`,
  `related-year`, `canonicalize-calendar`, `numbering-system`,
  `resolved-*-unicode-extensions-and-options`, `supportedValuesOf/{calendars,
numberingSystems*,timeZones-include-non-continental}`,
  `unicode-ext-canonicalize-{calendar,timezone,…}`, `offset-timezone-gmt-same`.
- **Language-tag canonicalization data** (`getCanonicalLocales`
  `grandfathered`, `preferred-*`, `complex-*-subtag-replacement`,
  `non-iana-canon`, `transformed-ext-canonical`, `canonicalized-tags`): needs the
  CLDR alias tables, which Nona does not carry.
- **`PluralRules` v3 options** (`notation`, `compactDisplay`, rounding options
  and their read order, `plural-categories-order`, `resolvedOptions` key order
  and properties). Not implemented.
- **Legacy constructed symbol** (`intl-legacy-constructed-symbol*`, ES2022
  `Intl.*` called as a function on a legacy-constructed object) and
  **cross-realm prototypes** (`proto-from-ctor-realm`): not implemented.
- **Tainted `Object.prototype`** (`taint-Object-prototype`,
  `default-options-object-prototype`, `constructor-option-read-order`,
  `constructor-options-throwing-getters`): option reading is not yet
  fully spec-ordered for `PluralRules`, `Collator` and `DateTimeFormat`
  `supportedLocalesOf`.
- **`timedatestyle-en`** and the `hourCycle*` tests: `h11`/`h24` handling
  combined with `dateStyle`/`timeStyle` differs from the test's expectation.

These classes were assigned from the failing test names and the features and
locales they exercise, not by reading each failure individually; the
Node.js oracle tests in `tests/intl.test.ts` cover the en-US behaviour.
