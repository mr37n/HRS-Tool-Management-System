const fs = require('fs');
const content = fs.readFileSync('src/constants.ts', 'utf8');
const regex = /id:\s*'([^']*)'/g;
let match;
const counts = {};
while ((match = regex.exec(content)) !== null) {
  const id = match[1];
  counts[id] = (counts[id] || 0) + 1;
}
for (const id in counts) {
  if (counts[id] > 1) {
    console.log(`Duplicate found: ${id} (${counts[id]} times)`);
  }
}
