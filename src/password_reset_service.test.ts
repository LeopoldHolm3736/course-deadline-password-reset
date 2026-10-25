import assert from "node:assert/strict";
import test from "node:test";
import { learnerReport } from "./password_reset_service.ts";

test("an incomplete learner with three days left is deadline-near", () => {
  const result = learnerReport({ id: "l-1", email: "a@example.com", course: "Web Apps", deadline: "2026-10-28" }, new Date("2026-10-25T00:00:00Z"));
  assert.deepEqual(result, { learnerId: "l-1", course: "Web Apps", status: "deadline-near" });
});
