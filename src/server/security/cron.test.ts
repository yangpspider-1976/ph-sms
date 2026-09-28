import { afterEach, describe, expect, it } from "vitest";
import { env, resetEnvForTests } from "@/server/env";
import { isAuthorizedCron } from "./cron";

const saved = { cron: process.env.CRON_SECRET, vercel: process.env.VERCEL };

function setVar(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  setVar("CRON_SECRET", saved.cron);
  setVar("VERCEL", saved.vercel);
  setVar("DISPATCH_AFTER_RESPONSE", undefined);
  resetEnvForTests();
});

const call = (authorization?: string) =>
  new Request("http://localhost/api/cron/dispatch", {
    headers: authorization ? { authorization } : {},
  });

describe("cron authorization", () => {
  it("accepts the configured bearer secret", () => {
    setVar("CRON_SECRET", "s3cret-value");
    resetEnvForTests();
    expect(isAuthorizedCron(call("Bearer s3cret-value"))).toBe(true);
  });

  it("refuses a missing or wrong secret", () => {
    setVar("CRON_SECRET", "s3cret-value");
    resetEnvForTests();
    expect(isAuthorizedCron(call())).toBe(false);
    expect(isAuthorizedCron(call("Bearer wrong"))).toBe(false);
    expect(isAuthorizedCron(call("s3cret-value"))).toBe(false);
  });

  it("refuses everything when no secret is configured", () => {
    setVar("CRON_SECRET", undefined);
    resetEnvForTests();
    expect(isAuthorizedCron(call("Bearer "))).toBe(false);
    expect(isAuthorizedCron(call("Bearer undefined"))).toBe(false);
  });
});

describe("dispatch after response", () => {
  it("is on under Vercel and off elsewhere unless set explicitly", () => {
    setVar("VERCEL", undefined);
    resetEnvForTests();
    expect(env.DISPATCH_AFTER_RESPONSE).toBe(false);

    setVar("VERCEL", "1");
    resetEnvForTests();
    expect(env.DISPATCH_AFTER_RESPONSE).toBe(true);

    setVar("DISPATCH_AFTER_RESPONSE", "false");
    resetEnvForTests();
    expect(env.DISPATCH_AFTER_RESPONSE).toBe(false);
  });
});
