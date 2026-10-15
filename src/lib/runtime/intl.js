(function () {
    "use strict";
    // Intl with Intl.Segmenter for grapheme clusters (UAX #29 extended
    // grapheme clusters). Packages such as string-width count terminal
    // columns with it. The other Intl services are not available.
    var defineProperty = Object.defineProperty,
        markNative = Function.prototype.__nonaMarkNativeInternal;
    var TypeErrorConstructor = TypeError,
        RangeErrorConstructor = RangeError,
        StringConstructor = String;
    var mathFloor = Math.floor,
        iteratorSymbol = Symbol.iterator,
        toStringTagSymbol = Symbol.toStringTag;
    var parseHex = parseInt;
    var iteratorPrototype = Object.getPrototypeOf(
        Object.getPrototypeOf([][iteratorSymbol]()),
    );
    var segmenters = new WeakMap(),
        segmentsData = new WeakMap(),
        iterators = new WeakMap();
    var getSegmenter = WeakMap.prototype.get.bind(segmenters),
        addSegmenter = WeakMap.prototype.set.bind(segmenters),
        getSegments = WeakMap.prototype.get.bind(segmentsData),
        addSegments = WeakMap.prototype.set.bind(segmentsData),
        getIterator = WeakMap.prototype.get.bind(iterators),
        addIterator = WeakMap.prototype.set.bind(iterators);
    function install(object, name, length, fn) {
        defineProperty(fn, "name", { value: name, configurable: true });
        defineProperty(fn, "length", { value: length, configurable: true });
        markNative(fn);
        defineProperty(object, name, {
            value: fn,
            writable: true,
            enumerable: false,
            configurable: true,
        });
    }
    function tag(object, value) {
        defineProperty(object, toStringTagSymbol, {
            value: value,
            configurable: true,
        });
    }
    function isObject(value) {
        return (
            value !== null &&
            (typeof value === "object" || typeof value === "function")
        );
    }
    function toStr(value) {
        if (typeof value === "symbol")
            throw new TypeErrorConstructor(
                "Cannot convert a Symbol value to a string",
            );
        return StringConstructor(value);
    }
    function toIntegerOrInfinity(value) {
        var n = +value;
        if (n !== n || n === 0) return 0;
        if (n === 1 / 0 || n === -1 / 0) return n;
        return n < 0 ? -mathFloor(-n) : mathFloor(n);
    }

    // Grapheme_Cluster_Break classes. The table is filled in by the compiler
    // from the Unicode data of the RegExp engine (src/runtime/intl-source.ts):
    // 13 characters per range, start and end as 6 hex digits and the class
    // letter.
    var OTHER = 0,
        CR = 1,
        LF = 2,
        CONTROL = 3,
        EXTEND = 4,
        ZWJ = 5,
        RI = 6,
        PREPEND = 7,
        SPACING_MARK = 8,
        L = 9,
        V = 10,
        T = 11,
        LV = 12,
        LVT = 13,
        PICTOGRAPHIC = 14,
        CONSONANT = 15,
        LINKER = 16;
    var classLetters = "OCLXEZRPSlvtVTGKN";
    var table = "@@GRAPHEME_TABLE@@";
    var starts = null,
        ends,
        classes;
    function loadTable() {
        var count = table.length / 13;
        starts = [];
        ends = [];
        classes = [];
        for (var i = 0; i < count; i++) {
            var at = i * 13;
            starts.push(parseHex(table.slice(at, at + 6), 16));
            ends.push(parseHex(table.slice(at + 6, at + 12), 16));
            classes.push(classLetters.indexOf(table.charAt(at + 12)));
        }
    }
    function classOf(cp) {
        if (cp < 0x7f) {
            if (cp >= 0x20) return OTHER;
            if (cp === 0x0d) return CR;
            if (cp === 0x0a) return LF;
            return CONTROL;
        }
        if (cp >= 0xac00 && cp <= 0xd7a3)
            return (cp - 0xac00) % 28 === 0 ? LV : LVT;
        if (starts === null) loadTable();
        var low = 0,
            high = starts.length - 1;
        while (low <= high) {
            var middle = (low + high) >> 1;
            if (cp < starts[middle]) high = middle - 1;
            else if (cp > ends[middle]) low = middle + 1;
            else return classes[middle];
        }
        return OTHER;
    }
    function isControl(c) {
        return c === CR || c === LF || c === CONTROL;
    }
    function isExtend(c) {
        return c === EXTEND || c === LINKER;
    }
    // The start indices of the grapheme clusters of the string.
    function graphemeBreaks(string) {
        var breaks = [],
            length = string.length;
        var previous = -1,
            pictographic = 0, // 1: ExtPict Extend*, 2: ExtPict Extend* ZWJ
            regional = 0, // regional indicators directly before
            conjunct = 0; // 1: Consonant [Extend ZWJ]*, 2: ... with a Linker
        for (var i = 0; i < length;) {
            var cp = string.codePointAt(i);
            var c = classOf(cp);
            var split;
            if (previous === -1) split = true;
            else if (previous === CR && c === LF) split = false;
            else if (isControl(previous) || isControl(c)) split = true;
            else if (
                previous === L &&
                (c === L || c === V || c === LV || c === LVT)
            )
                split = false;
            else if (
                (previous === LV || previous === V) &&
                (c === V || c === T)
            )
                split = false;
            else if ((previous === LVT || previous === T) && c === T)
                split = false;
            else if (isExtend(c) || c === ZWJ || c === SPACING_MARK)
                split = false;
            else if (previous === PREPEND) split = false;
            else if (c === CONSONANT && conjunct === 2) split = false;
            else if (
                previous === ZWJ &&
                c === PICTOGRAPHIC &&
                pictographic === 2
            )
                split = false;
            else if (previous === RI && c === RI && regional % 2 === 1)
                split = false;
            else split = true;
            if (split) breaks.push(i);
            if (c === PICTOGRAPHIC) pictographic = 1;
            else if (pictographic === 1 && isExtend(c)) pictographic = 1;
            else if (pictographic === 1 && c === ZWJ) pictographic = 2;
            else pictographic = 0;
            regional = c === RI ? regional + 1 : 0;
            if (c === CONSONANT) conjunct = 1;
            else if (conjunct !== 0 && c === LINKER) conjunct = 2;
            else if (conjunct === 0 || !(c === EXTEND || c === ZWJ))
                conjunct = 0;
            previous = c;
            i += cp > 0xffff ? 2 : 1;
        }
        return breaks;
    }

    function segmentData(data, start) {
        var string = data.string,
            breaks = data.breaks;
        var end = start + 1 < breaks.length ? breaks[start + 1] : string.length;
        return {
            segment: string.slice(breaks[start], end),
            index: breaks[start],
            input: string,
        };
    }

    var localePattern = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/;
    function requestedLocales(locales) {
        if (locales === undefined) return [];
        var list = typeof locales === "string" ? [locales] : Object(locales);
        var result = [];
        var length = toIntegerOrInfinity(list.length);
        for (var i = 0; i < length; i++) {
            if (!(i in list)) continue;
            var locale = list[i];
            if (typeof locale !== "string" && !isObject(locale))
                throw new TypeErrorConstructor(
                    "Language ID should be string or object.",
                );
            locale = toStr(locale);
            if (!localePattern.test(locale))
                throw new RangeErrorConstructor(
                    "Incorrect locale information provided",
                );
            if (result.indexOf(locale) < 0) result.push(locale);
        }
        return result;
    }

    function Segmenter(locales, options) {
        if (new.target === undefined)
            throw new TypeErrorConstructor(
                "Constructor Intl.Segmenter requires 'new'",
            );
        var requested = requestedLocales(locales);
        if (options !== undefined && !isObject(options))
            throw new TypeErrorConstructor(
                "Options must be an object or undefined",
            );
        var matcher = options === undefined ? undefined : options.localeMatcher;
        if (matcher !== undefined) {
            matcher = toStr(matcher);
            if (matcher !== "lookup" && matcher !== "best fit")
                throw new RangeErrorConstructor(
                    "Value " +
                        matcher +
                        " out of range for Intl.Segmenter options property localeMatcher",
                );
        }
        var granularity =
            options === undefined ? undefined : options.granularity;
        granularity =
            granularity === undefined ? "grapheme" : toStr(granularity);
        if (
            granularity !== "grapheme" &&
            granularity !== "word" &&
            granularity !== "sentence"
        )
            throw new RangeErrorConstructor(
                "Value " +
                    granularity +
                    " out of range for Intl.Segmenter options property granularity",
            );
        if (granularity !== "grapheme")
            throw new RangeErrorConstructor(
                "Nona: Intl.Segmenter supports only the grapheme granularity, not " +
                    granularity,
            );
        addSegmenter(this, {
            locale: requested.length ? requested[0] : "en-US",
            granularity: granularity,
        });
    }
    install(
        Segmenter,
        "supportedLocalesOf",
        1,
        function supportedLocalesOf(locales) {
            return requestedLocales(locales);
        },
    );
    defineProperty(Segmenter, "prototype", { writable: false });
    install(Segmenter.prototype, "segment", 1, function segment(string) {
        var state = getSegmenter(this);
        if (state === undefined)
            throw new TypeErrorConstructor(
                "Method Intl.Segmenter.prototype.segment called on incompatible receiver " +
                    StringConstructor(this),
            );
        var segments = Object.create(segmentsPrototype);
        var text = toStr(string);
        addSegments(segments, { string: text, breaks: null });
        return segments;
    });
    install(
        Segmenter.prototype,
        "resolvedOptions",
        0,
        function resolvedOptions() {
            var state = getSegmenter(this);
            if (state === undefined)
                throw new TypeErrorConstructor(
                    "Method Intl.Segmenter.prototype.resolvedOptions called on incompatible receiver " +
                        StringConstructor(this),
                );
            return { locale: state.locale, granularity: state.granularity };
        },
    );
    tag(Segmenter.prototype, "Intl.Segmenter");

    function segmentsOf(receiver, name) {
        var data = getSegments(receiver);
        if (data === undefined)
            throw new TypeErrorConstructor(
                "Method %Segments.prototype%." +
                    name +
                    " called on incompatible receiver " +
                    StringConstructor(receiver),
            );
        if (data.breaks === null) data.breaks = graphemeBreaks(data.string);
        return data;
    }
    var segmentsPrototype = {};
    install(segmentsPrototype, "containing", 1, function containing(index) {
        var data = segmentsOf(this, "containing");
        var n = toIntegerOrInfinity(index);
        if (n < 0 || n >= data.string.length) return undefined;
        var breaks = data.breaks,
            low = 0,
            high = breaks.length - 1;
        while (low < high) {
            var middle = (low + high + 1) >> 1;
            if (breaks[middle] <= n) low = middle;
            else high = middle - 1;
        }
        return segmentData(data, low);
    });
    var segmentIteratorPrototype = Object.create(iteratorPrototype);
    install(segmentsPrototype, iteratorSymbol, 0, function () {
        var data = segmentsOf(this, "[Symbol.iterator]");
        var iterator = Object.create(segmentIteratorPrototype);
        addIterator(iterator, { data: data, next: 0 });
        return iterator;
    });
    defineProperty(segmentsPrototype[iteratorSymbol], "name", {
        value: "[Symbol.iterator]",
        configurable: true,
    });
    install(segmentIteratorPrototype, "next", 0, function next() {
        var state = getIterator(this);
        if (state === undefined)
            throw new TypeErrorConstructor(
                "Method %SegmentIterator.prototype%.next called on incompatible receiver " +
                    StringConstructor(this),
            );
        if (state.next >= state.data.breaks.length)
            return { value: undefined, done: true };
        return { value: segmentData(state.data, state.next++), done: false };
    });
    tag(segmentIteratorPrototype, "Segmenter String Iterator");

    var Intl = {};
    install(Intl, "Segmenter", 0, Segmenter);
    tag(Intl, "Intl");
    defineProperty(globalThis, "Intl", {
        value: Intl,
        writable: true,
        enumerable: false,
        configurable: true,
    });
})();
