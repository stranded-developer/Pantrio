import { Q } from "./rational";

// Every quantity reduces to one of three base units. Conversions *within* a
// dimension are universal (1 kg = 1000 g); conversions *across* dimensions
// are per-ingredient facts (1 egg ≈ 55 g, 1 L of oil ≈ 920 g) and are
// supplied by the caller.

export type Dimension = "mass" | "volume" | "count";

export const UNITS = {
  mg: { dimension: "mass", toBase: "1/1000" },
  g: { dimension: "mass", toBase: "1" },
  ons: { dimension: "mass", toBase: "100" }, // Indonesian market unit: 1 ons = 100 g
  kg: { dimension: "mass", toBase: "1000" },
  ml: { dimension: "volume", toBase: "1" },
  l: { dimension: "volume", toBase: "1000" },
  pcs: { dimension: "count", toBase: "1" },
  lusin: { dimension: "count", toBase: "12" }, // dozen
} as const satisfies Record<string, { dimension: Dimension; toBase: string }>;

export type UnitCode = keyof typeof UNITS;

export const UNIT_CODES = Object.keys(UNITS) as UnitCode[];

export const BASE_UNIT: Record<Dimension, UnitCode> = {
  mass: "g",
  volume: "ml",
  count: "pcs",
};

/**
 * A per-ingredient equivalence: `qty unit` equals `equalsQty equalsUnit`.
 * e.g. { qty: 1, unit: "pcs", equalsQty: 55, equalsUnit: "g" } for an egg.
 */
export type Conversion = {
  qty: number | string;
  unit: UnitCode;
  equalsQty: number | string;
  equalsUnit: UnitCode;
};

export class ConversionError extends Error {
  constructor(from: UnitCode, to: UnitCode) {
    super(`No conversion from ${from} to ${to}. Add one on the ingredient (e.g. 1 pcs = 55 g).`);
    this.name = "ConversionError";
  }
}

export function dimensionOf(unit: UnitCode): Dimension {
  return UNITS[unit].dimension;
}

function factor(unit: UnitCode): Q {
  const [n = "1", d = "1"] = UNITS[unit].toBase.split("/");
  return Q.of(BigInt(n), BigInt(d));
}

/** Quantity in its dimension's base unit (g, ml or pcs). */
export function toBase(qty: Q, unit: UnitCode): Q {
  return qty.mul(factor(unit));
}

/**
 * Convert `qty` of `from` into `to`, using per-ingredient conversions when
 * the dimensions differ. Conversions work in either direction.
 */
export function convert(
  qty: Q,
  from: UnitCode,
  to: UnitCode,
  conversions: readonly Conversion[] = []
): Q {
  const fromDim = dimensionOf(from);
  const toDim = dimensionOf(to);
  const base = toBase(qty, from);

  if (fromDim === toDim) return base.div(factor(to));

  for (const c of conversions) {
    const a = toBase(Q.from(c.qty), c.unit);
    const b = toBase(Q.from(c.equalsQty), c.equalsUnit);
    if (dimensionOf(c.unit) === fromDim && dimensionOf(c.equalsUnit) === toDim) {
      return base.mul(b).div(a).div(factor(to));
    }
    if (dimensionOf(c.equalsUnit) === fromDim && dimensionOf(c.unit) === toDim) {
      return base.mul(a).div(b).div(factor(to));
    }
  }
  throw new ConversionError(from, to);
}
