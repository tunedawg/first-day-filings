const fs = require('fs');
const content = fs.readFileSync('src/google.js', 'utf8');
const lines = content.split('\n');

// Find the broken insertedText line and replace it
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('items.map((item, i) => i < items.length - 1')) {
    // Build the correct line: template literal with  escape sequence (not literal char)
    lines[i] = "    ? items.map((item, i) => i < items.length - 1 ? `${item}\\u000B${appendPerItem}` : item).join('\\n')";
    lines[i + 1] = "    : items.join('\\n');";
    console.log('Patched line', i + 1);
    console.log('New line:', lines[i]);
    break;
  }
}

fs.writeFileSync('src/google.js', lines.join('\n'));
