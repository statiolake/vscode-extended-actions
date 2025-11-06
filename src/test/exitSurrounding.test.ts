import * as assert from "node:assert";
import * as vscode from "vscode";
import { computeExitSelections } from "../exitSurrounding";

suite("exitSurrounding utility functions", () => {
  suite("computeExitSelections", () => {
    // Helper function to create a real TextDocument
    async function createTestDocument(text: string): Promise<vscode.TextDocument> {
      return await vscode.workspace.openTextDocument({
        content: text,
        language: "plaintext",
      });
    }

    test("should exit closing paren and move cursor after it", async () => {
      const text = "foo(hello)";
      const doc = await createTestDocument(text);
      // cursor at position 8 = 'o' in hello
      // positions: f(0)o(1)o(2)((3)h(4)e(5)l(6)l(7)o(8))(9)
      const selection = new vscode.Selection(
        new vscode.Position(0, 8),
        new vscode.Position(0, 8)
      );

      const result = computeExitSelections(doc, [selection]);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].active.line, 0);
      assert.strictEqual(result[0].active.character, 10); // after closing paren at position 9
    });

    test("should exit closing bracket and move cursor after it", async () => {
      const text = "arr[0]";
      const doc = await createTestDocument(text);
      const selection = new vscode.Selection(
        new vscode.Position(0, 4),
        new vscode.Position(0, 4)
      );

      const result = computeExitSelections(doc, [selection]);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].active.character, 6); // after closing bracket
    });

    test("should handle nested brackets", async () => {
      const text = "foo(bar[baz])";
      const doc = await createTestDocument(text);
      const selection = new vscode.Selection(
        new vscode.Position(0, 10), // cursor in 'baz'
        new vscode.Position(0, 10)
      );

      const result = computeExitSelections(doc, [selection]);
      assert.strictEqual(result.length, 1);
      // Should exit the bracket [ first, moving past ]
      assert.strictEqual(result[0].active.character, 12);
    });

    test("should exit closing quote and move cursor after it", async () => {
      const text = 'str"hello"';
      const doc = await createTestDocument(text);
      // positions: s(0)t(1)r(2)"(3)h(4)e(5)l(6)l(7)o(8)"(9)
      // cursor at position 5 = 'e' inside the quotes
      // From pos 5, search forward and find closing '"' at position 9
      // Move cursor to position 10 (after closing quote)
      const selection = new vscode.Selection(
        new vscode.Position(0, 5),
        new vscode.Position(0, 5)
      );

      const result = computeExitSelections(doc, [selection]);
      assert.strictEqual(result.length, 1);
      // Found closing quote at position 9, move to 10
      assert.strictEqual(result[0].active.character, 10);
    });

    test("should handle multiple selections", async () => {
      const text = "foo(a) bar(b)";
      const doc = await createTestDocument(text);
      // positions: f(0)o(1)o(2)((3)a(4))(5) (6)b(7)a(8)r(9)((10)b(11))(12)
      const selections = [
        new vscode.Selection(new vscode.Position(0, 4), new vscode.Position(0, 4)), // inside first paren at 'a'
        new vscode.Selection(new vscode.Position(0, 11), new vscode.Position(0, 11)), // inside second paren at 'b'
      ];

      const result = computeExitSelections(doc, selections);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].active.character, 6); // after first ) at position 5
      assert.strictEqual(result[1].active.character, 13); // after second ) at position 12
    });

    test("should keep selection if no opening bracket found", async () => {
      const text = "hello world";
      const doc = await createTestDocument(text);
      const selection = new vscode.Selection(
        new vscode.Position(0, 5),
        new vscode.Position(0, 5)
      );

      const result = computeExitSelections(doc, [selection]);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].active.line, 0);
      assert.strictEqual(result[0].active.character, 5); // unchanged
    });

    test("should handle escaped quotes", async () => {
      const text = 'str"hel\\"lo"';
      const doc = await createTestDocument(text);
      // Actual string: str"hel\"lo"
      // positions: s(0)t(1)r(2)"(3)h(4)e(5)l(6)\(7)"(8)l(9)o(10)"(11)
      // cursor at position 5 = 'e' before escaped quote
      // From pos 5, search forward and find closing quote at pos 11 (skipping escaped quote at pos 8)
      // Move to position 12 (after closing quote)
      const selection = new vscode.Selection(
        new vscode.Position(0, 5),
        new vscode.Position(0, 5)
      );

      const result = computeExitSelections(doc, [selection]);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].active.character, 12);
    });

    test("should handle multiline text", async () => {
      const text = "foo(\n  bar\n)";
      const doc = await createTestDocument(text);
      const selection = new vscode.Selection(
        new vscode.Position(1, 4),
        new vscode.Position(1, 4)
      );

      const result = computeExitSelections(doc, [selection]);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].active.line, 2);
      assert.strictEqual(result[0].active.character, 1); // after closing paren
    });
  });
});
