// String kernels of the Nona vs optimized C++ comparison (#401): the C++ twin
// of ../js/strings.js. Every kernel has the same name, inputs and algorithm
// over UTF-16 code units, so the checksums agree exactly.
//
//   strings <kernel> <iterations> <seed>
//
// Builds its inputs from <seed> (xorshift32, the same sequence of calls as
// strings.js), times only the kernel call with std::chrono::steady_clock and
// prints one JSON line: {"kernel", "n", "ns", "checksum", "units",
// "allocUnits"}. Nothing is printed in the timed region.
//
// Contract (see the header of ../js/strings.js for the full text): unit = one
// UTF-16 code unit, strings are std::u16string (owning, contiguous, char16_t;
// operator< and find compare char16_t values, i.e. code-unit order, as
// JavaScript does). "units" and "allocUnits" are the contract's code units
// processed and code units of strings the JavaScript kernel creates; every
// variant prints the same numbers, even when it allocates less.
//
// The matched kernels:
// - scan: s[j] over s.size(); equal / compare: operator== / operator<;
//   slice: s.substr(b, m) (owning; std::u16string's small-string buffer holds
//   up to 7 code units without allocating); indexof: s.find(needle);
// - concat: a new std::u16string of the summed length per iteration
//   (reserve, append s, append piece, move-assign), the immutable `s + piece`
//   of JavaScript; builder: see the lower bounds;
// - splitjoin: find(u' ') and substr into a std::vector<std::u16string>, then
//   one join into a reserved string; replace / replaceall: find and append
//   into a new string (replace reserves the known length, replaceall grows);
// - format_int: std::to_chars(double, chars_format::fixed), the shortest
//   round-trip form in fixed notation (the decimal integer for these inputs),
//   widened into a std::u16string; parse_int: the code units narrowed into a
//   stack buffer, then std::from_chars(double).
//
// Variants that are not the JavaScript contract (C++ only; run.mjs runs them
// against the JavaScript kernel without the suffix and labels them):
// - *_bytes: ASCII std::string (one byte per unit; find uses memchr/memcmp)
//   for scan and indexof; to_chars/from_chars on char buffers for format and
//   parse. Practical byte baselines, not equivalent Unicode work.
// - slice_*_view: std::u16string_view::substr, a non-owning view (no copy).
// - concat_*_append: s += piece, mutable in-place growth (amortized).
// - builder (row str_builder_*): append into one std::u16string reserved to
//   the final length, cleared (capacity kept) after each output: an
//   architectural lower bound of JavaScript's array push + join.
//   builder_*_join: std::vector<std::u16string_view> push_back + one join
//   into a reserved string, a new vector per output: JavaScript's contract.
//
// Every kernel is a separate noinline function (one call per timed region)
// so that bench/cpp/check-asm.mjs can find its loop and the string routine
// called in it. escape() is an empty asm statement applied to inputs and
// outputs; there is no volatile in the kernels.
#include <charconv>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <string_view>
#include <type_traits>
#include <vector>

#define KERNEL extern "C" __attribute__((noinline))

static_assert(std::chrono::steady_clock::is_steady, "monotonic clock");

namespace {
using U16 = std::u16string;
using U16View = std::u16string_view;

uint32_t state;
uint32_t next() {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return state;
}

inline void escape(const void *p) { asm volatile("" : : "r"(p) : "memory"); }

inline uint32_t mix(uint32_t h, uint32_t x) { return (h ^ x) * 16777619u; }
template <class C> inline uint32_t unit(C c) {
    return uint32_t(std::make_unsigned_t<C>(c));
}
template <class S> inline uint32_t sample(uint32_t h, const S &s) {
    const size_t length = s.size();
    h = mix(h, uint32_t(length));
    if (length == 0) return h;
    h = mix(h, unit(s[0]));
    h = mix(h, unit(s[length >> 1]));
    return mix(h, unit(s[length - 1]));
}
template <class S> uint32_t full(uint32_t h, const S &s) {
    for (auto c : s) h = mix(h, unit(c));
    return mix(h, uint32_t(s.size()));
}

constexpr char16_t SPACE = u' ';
} // namespace

// The output of an allocating kernel: in-loop hash, produced code units, and
// the last output or unfinished state.
struct Out {
    uint32_t h = 0;
    uint64_t produced = 0;
    U16 tail;
    std::string bytesTail;
};

// Operations on existing storage.
KERNEL uint32_t k_str_scan(const U16 &s, uint64_t iterations) {
    uint32_t acc = 0;
    for (uint64_t r = 0; r < iterations; r++) {
        const uint32_t k = r & 255;
        for (size_t j = 0; j < s.size(); j++) acc = acc + (uint32_t(s[j]) ^ k);
    }
    return acc;
}
KERNEL uint32_t k_str_scan_bytes(const std::string &s, uint64_t iterations) {
    uint32_t acc = 0;
    for (uint64_t r = 0; r < iterations; r++) {
        const uint32_t k = r & 255;
        for (size_t j = 0; j < s.size(); j++)
            acc = acc + (uint32_t(uint8_t(s[j])) ^ k);
    }
    return acc;
}
KERNEL uint32_t k_str_equal(const U16 &a, const U16 *const *cands,
                            uint64_t iterations) {
    uint32_t count = 0;
    for (uint64_t r = 0; r < iterations; r++)
        if (a == *cands[r & 3]) count++;
    return count;
}
KERNEL uint32_t k_str_compare(const U16 &a, const U16 *const *cands,
                              uint64_t iterations) {
    uint32_t count = 0;
    for (uint64_t r = 0; r < iterations; r++)
        if (a < *cands[r & 3]) count++;
    return count;
}
KERNEL uint32_t k_str_indexof(const U16 &s, const U16 *const *needles,
                              uint64_t iterations) {
    uint32_t h = 0;
    for (uint64_t r = 0; r < iterations; r++) {
        const size_t p = s.find(*needles[r & 15]);
        h = mix(h, p == U16::npos ? 0 : uint32_t(p + 1));
    }
    return h;
}
KERNEL uint32_t k_str_indexof_bytes(const std::string &s,
                                    const std::string *const *needles,
                                    uint64_t iterations) {
    uint32_t h = 0;
    for (uint64_t r = 0; r < iterations; r++) {
        const size_t p = s.find(*needles[r & 15]);
        h = mix(h, p == std::string::npos ? 0 : uint32_t(p + 1));
    }
    return h;
}
KERNEL double k_str_parse(const U16 *strs, uint64_t iterations) {
    double acc = 0;
    for (uint64_t r = 0; r < iterations; r++) {
        const U16 &s = strs[r & 1023];
        char buf[32];
        const size_t length = s.size() < 32 ? s.size() : 32;
        for (size_t j = 0; j < length; j++)
            buf[j] = s[j] < 128 ? char(s[j]) : '?';
        double x = 0;
        std::from_chars(buf, buf + length, x);
        acc = acc + x;
    }
    return acc;
}
KERNEL double k_str_parse_bytes(const std::string *strs, uint64_t iterations) {
    double acc = 0;
    for (uint64_t r = 0; r < iterations; r++) {
        const std::string &s = strs[r & 1023];
        double x = 0;
        std::from_chars(s.data(), s.data() + s.size(), x);
        acc = acc + x;
    }
    return acc;
}

// Allocating kernels.
KERNEL void k_str_slice(const U16 &s, const uint32_t *starts, uint32_t m,
                        uint64_t iterations, Out *o) {
    uint32_t h = 0;
    U16 tail;
    for (uint64_t r = 0; r < iterations; r++) {
        U16 t = s.substr(starts[r & 1023], m);
        h = mix(mix(h, uint32_t(t.size())), t[t.size() - 1]);
        tail = std::move(t);
    }
    o->h = h;
    o->produced = iterations * m;
    o->tail = std::move(tail);
}
KERNEL void k_str_slice_view(U16View s, const uint32_t *starts, uint32_t m,
                             uint64_t iterations, Out *o) {
    uint32_t h = 0;
    U16View tail;
    for (uint64_t r = 0; r < iterations; r++) {
        U16View t = s.substr(starts[r & 1023], m);
        h = mix(mix(h, uint32_t(t.size())), t[t.size() - 1]);
        tail = t;
    }
    o->h = h;
    o->produced = iterations * m;
    o->tail = U16(tail);
}
KERNEL void k_str_concat(const U16 *const *pieces, size_t cap,
                         uint64_t iterations, Out *o) {
    U16 s;
    uint32_t h = 0;
    uint64_t produced = 0;
    for (uint64_t r = 0; r < iterations; r++) {
        const U16 &piece = *pieces[r & 15];
        U16 t;
        t.reserve(s.size() + piece.size());
        t.append(s).append(piece);
        s = std::move(t);
        produced += s.size();
        if (s.size() >= cap) {
            h = sample(h, s);
            s = U16();
        }
    }
    o->h = h;
    o->produced = produced;
    o->tail = std::move(s);
}
KERNEL void k_str_concat_append(const U16 *const *pieces, size_t cap,
                                uint64_t iterations, Out *o) {
    U16 s;
    uint32_t h = 0;
    uint64_t produced = 0;
    for (uint64_t r = 0; r < iterations; r++) {
        s += *pieces[r & 15];
        produced += s.size();
        if (s.size() >= cap) {
            h = sample(h, s);
            s.clear();
        }
    }
    o->h = h;
    o->produced = produced;
    o->tail = std::move(s);
}
KERNEL void k_str_builder(const U16 *const *pieces, size_t count, size_t cap,
                          uint64_t iterations, Out *o) {
    U16 b;
    b.reserve(cap);
    uint32_t h = 0;
    uint64_t produced = 0;
    size_t k = 0;
    for (uint64_t r = 0; r < iterations; r++) {
        b.append(*pieces[r & 15]);
        if (++k == count) {
            produced += b.size();
            h = sample(h, b);
            b.clear();
            k = 0;
        }
    }
    o->h = h;
    o->produced = produced;
    o->tail = std::move(b);
}
namespace {
U16 join(const std::vector<U16View> &parts, U16View separator) {
    size_t total = 0;
    for (auto p : parts) total += p.size();
    if (!parts.empty()) total += (parts.size() - 1) * separator.size();
    U16 out;
    out.reserve(total);
    for (size_t j = 0; j < parts.size(); j++) {
        if (j) out.append(separator);
        out.append(parts[j]);
    }
    return out;
}
} // namespace
KERNEL void k_str_builder_join(const U16 *const *pieces, size_t count,
                               uint64_t iterations, Out *o) {
    std::vector<U16View> parts;
    uint32_t h = 0;
    uint64_t produced = 0;
    for (uint64_t r = 0; r < iterations; r++) {
        parts.push_back(*pieces[r & 15]);
        if (parts.size() == count) {
            const U16 out = join(parts, U16View());
            produced += out.size();
            h = sample(h, out);
            parts = std::vector<U16View>();
        }
    }
    o->h = h;
    o->produced = produced;
    o->tail = join(parts, U16View());
}
KERNEL void k_str_splitjoin(const U16 *const *inputs, uint64_t iterations,
                            Out *o) {
    uint32_t h = 0;
    uint64_t produced = 0;
    U16 tail;
    const U16 dash = u"-";
    for (uint64_t r = 0; r < iterations; r++) {
        const U16 &s = *inputs[r & 3];
        std::vector<U16> parts;
        for (size_t from = 0;;) {
            const size_t p = s.find(SPACE, from);
            if (p == U16::npos) {
                parts.push_back(s.substr(from));
                break;
            }
            parts.push_back(s.substr(from, p - from));
            from = p + 1;
        }
        size_t total = (parts.size() - 1) * dash.size();
        for (const U16 &p : parts) total += p.size();
        U16 out;
        out.reserve(total);
        for (size_t j = 0; j < parts.size(); j++) {
            if (j) out.append(dash);
            out.append(parts[j]);
        }
        produced += s.size() - (parts.size() - 1) + out.size();
        h = sample(mix(h, uint32_t(parts.size())), out);
        tail = std::move(out);
    }
    o->h = h;
    o->produced = produced;
    o->tail = std::move(tail);
}
KERNEL void k_str_replace(const U16 *const *inputs, const U16 &pat,
                          const U16 &rep, uint64_t iterations, Out *o) {
    uint32_t h = 0;
    uint64_t produced = 0;
    U16 tail;
    for (uint64_t r = 0; r < iterations; r++) {
        const U16 &s = *inputs[r & 3];
        const size_t p = s.find(pat);
        U16 out;
        if (p == U16::npos)
            out = s;
        else {
            out.reserve(s.size() - pat.size() + rep.size());
            out.append(s, 0, p).append(rep).append(s, p + pat.size(),
                                                   U16::npos);
        }
        produced += out.size();
        h = sample(h, out);
        tail = std::move(out);
    }
    o->h = h;
    o->produced = produced;
    o->tail = std::move(tail);
}
KERNEL void k_str_replaceall(const U16 *const *inputs, const U16 &pat,
                             const U16 &rep, uint64_t iterations, Out *o) {
    uint32_t h = 0;
    uint64_t produced = 0;
    U16 tail;
    for (uint64_t r = 0; r < iterations; r++) {
        const U16 &s = *inputs[r & 3];
        U16 out;
        size_t from = 0;
        for (size_t p; (p = s.find(pat, from)) != U16::npos;
             from = p + pat.size())
            out.append(s, from, p - from).append(rep);
        out.append(s, from, U16::npos);
        produced += out.size();
        h = sample(h, out);
        tail = std::move(out);
    }
    o->h = h;
    o->produced = produced;
    o->tail = std::move(tail);
}
KERNEL void k_str_format(const double *vals, uint64_t iterations, Out *o) {
    uint32_t h = 0;
    uint64_t produced = 0;
    U16 tail;
    for (uint64_t r = 0; r < iterations; r++) {
        char buf[32];
        const double x = vals[r & 1023] + double(r >> 10);
        const auto end =
            std::to_chars(buf, buf + sizeof buf, x, std::chars_format::fixed)
                .ptr;
        U16 t(buf, end);
        produced += t.size();
        h = mix(mix(mix(h, uint32_t(t.size())), t[0]), t[t.size() - 1]);
        tail = std::move(t);
    }
    o->h = h;
    o->produced = produced;
    o->tail = std::move(tail);
}
KERNEL void k_str_format_bytes(const double *vals, uint64_t iterations,
                               Out *o) {
    uint32_t h = 0;
    uint64_t produced = 0;
    char buf[32];
    size_t length = 0;
    for (uint64_t r = 0; r < iterations; r++) {
        const double x = vals[r & 1023] + double(r >> 10);
        length = size_t(
            std::to_chars(buf, buf + sizeof buf, x, std::chars_format::fixed)
                .ptr -
            buf);
        escape(buf);
        produced += length;
        h = mix(mix(mix(h, uint32_t(length)), unit(buf[0])),
                unit(buf[length - 1]));
    }
    o->h = h;
    o->produced = produced;
    o->bytesTail.assign(buf, length);
}

namespace {
constexpr size_t SIZES[] = {16, 1024, 1u << 20};
constexpr size_t PIECE[] = {4, 16, 1024};

const std::vector<char32_t> &alphabet(const std::string &encoding) {
    static const std::vector<char32_t> ascii(
        {U'a', U'b', U'c', U'd', U'e', U'g', U'h', U'i', U'l', U'm', U'n',
         U'o', U'r', U's', U't', U'u'});
    static const std::vector<char32_t> bmp(
        {0x430, 0x431, 0x432, 0x433, 0x434, 0x435, 0x436, 0x437, 0x65e5,
         0x672c, 0x8a9e, 0x4e2d, 0x6587, 0x5b57, 0x6f22, 0x7247});
    static const std::vector<char32_t> astral(
        {U'a', U'b', U'c', U'd', U'e', U'g', U'h', U'i', 0x1f600, 0x1f601,
         0x1f602, 0x1f603, 0x1f604, 0x1f605, 0x1f606, 0x1f607});
    return encoding == "ascii" ? ascii : encoding == "bmp" ? bmp : astral;
}
U16 pattern(const std::string &encoding) {
    return encoding == "ascii" ? U16(u"ou")
           : encoding == "bmp" ? U16({0x430, 0x432})
                               : U16({0xd83d, 0xde00});
}

U16 words(const std::string &encoding, size_t length) {
    const auto &abc = alphabet(encoding);
    U16 units;
    uint32_t left = 2 + next() % 6;
    while (units.size() < length) {
        if (left == 0) {
            units.push_back(SPACE);
            left = 2 + next() % 6;
            continue;
        }
        const char32_t cp = abc[next() % 16];
        if (cp <= 0xffff)
            units.push_back(char16_t(cp));
        else if (units.size() + 2 > length)
            units.push_back(char16_t(abc[0]));
        else {
            units.push_back(char16_t(0xd800 + ((cp - 0x10000) >> 10)));
            units.push_back(char16_t(0xdc00 + ((cp - 0x10000) & 1023)));
        }
        left--;
    }
    return units;
}
bool isLow(char16_t u) { return u >= 0xdc00 && u <= 0xdfff; }
std::vector<U16> rotations(const U16 &units) {
    std::vector<U16> result;
    for (size_t k = 0; k < 4; k++) {
        size_t at = (k * units.size()) >> 2;
        while (at < units.size() && isLow(units[at])) at++;
        result.push_back(units.substr(at) + units.substr(0, at));
    }
    return result;
}
std::vector<double> intValues() {
    std::vector<double> vals;
    for (int j = 0; j < 1024; j++) {
        const uint64_t hi = next() >> 12;
        const uint64_t lo = next();
        const uint32_t shift = next() % 52;
        vals.push_back(double(((hi << 32) | lo) >> shift));
    }
    return vals;
}
std::string toBytes(const U16 &s) { return std::string(s.begin(), s.end()); }
std::vector<const U16 *> pointers(const std::vector<U16> &list) {
    std::vector<const U16 *> result;
    for (const U16 &s : list) result.push_back(&s);
    return result;
}

std::string u32Checksum(uint32_t x) { return "u32:" + std::to_string(x); }
std::string f64Checksum(double x) {
    uint64_t bits;
    std::memcpy(&bits, &x, sizeof bits);
    char text[32];
    std::snprintf(text, sizeof text, "f64:%016llx",
                  static_cast<unsigned long long>(bits));
    return text;
}

[[noreturn]] void fail(const std::string &message) {
    std::fprintf(stderr, "%s\n", message.c_str());
    std::exit(2);
}

using Clock = std::chrono::steady_clock;
template <class F> auto timed(F f, long long &ns) {
    auto t0 = Clock::now();
    auto r = f();
    asm volatile("" : : "g"(&r) : "memory");
    auto t1 = Clock::now();
    ns = std::chrono::duration_cast<std::chrono::nanoseconds>(t1 - t0)
             .count();
    return r;
}
// How many of n iterations have r & mask == k.
uint64_t times(uint64_t n, uint64_t k, uint64_t mask) {
    return (n + mask - k) / (mask + 1);
}
} // namespace

int main(int argc, char **argv) {
    if (argc != 4) fail("usage: strings <kernel> <iterations> <seed>");
    const std::string kernel = argv[1];
    char *end;
    const uint64_t n = std::strtoull(argv[2], &end, 10);
    if (*end) fail("usage: strings <kernel> <iterations> <seed>");
    const uint32_t seed = uint32_t(std::strtoull(argv[3], nullptr, 10));
    state = seed ? seed : 0x9e3779b9u;

    // str_<op>_<encoding>_<size>[_<needle>][_<variant>]
    std::vector<std::string> part;
    for (size_t from = 0;;) {
        const size_t p = kernel.find('_', from);
        part.push_back(kernel.substr(from, p - from));
        if (p == std::string::npos) break;
        from = p + 1;
    }
    const auto unknown = [&] { fail("unknown kernel " + kernel); };
    if (part.size() < 4 || part[0] != "str") unknown();
    const std::string op = part[1], encoding = part[2], size = part[3];
    std::string needle, variant;
    for (size_t j = 4; j < part.size(); j++)
        (part[j][0] == 'n' && op == "indexof" && needle.empty() ? needle
                                                                : variant) =
            part[j];
    if (part.size() > 6 || (part.size() == 6 && needle.empty())) unknown();
    const int sizeIndex = size == "short"    ? 0
                          : size == "medium" ? 1
                          : size == "large"  ? 2
                                             : -1;
    if (sizeIndex < 0) unknown();
    const size_t L = SIZES[sizeIndex];
    const auto known = [&](bool ok) {
        if (!ok) unknown();
    };

    long long ns = 0;
    std::string checksum;
    uint64_t units = 0, allocUnits = 0;
    Out out;
    const auto allocating = [&](uint64_t processed) {
        units = processed;
        allocUnits = out.produced;
        checksum = u32Checksum(variant == "bytes" ? full(out.h, out.bytesTail)
                                                  : full(out.h, out.tail));
    };
    const auto run = [&](auto f) {
        timed(
            [&] {
                f();
                escape(&out);
                return 0;
            },
            ns);
    };

    if (op == "format" || op == "parse") {
        known(encoding == "int" && size == "short" && needle.empty() &&
              (variant.empty() || variant == "bytes"));
        const auto vals = intValues();
        escape(vals.data());
        if (op == "format") {
            if (variant == "bytes")
                run([&] { k_str_format_bytes(vals.data(), n, &out); });
            else
                run([&] { k_str_format(vals.data(), n, &out); });
            allocating(out.produced);
        } else {
            std::vector<U16> strs;
            std::vector<std::string> bytes;
            for (double v : vals) {
                char buf[32];
                const auto e = std::to_chars(buf, buf + sizeof buf, v,
                                             std::chars_format::fixed)
                                   .ptr;
                strs.emplace_back(buf, e);
                bytes.emplace_back(buf, e);
            }
            escape(strs.data());
            escape(bytes.data());
            const double acc = timed(
                [&] {
                    return variant == "bytes"
                               ? k_str_parse_bytes(bytes.data(), n)
                               : k_str_parse(strs.data(), n);
                },
                ns);
            for (uint64_t k = 0; k < 1024; k++)
                units += strs[k].size() * times(n, k, 1023);
            checksum = f64Checksum(acc);
        }
    } else if (encoding == "log") {
        known(op == "replaceall" && size == "large" && needle.empty() &&
              variant.empty());
        std::string text;
        for (uint32_t i = seed % 1000; text.size() < L; i++)
            text += "line " + std::to_string(i) + " request " +
                    std::to_string(i) + " took 1ms\n";
        text.resize(L);
        const auto inputs = rotations(U16(text.begin(), text.end()));
        const auto p = pointers(inputs);
        const U16 pat = u"request ", rep = u"req#";
        escape(p.data());
        run([&] { k_str_replaceall(p.data(), pat, rep, n, &out); });
        allocating(n * L);
    } else {
        known(encoding == "ascii" || encoding == "bmp" ||
              encoding == "astral");
        const U16 units16 = words(encoding, L);
        const U16 s = units16;
        escape(s.data());
        if (op == "scan") {
            known(needle.empty() && (variant.empty() ||
                                     (variant == "bytes" && encoding == "ascii")));
            const std::string b = toBytes(s);
            escape(b.data());
            const uint32_t acc = timed(
                [&] {
                    return variant == "bytes" ? k_str_scan_bytes(b, n)
                                              : k_str_scan(s, n);
                },
                ns);
            checksum = u32Checksum(acc);
            units = n * L;
        } else if (op == "equal" || op == "compare") {
            known(needle.empty() && variant.empty() && encoding != "astral");
            const auto changed = [&](size_t at) {
                U16 c = units16;
                c[at] ^= 1;
                return c;
            };
            const std::vector<U16> cands = {U16(units16), changed(L - 1),
                                            changed(L >> 1), U16(units16)};
            const auto p = pointers(cands);
            escape(p.data());
            const uint64_t examined[] = {L, L, (L >> 1) + 1, L};
            const uint32_t count = timed(
                [&] {
                    return op == "equal" ? k_str_equal(s, p.data(), n)
                                         : k_str_compare(s, p.data(), n);
                },
                ns);
            for (uint64_t k = 0; k < 4; k++) units += examined[k] * times(n, k, 3);
            checksum = u32Checksum(count);
        } else if (op == "slice") {
            known(needle.empty() && (variant.empty() || variant == "view"));
            const uint32_t m = uint32_t(L / 4);
            std::vector<uint32_t> starts;
            for (int k = 0; k < 1024; k++)
                starts.push_back(uint32_t(next() % (L - m + 1)));
            escape(starts.data());
            if (variant == "view")
                run([&] {
                    k_str_slice_view(U16View(s), starts.data(), m, n, &out);
                });
            else
                run([&] { k_str_slice(s, starts.data(), m, n, &out); });
            allocating(out.produced);
        } else if (op == "indexof") {
            const size_t k = needle == "n4" ? 4 : needle == "n64" ? 64 : 0;
            known(k && k < L / 2 &&
                  (variant.empty() ||
                   (variant == "bytes" && encoding == "ascii")));
            std::vector<U16> needles;
            for (int j = 0; j < 16; j++) {
                const size_t at = (L >> 1) + next() % ((L >> 1) - k + 1);
                needles.push_back(units16.substr(at, k));
            }
            const auto p = pointers(needles);
            std::vector<std::string> bytes;
            for (const U16 &x : needles) bytes.push_back(toBytes(x));
            std::vector<const std::string *> pb;
            for (const std::string &x : bytes) pb.push_back(&x);
            const std::string b = toBytes(s);
            escape(p.data());
            escape(pb.data());
            escape(b.data());
            const uint32_t h = timed(
                [&] {
                    return variant == "bytes"
                               ? k_str_indexof_bytes(b, pb.data(), n)
                               : k_str_indexof(s, p.data(), n);
                },
                ns);
            for (int j = 0; j < 16; j++) {
                const size_t at = s.find(needles[j]);
                units += (at == U16::npos ? L : at + k) * times(n, j, 15);
            }
            checksum = u32Checksum(h);
        } else if (op == "concat" || op == "builder") {
            known(needle.empty() && encoding != "astral" &&
                  (variant.empty() ||
                   variant == (op == "concat" ? "append" : "join")));
            std::vector<U16> pieces;
            for (int j = 0; j < 16; j++)
                pieces.push_back(words(encoding, PIECE[sizeIndex]));
            const auto p = pointers(pieces);
            escape(p.data());
            const size_t count = L / PIECE[sizeIndex];
            if (op == "concat") {
                if (variant == "append")
                    run([&] { k_str_concat_append(p.data(), L, n, &out); });
                else
                    run([&] { k_str_concat(p.data(), L, n, &out); });
                allocating(out.produced);
            } else {
                if (variant == "join")
                    run([&] { k_str_builder_join(p.data(), count, n, &out); });
                else
                    run([&] { k_str_builder(p.data(), count, L, n, &out); });
                allocating(n * PIECE[sizeIndex]);
            }
        } else if (op == "splitjoin" || op == "replace" ||
                   op == "replaceall") {
            known(needle.empty() && variant.empty() &&
                  (op != "splitjoin" || encoding != "astral"));
            std::vector<U16> inputs;
            const U16 pat = pattern(encoding), rep = u"[#]";
            if (op == "splitjoin")
                inputs = rotations(units16);
            else {
                U16 c = units16;
                size_t at = (L >> 1) + 1;
                while (isLow(c[at])) at++;
                for (size_t j = 0; j < pat.size(); j++) c[at + j] = pat[j];
                if (isLow(c[at + pat.size()])) c[at + pat.size()] = u'a';
                inputs = rotations(c);
            }
            const auto p = pointers(inputs);
            escape(p.data());
            if (op == "splitjoin")
                run([&] { k_str_splitjoin(p.data(), n, &out); });
            else if (op == "replace")
                run([&] { k_str_replace(p.data(), pat, rep, n, &out); });
            else
                run([&] { k_str_replaceall(p.data(), pat, rep, n, &out); });
            allocating(n * L);
        } else
            unknown();
    }

    std::printf("{\"kernel\":\"%s\",\"n\":%llu,\"ns\":%lld,\"checksum\":\"%s\","
                "\"units\":%llu,\"allocUnits\":%llu}\n",
                kernel.c_str(), static_cast<unsigned long long>(n), ns,
                checksum.c_str(), static_cast<unsigned long long>(units),
                static_cast<unsigned long long>(allocUnits));
    return 0;
}
