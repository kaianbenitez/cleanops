import assert from "node:assert/strict";
import test from "node:test";
import { pickMyDayActiveJob } from "@/lib/my-day/active-job";

const job = (jobId: string) => ({ jobId });

test("a completed selection cannot stay in the My Day action card", () => {
  assert.equal(
    pickMyDayActiveJob({
      currentJob: job("next"),
      openEntryJobId: null,
      selectedJobId: "completed",
      todayJobs: [job("next")],
      upcomingJobs: [],
    })?.jobId,
    "next",
  );
});

test("an open clock entry overrides the cleaner's previous selection", () => {
  assert.equal(
    pickMyDayActiveJob({
      currentJob: job("traveling"),
      openEntryJobId: "traveling",
      selectedJobId: "other",
      todayJobs: [job("other"), job("traveling")],
      upcomingJobs: [],
    })?.jobId,
    "traveling",
  );
});

test("a pending selection remains active and an all-complete day has no action card", () => {
  assert.equal(
    pickMyDayActiveJob({
      currentJob: job("first"),
      openEntryJobId: null,
      selectedJobId: "second",
      todayJobs: [job("first"), job("second")],
      upcomingJobs: [],
    })?.jobId,
    "second",
  );
  assert.equal(
    pickMyDayActiveJob({
      currentJob: null,
      openEntryJobId: null,
      selectedJobId: "completed",
      todayJobs: [],
      upcomingJobs: [],
    }),
    null,
  );
});
