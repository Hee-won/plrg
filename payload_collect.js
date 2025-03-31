const path = require('path');
const { readdirSync, readFileSync } = require('fs');
const Vuln = {
    1: "command-injection",
    2: "code-injection",
    3: "prototype-pollution"
};

const Vulntype = Vuln[process.argv[2]] || Vuln[1];
const directoryPath = path.join(__dirname, `selected(${Vulntype})`);
const jsonFiles = readdirSync(directoryPath).filter(file => file.endsWith('.json'));

const jsonContents = jsonFiles.map(file => {
    const filePath = path.join(directoryPath, file);
    return JSON.parse(readFileSync(filePath, 'utf-8')).keystring;
});

const uniqueItems = [...new Set(jsonContents)];
const outputFilePath = path.join(__dirname, `unique_items${Vulntype}.json`);
require('fs').writeFileSync(outputFilePath, JSON.stringify(uniqueItems, null, 2), 'utf-8');
console.log(`Unique items written to ${outputFilePath}`);
