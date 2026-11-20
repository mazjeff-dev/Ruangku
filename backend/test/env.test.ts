import { describe, expect, it } from "vitest";
import { parseTrustProxy, validateEnvironment } from "../src/lib/env";

const validEnvironment = {
  DATABASE_URL: "mysql://user:password@localhost:3306/ruangku",
  JWT_SECRET: "a-secure-secret-with-at-least-thirty-two-characters",
  NODE_ENV: "development",
};

describe("server environment", () => {
  it("requires a database URL and a 32-character JWT secret", () => {
    expect(() => validateEnvironment({})).toThrow(/DATABASE_URL wajib diisi/);
    expect(() => validateEnvironment({
      DATABASE_URL: validEnvironment.DATABASE_URL,
      JWT_SECRET: "short",
    })).toThrow(/JWT_SECRET wajib berisi minimal 32 karakter/);
  });

  it("requires CORS origins in production", () => {
    expect(() => validateEnvironment({ ...validEnvironment, NODE_ENV: "production" }))
      .toThrow(/CORS_ORIGIN wajib diisi/);
    expect(validateEnvironment({
      ...validEnvironment,
      NODE_ENV: "production",
      CORS_ORIGIN: "https://admin.example.edu, https://rooms.example.edu",
    }).corsOrigins).toEqual(["https://admin.example.edu", "https://rooms.example.edu"]);
  });

  it("parses express proxy trust settings", () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy("0")).toBe(0);
    expect(parseTrustProxy("2")).toBe(2);
    expect(parseTrustProxy("loopback")).toBe("loopback");
    expect(parseTrustProxy("true")).toBe(true);
    expect(parseTrustProxy("false")).toBe(false);
  });
});
