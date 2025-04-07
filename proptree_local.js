// 로컬 설치된 npm 패키지들 대상으로 뽑아진 seed와 tree를 이용해 mutation 돌리
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const PoCgenerator = require('./mutator_local').PoCgenerator;

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

// Main execution
try {
  // Already output directory exists

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

    for (const jsonFile of jsonFiles) {


      const fullPath = path.join(directoryPath, jsonFile);
      const jsonData = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      const keyExpression = jsonData.keystring || '';

      if (jsonData.downstreams && jsonData.downstreams.length > 0) {
        try {
          jsonData.downstreams.forEach((downstream, idx) => {
            let packageDir = '';
            try {
              const { name, version } = parsePkgAndVersion(downstream);

              // sanitize package name for directory name
              const sanitizedName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
              const folderName = `${sanitizedName}@${version}`;

              packageDir = path.join(originalDir, 'packages', folderName);

              const starttime = Date.now();
              console.log(`Start time: ${starttime}`);
              console.log(`Processing package: ${downstream}`);

              const absRequirePath = path.join('${packageDir}', 'node_modules', '${package}');

              if (!fs.existsSync(packageDir)) {
                console.log(`[SKIPPED] Package not installed: ${downstream}`);
                return; // 또는 continue;
              }
              
              // Generate PoC and verify
              PoCgenerator(name, 100, keyExpression, vulnType, absRequirePath); 


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
