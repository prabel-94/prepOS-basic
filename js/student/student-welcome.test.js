/**
 * Run: node --test js/student/student-welcome.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildWelcomeMessage,
  countPendingExams,
  getFirstName,
  getTimeGreeting,
} from "./student-welcome.js";

describe("student-welcome", () => {
  it("extracts first name", () => {
    assert.equal(getFirstName("Ada Lovelace"), "Ada");
    assert.equal(getFirstName(""), "there");
  });

  it("counts pending exams", () => {
    const exams = [
      { attemptStatus: "not_attempted" },
      { attemptStatus: "in_progress" },
      { attemptStatus: "completed" },
      { attemptStatus: "locked" },
    ];
    assert.equal(countPendingExams(exams), 2);
  });

  it("builds pending exam welcome detail", () => {
    const message = buildWelcomeMessage({
      displayName: "Ravi Kumar",
      exams: [{ attemptStatus: "not_attempted" }, { attemptStatus: "completed" }],
    });

    assert.match(message.headline, /Ravi/);
    assert.match(message.detail, /1 exam waiting/);
  });

  it("returns time-based greeting", () => {
    assert.equal(getTimeGreeting(new Date("2026-01-01T09:00:00")), "Good morning");
    assert.equal(getTimeGreeting(new Date("2026-01-01T15:00:00")), "Good afternoon");
    assert.equal(getTimeGreeting(new Date("2026-01-01T20:00:00")), "Good evening");
  });
});
