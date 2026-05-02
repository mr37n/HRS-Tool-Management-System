const fs = require('fs');
const content = fs.readFileSync('src/constants.ts', 'utf8');

function checkArray(name) {
    const regex = new RegExp(`export const ${name}(?:: [^=]+)? = \\[([\\s\\S]*?)\\];`, 'm');
    const match = content.match(regex);
    if (!match) {
        console.log(`Could not find array ${name}`);
        return;
    }
    const items = match[1];
    const idRegex = /id:\s*'([^']*)'/g;
    let idMatch;
    const ids = [];
    while ((idMatch = idRegex.exec(items)) !== null) {
        ids.push(idMatch[1]);
    }
    const counts = {};
    const dupes = [];
    ids.forEach(id => {
        counts[id] = (counts[id] || 0) + 1;
        if (counts[id] === 2) dupes.push(id);
    });
    if (dupes.length > 0) {
        console.log(`Found duplicates in ${name}:`, dupes);
    } else {
        console.log(`No duplicates in ${name}`);
    }
}

checkArray('INITIAL_INVENTORY');
checkArray('INITIAL_TOOLBOXES');
checkArray('INITIAL_TOOLBOX_DETAILS');
checkArray('MOCK_LOANS');
checkArray('MOCK_TOOLS');
