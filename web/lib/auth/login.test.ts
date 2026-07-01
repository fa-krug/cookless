import { describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/test/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "./password";
import { loginWithPassword } from "./login";

const now = new Date("2026-06-27T12:00:00Z");

describe("loginWithPassword", () => {
  it("returns the user on correct credentials", async () => {
    const db = createTestDb();
    db.insert(users).values({
      id: "u1", email: "a@x.test", password: await hashPassword("Tr0ub4dour&3"), createdAt: now,
    }).run();
    const user = await loginWithPassword(db, { email: "a@x.test", password: "Tr0ub4dour&3" });
    expect(user.id).toBe("u1");
  });

  it("rejects a wrong password with 401", async () => {
    const db = createTestDb();
    db.insert(users).values({
      id: "u1", email: "a@x.test", password: await hashPassword("Tr0ub4dour&3"), createdAt: now,
    }).run();
    await expect(loginWithPassword(db, { email: "a@x.test", password: "nope" })).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects an unknown email with 401", async () => {
    const db = createTestDb();
    await expect(loginWithPassword(db, { email: "ghost@x.test", password: "x" })).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects a user with no usable password with 401", async () => {
    const db = createTestDb();
    db.insert(users).values({ id: "u2", email: "b@x.test", password: "", createdAt: now }).run();
    await expect(loginWithPassword(db, { email: "b@x.test", password: "anything" })).rejects.toMatchObject(
      { status: 401 },
    );
  });
});
