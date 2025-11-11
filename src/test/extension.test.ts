import * as assert from "node:assert";

suite("Extension Test Suite", () => {
  test("Sample test", () => {
    assert.strictEqual(1, [-1, 0, 1].indexOf(0));
    assert.strictEqual(true, true);
  });
});
