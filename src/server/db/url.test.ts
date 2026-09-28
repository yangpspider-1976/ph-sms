import { describe, expect, it } from "vitest";
import { forPostgresJs } from "./url";

describe("connection strings for postgres.js", () => {
  it("drops channel_binding and keeps sslmode", () => {
    const out = new URL(
      forPostgresJs(
        "postgresql://u:p@ep-x-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
      ),
    );
    expect(out.searchParams.has("channel_binding")).toBe(false);
    expect(out.searchParams.get("sslmode")).toBe("require");
    expect(out.hostname).toBe("ep-x-pooler.ap-southeast-1.aws.neon.tech");
    expect(out.pathname).toBe("/neondb");
  });

  it("leaves a string without it untouched", () => {
    const url = "postgres://ph_sms:ph_sms_dev@127.0.0.1:54329/ph_sms";
    expect(forPostgresJs(url)).toBe(url);
  });
});
