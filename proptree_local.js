// 로컬 설치된 npm 패키지들 대상으로 뽑아진 seed와 tree를 이용해 mutation 돌리
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const PoCgenerator = require('./mutator_local').PoCgenerator;

// 아무리 에러핸들링을 해도 죽는 애들
const blacklistPath = path.join(__dirname, 'blacklist.txt');
const blacklist = new Set(
  fs.existsSync(blacklistPath)
    ? fs.readFileSync(blacklistPath, 'utf-8').split('\n').map(line => line.trim()).filter(Boolean)
    : []
);

const Vuln = {
  1: 'prototype-pollution',
  // 2: 'command-injection',
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

  for (let i = 1; i <= 1; i++) {
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
          for (const downstream of jsonData.downstreams) {
            let packageDir = '';
            try {
              const { name, version } = parsePkgAndVersion(downstream);

              // sanitize package name for directory name
              const sanitizedName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
              const folderName = `${sanitizedName}@${version}`;

              packageDir = path.join(originalDir, 'packages', folderName);

              const starttime = Date.now();
              console.log(`\nStart time: ${starttime}`);
              console.log(`Processing package: ${downstream}`);

              const absRequirePath = path.join(packageDir, 'node_modules', name);
              console.log(`[-----] absRequirePath: ${absRequirePath}`);

              if (!fs.existsSync(packageDir)) {
                console.log(`[xxxxx] [SKIPPED] Package not installed: ${downstream}`);
                continue;
              }

              const seedPath = path.join(__dirname, 'seed', `${sanitizedName}@${version}_seed.json`);
              console.log(`[-----] seedPath: ${seedPath}`);
              if (!fs.existsSync(seedPath)) {
                console.log(`[xxxxx] [SKIPPED] No seedPath: ${downstream}`);
                continue;
              }


              // Generate PoC and verify
              PoCgenerator(name, 1, keyExpression, vulnType, absRequirePath, version, keyExpression); 


            } catch (err) {
              console.error(
                `[xxxxx] Error processing package "${downstream}": ${err.message}`
              );
            } 
          }
        } catch (outerErr) {
          console.error(
            `[xxxxx] Error processing JSON file "${jsonFile}": ${outerErr.message}`
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

