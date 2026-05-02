const fs = require('fs');
const content = fs.readFileSync('src/constants.ts', 'utf8');

function findDuplicates(arrayName) {
    const regex = new RegExp(`${arrayName}\\s*[:=]\\s*\\[([\\s\\S]*?)\\];`, 'm');
    const match = content.match(regex);
    if (!match) return;
    const items = match[1];
    const idRegex = /id:\s*'([^']*)'/g;
    let idMatch;
    const ids = [];
    while ((idMatch = idRegex.exec(items)) !== null) {
        ids.push(idMatch[1]);
    }
    const counts = {};
    const duplicates = [];
    ids.forEach(id => {
        counts[id] = (counts[id] || 0) + 1;
        if (counts[id] === 2) duplicates.push(id);
    });
    console.log(`${arrayName} duplicates:`, duplicates);
}

findDuplicates('INITIAL_INVENTORY');
findDuplicates('INITIAL_TOOLBOXES');
findDuplicates('INITIAL_TOOLBOX_DETAILS');
findDuplicates('INITIAL_TOOLBOX_DETAILS_GENERIC');
findDuplicates('MOCK_LOANS');
findDuplicates('MOCK_PROGRESS_ORDERS');
findDuplicates('MOCK_MAINTENANCE_LOGS');
