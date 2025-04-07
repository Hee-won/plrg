const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const generateSeed = require('./base_seed').generateSeed;
const PoCgenerator = require('./mutator').PoCgenerator;

const Vuln = {
  1: 'prototype-pollution',
  2: 'command-injection',
  // 3: 'code-injection',
};

// Store original directory to return to it later
const originalDir = process.cwd();

function parsePkgAndVersion(pkgWithVersion) {
  const atIndex = pkgWithVersion.lastIndexOf('@');
  if (atIndex <= 0) {
    throw new Error(`Invalid format: ${pkgWithVersion}`);
  }
  const name = pkgWithVersion.slice(0, atIndex);
  const version = pkgWithVersion.slice(atIndex + 1);
  return { name, version };
}

function isCallable(f) {
  return typeof f === 'function';
}

function isConstructable(f) {
  try {
    Reflect.construct(function () {}, [], f);
    return true;
  } catch (e) {
    return false;
  }
}

function makePropTree(target, depth) {
  const properties = Object.keys(target);
  Object.getPrototypeOf(target) &&
    Object.keys(Object.getPrototypeOf(target)).forEach((prop) => {
      if (!properties.includes(prop)) properties.push(prop);
    });
  const result = {};
  for (const prop of properties) {
    // if (black_list.includes(prop)) continue;
    const value = target[prop];
    result[prop] = {
      callable: isCallable(value),
      constructable: isConstructable(value),
    };
    if (typeof value === 'object' && depth > 0) {
      result[prop].children = makePropTree(value, depth - 1);
    }
  }
  return result;
}

function analyzeModule(packageName, depth_limit, modulePath) {
  let targetObject = {};
  try {
    const absolutePath = path.join(modulePath, 'node_modules', packageName);
    targetObject = require(absolutePath);
    console.log(`[++++++] analyzeModule package directory : ${absolutePath}`);
  } catch (err) {
    console.error(
      `Module "${packageName}" not found or error loading: ${err.message}`
    );
    return targetObject;
  }

  const result = {
    callable: isCallable(targetObject),
    constructable: isConstructable(targetObject),
    children: makePropTree(targetObject, depth_limit),
  };

  // Create a sanitized filename (remove special characters)
  const sanitizedName = packageName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const outputFileName = `${sanitizedName}_PropertyTree.json`;
  const outputFilePath = path.join(originalDir, 'tree', outputFileName);

  try {
    fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
    fs.writeFileSync(outputFilePath, JSON.stringify(result, null, 2));
    console.log(`Output saved to ${outputFilePath}`);
  } catch (err) {
    console.error(`Failed to save output: ${err.message}`);
  }
  return result;
}

// Main execution
try {
  // Ensure output directory exists
  fs.mkdirSync(path.join(originalDir, 'tree'), { recursive: true });

  for (let i = 1; i <= 2; i++) {
    const vulnType = Vuln[i];
    const directoryPath = path.join(originalDir, `filter_json_${vulnType}`);

    if (!fs.existsSync(directoryPath)) {
      console.error(`Directory not found: ${directoryPath}`);
      continue;
    }

    const jsonFiles = fs
      .readdirSync(directoryPath)
      .filter((file) => file.endsWith('.json'));
    let j = 0;
    for (const jsonFile of jsonFiles) {
      j++;

      const fullPath = path.join(directoryPath, jsonFile);
      const jsonData = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      const keyExpression = jsonData.keystring || '';

      if (jsonData.downstreams && jsonData.downstreams.length > 0) {
        try {
          jsonData.downstreams.forEach((downstream, idx) => {
            let packageDir = '';
            try {
              // const package = path.basename(jsonFile, '.json');
              // const packageName = package.replace(/:/g, '/');
              const { name, version } = parsePkgAndVersion(downstream);
              packageDir = path.join(
                originalDir,
                'packages',
                name + '_' + (j + idx)
              );

              console.log(`Processing package: ${downstream}`);
              // Create package directory
              fs.mkdirSync(packageDir, { recursive: true });

              // Change to package directory and install
              process.chdir(packageDir);
              console.log(`[++++++] install package directory : ${packageDir}`);
              execSync(`npm install ${downstream} --prefix ${packageDir}`, {
                stdio: 'inherit',
              });

              // Parse package name and version

              // Analyze the module (proptree)
              analyzeModule(name, 20, packageDir);

              // Analyze the paths
              generateSeed(name);

              // Generate PoC and verify
              PoCgenerator(name, 100, keyExpression, vulnType); // 30초
            } catch (err) {
              console.error(
                `Error processing package "${downstream}": ${err.message}`
              );
            } finally {
              fs.rmSync(packageDir, { recursive: true, force: true });
              process.chdir(originalDir);
            }
          });
        } catch (outerErr) {
          console.error(
            `Error processing JSON file "${jsonFile}": ${outerErr.message}`
          );
        }
      }
    }
  }
} catch (err) {
  console.error(`Main execution error: ${err.message}`);
} finally {
  process.chdir(originalDir);
}

module.exports = {
  analyzeModule,
};
