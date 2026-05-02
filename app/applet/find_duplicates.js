const fs = require('fs');
const content = fs.readFileSync('/app/applet/src/constants.ts', 'utf8');
const idRegex = /id:\s*'([^']*)'/g;
let match;
const ids = {};
const duplicates = [];

while ((match = idRegex.exec(content)) !== null) {
  const id = match[1];
  if (ids[id]) {
    duplicates.push(id);
  }
  ids[id] = true;
}

if (duplicates.length > 0) {
  console.log('Duplicate IDs found in constants.ts:', duplicates);
} else {
  console.log('No duplicate IDs found in constants.ts');
}
