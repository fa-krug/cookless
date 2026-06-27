import { describe, expect, it } from "vitest";
import { Decimal } from "../decimal";
import { type DomainUnit, toBase } from "./units";

const gram: DomainUnit = { id: 1, baseUnitId: null, conversionFactor: "1" };
const kg: DomainUnit = { id: 2, baseUnitId: 1, conversionFactor: "1000" };

describe("toBase", () => {
  it("multiplies by conversion_factor for a derived unit (1.5 kg -> 1500 g)", () => {
    expect(toBase(new Decimal("1.5"), kg).toString()).toBe("1500");
  });

  it("returns quantity unchanged for a base unit (200 g -> 200)", () => {
    expect(toBase(new Decimal("200"), gram).toString()).toBe("200");
  });

  it("matches the legacy 500 g -> 0.5 kg case (factor 0.001)", () => {
    const gFromKg: DomainUnit = { id: 3, baseUnitId: 9, conversionFactor: "0.001" };
    expect(toBase(500, gFromKg).toString()).toBe("0.5");
  });
});
