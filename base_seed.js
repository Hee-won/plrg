const { readFileSync, writeFileSync, mkdirSync } = require('fs');

function generateSeed(package) {
  const path = `output/${package}_PropertyTree.json`;
  const outputPath = `seed/${package}_seed.json`;
  const outputDir = 'seed';

  mkdirSync(outputDir, { recursive: true });

  const propertyTree = JSON.parse(readFileSync(path, 'utf8'));
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

generateSeed('libnmap');
