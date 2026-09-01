const fs = require('fs');

// Read the CSV file
const content = fs.readFileSync('/root/owly/scratch/kb_export.csv', 'utf-8');

// A simple CSV parser (since the content has quotes and newlines)
function parseCSV(str) {
    const arr = [];
    let quote = false;
    let row = 0, col = 0;
    for (let c = 0; c < str.length; c++) {
        let cc = str[c], nc = str[c+1];
        arr[row] = arr[row] || [];
        arr[row][col] = arr[row][col] || '';
        if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; continue; }
        if (cc == '"') { quote = !quote; continue; }
        if (cc == ',' && !quote) { ++col; continue; }
        if (cc == '\r' && nc == '\n' && !quote) { ++row; col = 0; ++c; continue; }
        if (cc == '\n' && !quote) { ++row; col = 0; continue; }
        if (cc == '\r' && !quote) { ++row; col = 0; continue; }
        arr[row][col] += cc;
    }
    return arr;
}

const data = parseCSV(content);

// Filter only "Statuts FNE"
let statuts = data.filter(row => row[0] === 'Statuts FNE');

// We exclude the ones we already merged (Article 15-17) just in case they were exported, wait, the export was done BEFORE we deleted 16 and 17!
// We should re-export to be safe or just fetch fresh.
