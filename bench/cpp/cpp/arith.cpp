// Arithmetic and call kernels of the Nona vs optimized C++ comparison (#401):
// the C++ twin of ../js/arith.js. Every kernel has the same name, inputs and
// order of operations as the JavaScript one, so the checksums agree exactly.
//
//   arith <kernel> <n> <seed>
//
// Builds its inputs from <seed> (xorshift32), times only the kernel call with
// std::chrono::steady_clock and prints one JSON line:
// {"kernel", "n", "ns", "checksum"}. Nothing is printed in the timed region.
//
// Contract (see the header of ../js/arith.js for the full text): one
// operation is one double or uint32_t addition/multiplication; a kernel does
// exactly n of them. Operation i reads t[i & 1023] of a seeded table.
// *_chain has one dependent accumulator, *_x4 four independent ones.
// *_direct calls add/multiply (inlined in the optimized build, out of line
// with -DBENCH_NOINLINE -fno-inline). *_indirect calls through a function
// pointer read from a seed-ordered array, *_stdfn calls the same pointer
// through std::function (JavaScript counterpart: *_indirect), *_closure calls
// a lambda that captured the table pointer by value through std::function.
// f64_array_<size> does n element updates a[j] = a[j] * k + c over a
// std::vector<double> of <size> bytes.
//
// Floating point: build without -ffast-math and with -ffp-contract=off so
// every operation is one IEEE binary64 operation in program order, as in
// JavaScript. Integer arithmetic is on uint32_t (wrapping, no signed
// overflow). Every kernel is a separate noinline function (one call per timed
// region) so that bench/cpp/check-asm.mjs can find its loop in the
// disassembly. keep() is an empty asm statement applied once to each result
// and once to each input pointer; there is no volatile on the arithmetic.
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <string>
#include <vector>

#ifdef BENCH_NOINLINE
#define CALLEE extern "C" __attribute__((noinline))
#else
#define CALLEE extern "C"
#endif
#define KERNEL extern "C" __attribute__((noinline))

static_assert(std::chrono::steady_clock::is_steady, "monotonic clock");

namespace {
constexpr uint32_t MASK = 1023;

uint32_t state;
uint32_t next() {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return state;
}

inline void keep(double &x) { asm volatile("" : "+x"(x)); }
inline void keep(uint32_t &x) { asm volatile("" : "+r"(x)); }
inline void escape(const void *p) { asm volatile("" : : "r"(p) : "memory"); }
} // namespace

CALLEE double f64_add(double a, double b) { return a + b; }
CALLEE double f64_mul(double a, double b) { return a * b; }
CALLEE uint32_t u32_add(uint32_t a, uint32_t b) { return a + b; }
CALLEE uint32_t u32_mul(uint32_t a, uint32_t b) { return a * b; }

using F64Fn = double (*)(double, double);
using U32Fn = uint32_t (*)(uint32_t, uint32_t);

// Inline expressions.
KERNEL double k_f64_add_chain(const double *t, uint64_t n) {
    double s = 0;
    for (uint64_t i = 0; i < n; i++) s = s + t[i & MASK];
    return s;
}
KERNEL double k_f64_add_x4(const double *t, uint64_t n) {
    double s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    for (uint64_t i = 0; i < n; i += 4) {
        s0 = s0 + t[i & MASK];
        s1 = s1 + t[(i + 1) & MASK];
        s2 = s2 + t[(i + 2) & MASK];
        s3 = s3 + t[(i + 3) & MASK];
    }
    return (s0 + s1) + (s2 + s3);
}
KERNEL double k_f64_mul_chain(const double *t, uint64_t n) {
    double p = 1;
    for (uint64_t i = 0; i < n; i++) p = p * t[i & MASK];
    return p;
}
KERNEL double k_f64_mul_x4(const double *t, uint64_t n) {
    double p0 = 1, p1 = 1, p2 = 1, p3 = 1;
    for (uint64_t i = 0; i < n; i += 4) {
        p0 = p0 * t[i & MASK];
        p1 = p1 * t[(i + 1) & MASK];
        p2 = p2 * t[(i + 2) & MASK];
        p3 = p3 * t[(i + 3) & MASK];
    }
    return (p0 * p1) * (p2 * p3);
}
KERNEL uint32_t k_u32_add_chain(const uint32_t *t, uint64_t n) {
    uint32_t s = 0;
    for (uint64_t i = 0; i < n; i++) s = s + t[i & MASK];
    return s;
}
KERNEL uint32_t k_u32_add_x4(const uint32_t *t, uint64_t n) {
    uint32_t s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    for (uint64_t i = 0; i < n; i += 4) {
        s0 = s0 + t[i & MASK];
        s1 = s1 + t[(i + 1) & MASK];
        s2 = s2 + t[(i + 2) & MASK];
        s3 = s3 + t[(i + 3) & MASK];
    }
    return (s0 + s1) + (s2 + s3);
}
KERNEL uint32_t k_u32_mul_chain(const uint32_t *t, uint64_t n) {
    uint32_t p = 1;
    for (uint64_t i = 0; i < n; i++) p = p * t[i & MASK];
    return p;
}
KERNEL uint32_t k_u32_mul_x4(const uint32_t *t, uint64_t n) {
    uint32_t p0 = 1, p1 = 1, p2 = 1, p3 = 1;
    for (uint64_t i = 0; i < n; i += 4) {
        p0 = p0 * t[i & MASK];
        p1 = p1 * t[(i + 1) & MASK];
        p2 = p2 * t[(i + 2) & MASK];
        p3 = p3 * t[(i + 3) & MASK];
    }
    return (p0 * p1) * (p2 * p3);
}
KERNEL uint32_t k_loop_control(const uint32_t *t, uint64_t n) {
    uint32_t c = 0;
    for (uint64_t i = 0; i < n; i++) c = c ^ t[i & MASK];
    return c;
}

// Direct calls of a known function.
KERNEL double k_f64_add_direct(const double *t, uint64_t n) {
    double s = 0;
    for (uint64_t i = 0; i < n; i++) s = f64_add(s, t[i & MASK]);
    return s;
}
KERNEL double k_f64_mul_direct(const double *t, uint64_t n) {
    double p = 1;
    for (uint64_t i = 0; i < n; i++) p = f64_mul(p, t[i & MASK]);
    return p;
}
KERNEL uint32_t k_u32_add_direct(const uint32_t *t, uint64_t n) {
    uint32_t s = 0;
    for (uint64_t i = 0; i < n; i++) s = u32_add(s, t[i & MASK]);
    return s;
}
KERNEL uint32_t k_u32_mul_direct(const uint32_t *t, uint64_t n) {
    uint32_t p = 1;
    for (uint64_t i = 0; i < n; i++) p = u32_mul(p, t[i & MASK]);
    return p;
}

// Calls through a function pointer or a std::function chosen at run time.
KERNEL double k_f64_indirect(F64Fn f, const double *t, uint64_t n,
                             double init) {
    double s = init;
    for (uint64_t i = 0; i < n; i++) s = f(s, t[i & MASK]);
    return s;
}
KERNEL uint32_t k_u32_indirect(U32Fn f, const uint32_t *t, uint64_t n,
                               uint32_t init) {
    uint32_t s = init;
    for (uint64_t i = 0; i < n; i++) s = f(s, t[i & MASK]);
    return s;
}
KERNEL double k_f64_stdfn(const std::function<double(double, double)> &f,
                          const double *t, uint64_t n, double init) {
    double s = init;
    for (uint64_t i = 0; i < n; i++) s = f(s, t[i & MASK]);
    return s;
}
KERNEL uint32_t
k_u32_stdfn(const std::function<uint32_t(uint32_t, uint32_t)> &f,
            const uint32_t *t, uint64_t n, uint32_t init) {
    uint32_t s = init;
    for (uint64_t i = 0; i < n; i++) s = f(s, t[i & MASK]);
    return s;
}
KERNEL double k_f64_closure(const std::function<double(double, uint64_t)> &f,
                            uint64_t n, double init) {
    double s = init;
    for (uint64_t i = 0; i < n; i++) s = f(s, i);
    return s;
}
KERNEL uint32_t
k_u32_closure(const std::function<uint32_t(uint32_t, uint64_t)> &f, uint64_t n,
              uint32_t init) {
    uint32_t s = init;
    for (uint64_t i = 0; i < n; i++) s = f(s, i);
    return s;
}

// Element-wise update of a contiguous double array (#240).
KERNEL void k_f64_array(double *a, uint64_t length, uint64_t n, double k,
                        double c) {
    for (uint64_t done = 0; done < n; done += length) {
        uint64_t m = n - done < length ? n - done : length;
        for (uint64_t j = 0; j < m; j++) a[j] = a[j] * k + c;
    }
}

namespace {
std::vector<double> f64AddTable() {
    std::vector<double> t(MASK + 1);
    for (auto &x : t) x = double(next() >> 8) / 16777216.0;
    return t;
}
std::vector<double> f64MulTable() {
    std::vector<double> t(MASK + 1);
    for (int j = 0; j < 512; j++) {
        double d = double(1 + next() % 1024) / 1073741824.0;
        t[j] = 1 + d;
        t[j + 512] = 1 - d;
    }
    return t;
}
std::vector<uint32_t> u32Table(bool odd) {
    std::vector<uint32_t> t(MASK + 1);
    for (auto &x : t) x = odd ? next() | 1 : next();
    return t;
}

std::string f64Checksum(double x) {
    uint64_t bits;
    std::memcpy(&bits, &x, sizeof bits);
    char text[32];
    std::snprintf(text, sizeof text, "f64:%016llx",
                  static_cast<unsigned long long>(bits));
    return text;
}
std::string u32Checksum(uint32_t x) { return "u32:" + std::to_string(x); }

[[noreturn]] void fail(const std::string &message) {
    std::fprintf(stderr, "%s\n", message.c_str());
    std::exit(2);
}

using Clock = std::chrono::steady_clock;

// Times f() and returns its result; the result is kept once.
template <class F> auto timed(F f, long long &ns) {
    auto t0 = Clock::now();
    auto r = f();
    keep(r);
    auto t1 = Clock::now();
    ns = std::chrono::duration_cast<std::chrono::nanoseconds>(t1 - t0)
             .count();
    return r;
}
} // namespace

int main(int argc, char **argv) {
    if (argc != 4) fail("usage: arith <kernel> <n> <seed>");
    const std::string kernel = argv[1];
    char *end;
    const uint64_t n = std::strtoull(argv[2], &end, 10);
    if (*end) fail("usage: arith <kernel> <n> <seed>");
    const uint32_t seed = uint32_t(std::strtoull(argv[3], nullptr, 10));
    state = seed ? seed : 0x9e3779b9u;

    const auto under = [&](const std::string &name) {
        return kernel.compare(0, name.size(), name) == 0;
    };
    long long ns = 0;
    std::string checksum;

    if (kernel == "loop_control") {
        auto t = u32Table(false);
        escape(t.data());
        checksum = u32Checksum(timed([&] { return k_loop_control(t.data(), n); }, ns));
    } else if (under("f64_array_")) {
        const std::string size = kernel.substr(10);
        uint64_t bytes = size == "4k"    ? 4096
                         : size == "1m"  ? 1u << 20
                         : size == "64m" ? 64u << 20
                                         : 0;
        if (!bytes) fail("unknown kernel " + kernel);
        std::vector<double> a(bytes / 8);
        for (auto &x : a) x = double(next() >> 8) / 16777216.0;
        const double k = 0.5 + double((seed >> 3) % 8) / 1024.0;
        const double c = double(seed % 1024) / 1024.0;
        escape(a.data());
        auto t0 = Clock::now();
        k_f64_array(a.data(), a.size(), n, k, c);
        escape(a.data());
        auto t1 = Clock::now();
        ns = std::chrono::duration_cast<std::chrono::nanoseconds>(t1 - t0)
                 .count();
        double sum = 0;
        for (double x : a) sum = sum + x;
        checksum = f64Checksum(sum);
    } else if (under("f64_add_") || under("f64_mul_")) {
        const bool isAdd = under("f64_add_");
        const std::string form = kernel.substr(8);
        auto t = isAdd ? f64AddTable() : f64MulTable();
        const double *p = t.data();
        escape(p);
        const double init = isAdd ? 0 : 1;
        // The array order depends on the seed; slot `which ^ swap` holds the
        // wanted function.
        const unsigned swap = seed & 1, which = isAdd ? 0 : 1;
        F64Fn fns[2] = {swap ? f64_mul : f64_add, swap ? f64_add : f64_mul};
        escape(fns);
        const F64Fn f = fns[which ^ swap];
        double r;
        if (form == "chain")
            r = timed([&] { return isAdd ? k_f64_add_chain(p, n) : k_f64_mul_chain(p, n); }, ns);
        else if (form == "x4") {
            if (n % 4) fail("n must be a multiple of 4 for " + kernel);
            r = timed([&] { return isAdd ? k_f64_add_x4(p, n) : k_f64_mul_x4(p, n); }, ns);
        } else if (form == "direct")
            r = timed([&] { return isAdd ? k_f64_add_direct(p, n) : k_f64_mul_direct(p, n); }, ns);
        else if (form == "indirect")
            r = timed([&] { return k_f64_indirect(f, p, n, init); }, ns);
        else if (form == "stdfn") {
            const std::function<double(double, double)> g = f;
            r = timed([&] { return k_f64_stdfn(g, p, n, init); }, ns);
        } else if (form == "closure") {
            std::function<double(double, uint64_t)> g;
            if (isAdd)
                g = [p](double s, uint64_t i) { return s + p[i & MASK]; };
            else
                g = [p](double s, uint64_t i) { return s * p[i & MASK]; };
            r = timed([&] { return k_f64_closure(g, n, init); }, ns);
        } else
            fail("unknown kernel " + kernel);
        checksum = f64Checksum(r);
    } else if (under("u32_add_") || under("u32_mul_")) {
        const bool isAdd = under("u32_add_");
        const std::string form = kernel.substr(8);
        auto t = u32Table(!isAdd);
        const uint32_t *p = t.data();
        escape(p);
        const uint32_t init = isAdd ? 0 : 1;
        const unsigned swap = seed & 1, which = isAdd ? 0 : 1;
        U32Fn fns[2] = {swap ? u32_mul : u32_add, swap ? u32_add : u32_mul};
        escape(fns);
        const U32Fn f = fns[which ^ swap];
        uint32_t r;
        if (form == "chain")
            r = timed([&] { return isAdd ? k_u32_add_chain(p, n) : k_u32_mul_chain(p, n); }, ns);
        else if (form == "x4") {
            if (n % 4) fail("n must be a multiple of 4 for " + kernel);
            r = timed([&] { return isAdd ? k_u32_add_x4(p, n) : k_u32_mul_x4(p, n); }, ns);
        } else if (form == "direct")
            r = timed([&] { return isAdd ? k_u32_add_direct(p, n) : k_u32_mul_direct(p, n); }, ns);
        else if (form == "indirect")
            r = timed([&] { return k_u32_indirect(f, p, n, init); }, ns);
        else if (form == "stdfn") {
            const std::function<uint32_t(uint32_t, uint32_t)> g = f;
            r = timed([&] { return k_u32_stdfn(g, p, n, init); }, ns);
        } else if (form == "closure") {
            std::function<uint32_t(uint32_t, uint64_t)> g;
            if (isAdd)
                g = [p](uint32_t s, uint64_t i) { return s + p[i & MASK]; };
            else
                g = [p](uint32_t s, uint64_t i) { return s * p[i & MASK]; };
            r = timed([&] { return k_u32_closure(g, n, init); }, ns);
        } else
            fail("unknown kernel " + kernel);
        checksum = u32Checksum(r);
    } else
        fail("unknown kernel " + kernel);

    std::printf("{\"kernel\":\"%s\",\"n\":%llu,\"ns\":%lld,\"checksum\":\"%s\"}\n",
                kernel.c_str(), static_cast<unsigned long long>(n), ns,
                checksum.c_str());
    return 0;
}
