import { Decimal } from "../decimal";

export interface DomainUnit {
  id: number;
  baseUnitId: number | null;
  conversionFactor: string;
}

/** Convert a quantity to its base unit. Port of Django Unit.to_base(). */
export function toBase(quantity: Decimal | string | number, unit: DomainUnit): Decimal {
  const q = new Decimal(quantity);
  if (unit.baseUnitId !== null) {
    return q.times(new Decimal(unit.conversionFactor));
  }
  return q;
}
