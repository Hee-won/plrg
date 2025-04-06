const { readFileSync, writeFileSync, mkdirSync } = require('fs');
const path = require('path');

function generateSeed(package) {
  const baseDir = __dirname;

  const inputPath = path.join(baseDir, 'output', `${package}_PropertyTree.json`);
  const outputPath = path.join(baseDir, 'seed', `${package}_seed.json`);
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
  if (package.callable) {
    seed.push(`${package}(0,0,0,0,0)`);
  }
  if (package.constructable) {
    seed.push(`new ${package}(0,0,0,0,0)`);
  }
  processNode(propertyTree, package.children);
  writeFileSync(outputPath, JSON.stringify(seed, null, 2));
}

module.exports = {
  generateSeed,
};
