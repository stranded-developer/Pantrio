// Exact fractions over bigint.
//
// Ingredient costing is full of non-terminating intermediates: Rp 23.900 for
// 30 eggs is Rp 796,666… per egg. Floats drift, and rounding each line drifts
// (FOKAS D13). So every intermediate stays exact, and rounding to whole
// rupiah happens once, on the final figure (decision P5).

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

export class Q {
  readonly n: bigint;
  readonly d: bigint;

  private constructor(n: bigint, d: bigint) {
    if (d === 0n) throw new RangeError("Division by zero");
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d) || 1n;
    this.n = n / g;
    this.d = d / g;
  }

  static of(n: bigint | number, d: bigint | number = 1n): Q {
    return new Q(BigInt(n), BigInt(d));
  }

  static readonly ZERO = Q.of(0);
  static readonly ONE = Q.of(1);

  /**
   * From a decimal number or string, exactly as written: 0.1 → 1/10, not the
   * binary float nearest to 0.1. Number#toString already gives the shortest
   * round-trip decimal, so `Q.from(0.1)` is exact.
   */
  static from(value: number | string | Q): Q {
    if (value instanceof Q) return value;
    const s = typeof value === "number" ? numberToDecimal(value) : value.trim();
    const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s);
    if (!m || (m[2] === "" && (m[3] ?? "") === "")) {
      throw new TypeError(`Not a decimal number: ${String(value)}`);
    }
    const sign = m[1] === "-" ? -1n : 1n;
    const frac = m[3] ?? "";
    const n = BigInt((m[2] || "0") + frac) * sign;
    return new Q(n, 10n ** BigInt(frac.length));
  }

  /** basis points → fraction: 1000 bps = 1/10 */
  static bps(bps: number): Q {
    return Q.of(BigInt(bps), 10_000n);
  }

  add(o: Q): Q {
    return new Q(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Q): Q {
    return new Q(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Q): Q {
    return new Q(this.n * o.n, this.d * o.d);
  }
  div(o: Q): Q {
    return new Q(this.n * o.d, this.d * o.n);
  }
  neg(): Q {
    return new Q(-this.n, this.d);
  }

  cmp(o: Q): -1 | 0 | 1 {
    const l = this.n * o.d;
    const r = o.n * this.d;
    return l < r ? -1 : l > r ? 1 : 0;
  }
  isZero(): boolean {
    return this.n === 0n;
  }
  isNegative(): boolean {
    return this.n < 0n;
  }

  /**
   * Half away from zero to an integer, matching Postgres `round(numeric)` and
   * FOKAS `roundRupiah()`.
   */
  round(): number {
    const abs = this.n < 0n ? -this.n : this.n;
    const r = (2n * abs + this.d) / (2n * this.d);
    return Number(this.n < 0n ? -r : r);
  }

  /** Ratio in basis points, rounded: 0.3125 → 3125. */
  toBps(): number {
    return this.mul(Q.of(10_000)).round();
  }

  toNumber(): number {
    return Number(this.n) / Number(this.d);
  }

  toString(): string {
    return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`;
  }
}

function numberToDecimal(x: number): string {
  if (!Number.isFinite(x)) throw new TypeError(`Not a finite number: ${x}`);
  const s = String(x);
  if (!/e/i.test(s)) return s;
  // 1e-7 and friends: expand the exponent form exactly.
  const [mant = "0", expStr = "0"] = s.toLowerCase().split("e");
  const exp = Number(expStr);
  const neg = mant.startsWith("-");
  const [int = "", frac = ""] = mant.replace("-", "").split(".");
  const digits = int + frac;
  const point = int.length + exp;
  const out =
    point <= 0
      ? `0.${"0".repeat(-point)}${digits}`
      : point >= digits.length
        ? digits + "0".repeat(point - digits.length)
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return (neg ? "-" : "") + out;
}
