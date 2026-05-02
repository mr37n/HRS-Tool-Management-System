const fs = require('fs');
const content = fs.readFileSync('src/constants.ts', 'utf8');
const matches = content.match(/id:\s*'([^']*)'/g);
if (matches) {
    const ids = matches.map(m => m.match(/'([^']*)'/)[1]);
    const counts = {};
    const dupes = [];
    ids.forEach(id => {
        counts[id] = (counts[id] || 0) + 1;
        if (counts[id] === 2) dupes.push(id);
    });
    console.log('Duplicates found:', dupes);
    dupes.forEach(id => {
        console.log(`ID ${id} occurs ${counts[id]} times`);
    });
} else {
    console.log('No IDs found');
}
