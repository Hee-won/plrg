const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const Vuln = {
  1: 'prototype-pollution',
  2: 'command-injection',
};

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

try {
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

              // ✅ 이미 존재하면 skip
              if (fs.existsSync(packageDir)) {
                console.log(`[SKIPPED] ${downstream} already exists at ${packageDir}`);
                continue;
              }

              console.log(`Processing package: ${downstream}`);
              fs.mkdirSync(packageDir, { recursive: true });

              process.chdir(packageDir);
              console.log(`[++++++] install package directory : ${packageDir}`);

              try {
                const output = execSync(`npm install ${downstream} --prefix ${packageDir}`, {
                  encoding: 'utf-8',
                  stdio: 'pipe'
                });
                console.log(output);
              } catch (err) {
                console.error(`❌ npm install failed for ${downstream}`);
                console.error(`stdout:\n${err.stdout}`);
                console.error(`stderr:\n${err.stderr}`);
              }
            } catch (err) {
              console.error(`Error processing package "${downstream}": ${err.message}`);
            } finally {
              process.chdir(originalDir);
            }
          }

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
