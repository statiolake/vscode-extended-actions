/**
 * Pure functions for matching brackets/quotes (for testing).
 * These work on text snippets, not full documents.
 */

import * as vscode from "vscode";

export interface Position {
  line: number;
  character: number;
}

export function isOpeningChar(char: string): boolean {
  return ["(", "[", "{", '"', "'", "`"].includes(char);
}

export function isClosingChar(char: string): boolean {
  return [")", "]", "}", '"', "'", "`"].includes(char);
}

/**
 * Pure function to compute new selections after exiting current surrounding brackets/quotes.
 * Searches forward from the cursor position for the next closing bracket/quote,
 * tracking bracket depth to find the first unmatched closing bracket.
 *
 * @param document The TextDocument to process
 * @param selections The current selections to update
 * @returns Array of new selections, one for each input selection
 */
export function computeExitSelections(
  document: vscode.TextDocument,
  selections: readonly vscode.Selection[]
): vscode.Selection[] {
  const newSelections: vscode.Selection[] = [];

  for (const selection of selections) {
    const cursorPos = selection.active;
    const cursorOffset = document.offsetAt(cursorPos);

    // Find the next closing bracket/quote by tracking depth
    const closingOffset = findNextClosingPosition(document, cursorOffset);

    if (closingOffset < 0) {
      // If no closing bracket found, keep the current selection
      newSelections.push(selection);
      continue;
    }

    // Move cursor past the closing bracket/quote
    const closingPos = document.positionAt(closingOffset);
    const newPos = new vscode.Position(closingPos.line, closingPos.character + 1);
    newSelections.push(new vscode.Selection(newPos, newPos));
  }

  return newSelections;
}

/**
 * Find the position of the next closing bracket/quote from the cursor offset.
 * Simply searches forward and returns the first closing character encountered,
 * skipping over any nested pairs along the way.
 *
 * @param document The TextDocument to search in
 * @param startOffset The cursor offset to start searching from
 * @returns The offset of the closing bracket/quote, or -1 if not found
 */
function findNextClosingPosition(
  document: vscode.TextDocument,
  startOffset: number
): number {
  // Get document end position without reading any text
  const lastLine = document.lineCount - 1;
  const lastLineRange = document.lineAt(lastLine).range;
  const docEnd = document.offsetAt(lastLineRange.end);
  let pos = startOffset;

  while (pos < docEnd) {
    const char = document.getText(
      new vscode.Range(
        document.positionAt(pos),
        document.positionAt(pos + 1)
      )
    );

    // Handle escape sequences
    if (char === "\\" && pos + 1 < docEnd) {
      pos += 2;
      continue;
    }

    // If we find a closing character, return it
    if (isClosingChar(char)) {
      return pos;
    }

    // If we find an opening character, skip to its matching closing
    if (isOpeningChar(char)) {
      const matchingClose = findMatchingClose(document, pos, char);
      if (matchingClose >= 0) {
        pos = matchingClose + 1;
        continue;
      }
    }

    pos++;
  }

  return -1;
}

/**
 * Find the matching closing bracket/quote for an opening character at a given position.
 */
function findMatchingClose(
  document: vscode.TextDocument,
  openPos: number,
  openChar: string
): number {
  // Get document end position without reading any text
  const lastLine = document.lineCount - 1;
  const lastLineRange = document.lineAt(lastLine).range;
  const docEnd = document.offsetAt(lastLineRange.end);
  const closeChar = getClosingChar(openChar);
  if (!closeChar) {
    return -1;
  }

  let pos = openPos + 1;
  let depth = 1;

  // For quotes (same open and close char)
  if (openChar === closeChar) {
    while (pos < docEnd) {
      const char = document.getText(
        new vscode.Range(
          document.positionAt(pos),
          document.positionAt(pos + 1)
        )
      );

      if (char === "\\" && pos + 1 < docEnd) {
        pos += 2;
        continue;
      }

      if (char === closeChar) {
        return pos;
      }

      pos++;
    }
    return -1;
  }

  // For brackets (different open and close char)
  while (pos < docEnd) {
    const char = document.getText(
      new vscode.Range(
        document.positionAt(pos),
        document.positionAt(pos + 1)
      )
    );

    if (char === "\\" && pos + 1 < docEnd) {
      pos += 2;
      continue;
    }

    if (char === openChar) {
      depth++;
    } else if (char === closeChar) {
      depth--;
      if (depth === 0) {
        return pos;
      }
    }

    pos++;
  }

  return -1;
}

function getClosingChar(openChar: string): string | null {
  const pairs: { [key: string]: string } = {
    "(": ")",
    "[": "]",
    "{": "}",
    '"': '"',
    "'": "'",
    "`": "`",
  };
  return pairs[openChar] || null;
}

