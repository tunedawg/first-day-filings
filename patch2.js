const fs = require('fs');
const content = fs.readFileSync('src/google.js', 'utf8');

const newFunction = `async function replaceTokenWithParagraphs(accessToken, documentId, token, items, appendPerItem = null) {
  // Replace the token with a unique sentinel so we can find its exact character index.
  // Using replaceAllText here only to locate the position — insertText handles the real content.
  const sentinel = \`FDFST\${Date.now()}FDFST\`;
  const sentinelResult = await googleRequest(
    accessToken,
    \`\${GOOGLE_DOCS_API}/documents/\${documentId}:batchUpdate\`,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            replaceAllText: {
              containsText: { text: token, matchCase: true },
              replaceText: items.length > 0 ? sentinel : "",
            },
          },
        ],
      }),
    },
  );

  // If the token wasn't in this document, nothing more to do
  const replaced = sentinelResult?.replies?.[0]?.replaceAllText?.occurrencesChanged ?? 0;
  if (replaced === 0 || items.length === 0) return;

  function collectSpans(content) {
    const result = [];
    for (const el of content || []) {
      for (const pe of el.paragraph?.elements || []) {
        if (pe.textRun?.content) result.push({ text: pe.textRun.content, start: pe.startIndex });
      }
      for (const row of el.table?.tableRows || []) {
        for (const cell of row.tableCells || []) {
          result.push(...collectSpans(cell.content));
        }
      }
    }
    return result;
  }

  // Build expanded items: each appendPerItem gets its own paragraph (\\n), so Google Docs
  // creates a real paragraph break. appendPerItem paragraphs will have deleteParagraphBullets
  // applied so they don't get a list number, and updateParagraphStyle to match the template's
  // own indentation for that label (captured from the template doc on first occurrence).
  const expandedItems = appendPerItem
    ? items.flatMap((item, i) => i < items.length - 1 ? [item, appendPerItem] : [item])
    : [...items];
  const insertedText = expandedItems.join("\\n");

  let templateAppendStyle = null;

  // Loop: the token may appear multiple times in the template (e.g. same block token
  // used under several numbered RFPs). replaceAllText replaced ALL occurrences with
  // the sentinel — process each one in turn until none remain.
  for (let occurrence = 0; occurrence < replaced; occurrence++) {
    const doc = await googleRequest(accessToken, \`\${GOOGLE_DOCS_API}/documents/\${documentId}\`);

    // On first occurrence, scan for an existing appendPerItem paragraph in the template
    // to capture its indentation style (so inserted labels match template formatting).
    if (appendPerItem && !templateAppendStyle) {
      for (const el of doc.body?.content || []) {
        if (!el.paragraph) continue;
        const text = (el.paragraph.elements || [])
          .map((e) => e.textRun?.content || "").join("").trim();
        if (text === appendPerItem) {
          templateAppendStyle = el.paragraph.paragraphStyle || {};
          break;
        }
      }
    }

    let combinedText = "";
    const docIndices = [];
    for (const span of collectSpans(doc.body?.content)) {
      for (let i = 0; i < span.text.length; i++) {
        docIndices.push(span.start + i);
      }
      combinedText += span.text;
    }

    const sentinelIdx = combinedText.indexOf(sentinel);
    if (sentinelIdx === -1) break;

    const sentinelStart = docIndices[sentinelIdx];
    const sentinelEnd = docIndices[sentinelIdx + sentinel.length - 1] + 1;

    await googleRequest(accessToken, \`\${GOOGLE_DOCS_API}/documents/\${documentId}:batchUpdate\`, {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            deleteContentRange: {
              range: { startIndex: sentinelStart, endIndex: sentinelEnd },
            },
          },
          {
            insertText: {
              location: { index: sentinelStart },
              text: insertedText,
            },
          },
        ],
      }),
    });

    if (appendPerItem) {
      // Calculate the character ranges of each appendPerItem paragraph in the inserted text.
      const appendRanges = [];
      let pos = sentinelStart;
      for (const item of expandedItems) {
        if (item === appendPerItem) {
          appendRanges.push({ startIndex: pos, endIndex: pos + item.length });
        }
        pos += item.length + 1; // +1 for the \\n paragraph separator
      }

      if (appendRanges.length > 0) {
        await googleRequest(accessToken, \`\${GOOGLE_DOCS_API}/documents/\${documentId}:batchUpdate\`, {
          method: "POST",
          body: JSON.stringify({
            requests: appendRanges.flatMap((range) => [
              // Remove list bullet so this paragraph gets no number
              { deleteParagraphBullets: { range } },
              // Bold the label text
              { updateTextStyle: { range, textStyle: { bold: true }, fields: "bold" } },
              // Apply template indentation if we captured it
              ...(templateAppendStyle ? [{
                updateParagraphStyle: {
                  range,
                  paragraphStyle: templateAppendStyle,
                  fields: "indentFirstLine,indentStart,spaceAbove,spaceBelow",
                },
              }] : []),
            ]),
          }),
        });
      }
    }
  } // end for-loop over occurrences
}`;

// Find the function start and end, replace entire function
const funcStart = content.indexOf('async function replaceTokenWithParagraphs(');
if (funcStart === -1) {
  console.error('Could not find replaceTokenWithParagraphs');
  process.exit(1);
}

// Find the closing brace of the function by counting braces
let depth = 0;
let funcEnd = -1;
let inString = false;
let stringChar = '';
let i = funcStart;
while (i < content.length) {
  const ch = content[i];
  if (!inString) {
    if (ch === '`' || ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        funcEnd = i + 1;
        break;
      }
    }
  } else {
    if (ch === '\\') {
      i++; // skip escaped char
    } else if (ch === stringChar) {
      inString = false;
    }
  }
  i++;
}

if (funcEnd === -1) {
  console.error('Could not find end of function');
  process.exit(1);
}

const newContent = content.slice(0, funcStart) + newFunction + content.slice(funcEnd);
fs.writeFileSync('src/google.js', newContent);
console.log('Patched replaceTokenWithParagraphs successfully');
console.log(`Replaced chars ${funcStart}-${funcEnd}`);
