import { expect, it } from "vitest";
import type { Application } from "../shared/types";
import { confirmedApplication } from "../shared/confirmed-applications";

it("requires a receipt and a valid delivery date even when status says sent", () => {
  const app = {
    status: "Enviada",
    receipt: "employer-receipt",
    submittedAt: new Date().toISOString(),
  } as Application;
  expect(confirmedApplication(app)).toBe(true);
  expect(confirmedApplication({ ...app, receipt: null })).toBe(false);
  expect(confirmedApplication({ ...app, receipt: " " })).toBe(false);
  expect(confirmedApplication({ ...app, submittedAt: undefined })).toBe(false);
  expect(confirmedApplication({ ...app, submittedAt: "invalid" })).toBe(false);
});
