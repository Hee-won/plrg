const path = require('path');
const { readdirSync, readFileSync } = require('fs');
const Vuln = {
  1: 'command-injection',
  2: 'code-injection',
  3: 'prototype-pollution',
};

for (let i = 1; i <= 3; i++) {
  const Vulntype = Vuln[i];
  const directoryPath = path.join(__dirname, `filter_json_${Vulntype}`);
  const jsonFiles = readdirSync(directoryPath).filter((file) =>
    file.endsWith('.json')
  );

  console.log(`upstream (${Vulntype}):`, jsonFiles.length);
  const jsonContents = jsonFiles.flatMap((file) => {
    const filePath = path.join(directoryPath, file);
    return JSON.parse(readFileSync(filePath, 'utf-8')).downstreams;
  });

  console.log(`downstream (${Vulntype}):`, jsonContents.length);
}
