// n-body from the Computer Language Benchmarks Game, written for this
// repository after the problem description (symplectic integration of the
// Jovian planets, energy before and after). N steps from the environment
// (default 1 000 000; the game runs N = 50 000 000).
"use strict";
const n = Number(process.env.N) || 1000000;
const PI = Math.PI,
    SOLAR_MASS = 4 * PI * PI,
    DAYS_PER_YEAR = 365.24;
class Body {
    constructor(x, y, z, vx, vy, vz, mass) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.vx = vx;
        this.vy = vy;
        this.vz = vz;
        this.mass = mass;
    }
}
const bodies = [
    new Body(0, 0, 0, 0, 0, 0, SOLAR_MASS),
    new Body(
        4.8414314424647209,
        -1.16032004402742839,
        -1.03622044471123109e-1,
        1.66007664274403694e-3 * DAYS_PER_YEAR,
        7.69901118419740425e-3 * DAYS_PER_YEAR,
        -6.90460016972063023e-5 * DAYS_PER_YEAR,
        9.54791938424326609e-4 * SOLAR_MASS,
    ),
    new Body(
        8.34336671824457987,
        4.12479856412430479,
        -4.03523417114321381e-1,
        -2.76742510726862411e-3 * DAYS_PER_YEAR,
        4.99852801234917238e-3 * DAYS_PER_YEAR,
        2.30417297573763929e-5 * DAYS_PER_YEAR,
        2.85885980666130812e-4 * SOLAR_MASS,
    ),
    new Body(
        1.2894369562139131e1,
        -1.51111514016986312e1,
        -2.23307578892655734e-1,
        2.96460137564761618e-3 * DAYS_PER_YEAR,
        2.3784717395948095e-3 * DAYS_PER_YEAR,
        -2.96589568540237556e-5 * DAYS_PER_YEAR,
        4.36624404335156298e-5 * SOLAR_MASS,
    ),
    new Body(
        1.53796971148509165e1,
        -2.59193146099879641e1,
        1.79258772950371181e-1,
        2.68067772490389322e-3 * DAYS_PER_YEAR,
        1.62824170038242295e-3 * DAYS_PER_YEAR,
        -9.5159225451971587e-5 * DAYS_PER_YEAR,
        5.15138902046611451e-5 * SOLAR_MASS,
    ),
];
function offsetMomentum() {
    let px = 0,
        py = 0,
        pz = 0;
    for (const b of bodies) {
        px += b.vx * b.mass;
        py += b.vy * b.mass;
        pz += b.vz * b.mass;
    }
    bodies[0].vx = -px / SOLAR_MASS;
    bodies[0].vy = -py / SOLAR_MASS;
    bodies[0].vz = -pz / SOLAR_MASS;
}
function advance(dt) {
    const count = bodies.length;
    for (let i = 0; i < count; i++) {
        const bi = bodies[i];
        for (let j = i + 1; j < count; j++) {
            const bj = bodies[j];
            const dx = bi.x - bj.x,
                dy = bi.y - bj.y,
                dz = bi.z - bj.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            const mag = dt / (d2 * Math.sqrt(d2));
            bi.vx -= dx * bj.mass * mag;
            bi.vy -= dy * bj.mass * mag;
            bi.vz -= dz * bj.mass * mag;
            bj.vx += dx * bi.mass * mag;
            bj.vy += dy * bi.mass * mag;
            bj.vz += dz * bi.mass * mag;
        }
    }
    for (const b of bodies) {
        b.x += dt * b.vx;
        b.y += dt * b.vy;
        b.z += dt * b.vz;
    }
}
function energy() {
    let e = 0;
    const count = bodies.length;
    for (let i = 0; i < count; i++) {
        const bi = bodies[i];
        e += 0.5 * bi.mass * (bi.vx * bi.vx + bi.vy * bi.vy + bi.vz * bi.vz);
        for (let j = i + 1; j < count; j++) {
            const bj = bodies[j];
            const dx = bi.x - bj.x,
                dy = bi.y - bj.y,
                dz = bi.z - bj.z;
            e -= (bi.mass * bj.mass) / Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
    }
    return e;
}
offsetMomentum();
console.log(energy().toFixed(9));
for (let i = 0; i < n; i++) advance(0.01);
console.log(energy().toFixed(9));
