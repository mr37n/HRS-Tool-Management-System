const fs = require('fs');
const content = fs.readFileSync('src/constants.ts', 'utf8');
const idRegex = /id:\s*'([^']*)'/g;
let match;
const ids = {};
const duplicates = [];

while ((match = idRegex.exec(content)) !== null) {
  const id = match[1];
  if (ids[id]) {
    duplicates.push(id);
  }
  ids[id] = (ids[id] || 0) + 1;
}

if (duplicates.length > 0) {
  console.log('Duplicate IDs found in constants.ts:');
  duplicates.forEach(id => {
    console.log(`ID: ${id} (count: ${ids[id]})`);
  });
} else {
  console.log('No duplicate IDs found in constants.ts');
}
