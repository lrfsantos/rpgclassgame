// Seeded PRNG (mulberry32) + small random helpers.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Returns a fresh seed (0..2^31-1).
export function newSeed() {
  return (Math.random() * 0x7fffffff) >>> 0;
}

export class Dice {
  constructor(seed) {
    this.rand = mulberry32(seed);
  }
  next() {
    return this.rand();
  }
  // integer in [min, max] inclusive
  int(min, max) {
    return Math.floor(this.rand() * (max - min + 1)) + min;
  }
  pick(arr) {
    return arr[Math.floor(this.rand() * arr.length)];
  }
  roll(sides) {
    return this.int(1, sides);
  }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }
}
