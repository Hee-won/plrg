const { readFileSync, writeFileSync, mkdirSync } = require('fs');
const path = require('path');

function generateSeed(package) {
  const baseDir = __dirname;

  // Create a sanitized filename (remove special characters)
  const sanitizedName = package.replace(/[^a-zA-Z0-9._-]/g, '_');

  const inputPath = path.join(
    baseDir,
    'tree',
    `${sanitizedName}_PropertyTree.json`
  );
  const outputPath = path.join(baseDir, 'seed-3', `${sanitizedName}_seed.json`);

  console.log(`[++++++] generateSeed outputPath : ${outputPath}`);

  const outputDir = path.dirname(outputPath);

  mkdirSync(outputDir, { recursive: true });

  const propertyTree = JSON.parse(readFileSync(inputPath, 'utf8'));
  const seed = [];

  function processNode(node, prefix) {
    for (const [key, value] of Object.entries(node)) {
      const currentPath = `${prefix}.${key}`;

      if (value.callable) {
        seed.push(`${currentPath}(0,0,0,0,0)`);
      }

      if (value.constructable) {
        seed.push(`new ${currentPath}(0,0,0,0,0)`);
      }

      if (value.children) {
        processNode(value.children, currentPath);
      }
    }
  }
  if (propertyTree.callable) {
    seed.push(`_(0,0,0,0,0)`);
  }
  if (propertyTree.constructable) {
    seed.push(`new _(0,0,0,0,0)`);
  }
  processNode(propertyTree.children, '_');
  writeFileSync(outputPath, JSON.stringify(seed, null, 2));
}

module.exports = {
  generateSeed,
};
