import { test } from "node:test";
import assert from "node:assert/strict";
import { maxPanes, planPane } from "../lib/layout.mjs";

test("empty stack splits right of REX_BLOCK", () => {
  assert.deepEqual(planPane([], 3, "block:p"), { split: "right", anchor: "block:p" });
});

test("next pane goes below the last", () => {
  assert.deepEqual(planPane(["block:a", "block:b"], 3, "block:p"), { split: "below", anchor: "block:b" });
});

test("full stack overflows to a tab", () => {
  assert.deepEqual(planPane(["block:a", "block:b", "block:c"], 3, "block:p"), { split: null });
});

test("max 0 always tabs", () => {
  assert.deepEqual(planPane([], 0, "block:p"), { split: null });
});

test("maxPanes reads REX_AGENT_MAX_PANES", () => {
  assert.equal(maxPanes({}), 3);
  assert.equal(maxPanes({ REX_AGENT_MAX_PANES: "5" }), 5);
  assert.equal(maxPanes({ REX_AGENT_MAX_PANES: "0" }), 0);
  assert.equal(maxPanes({ REX_AGENT_MAX_PANES: "x" }), 3);
  assert.equal(maxPanes({ REX_AGENT_MAX_PANES: "-1" }), 3);
});
