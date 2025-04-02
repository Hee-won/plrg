const path = require('path');
const {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  rmSync,
} = require('fs');
const { analyzeDirectory } = require('./checker.js');
const { execSync } = require('child_process');
const tar = require('tar');

const Vuln = {
  1: 'command-injection',
  2: 'code-injection',
  3: 'prototype-pollution',
};

const Vulntype = Vuln[3];
const directoryPath = path.join(__dirname, `json_${Vulntype}`);
const jsonFiles = readdirSync(directoryPath).filter((file) =>
  file.endsWith('.json')
);

const jsonContents = jsonFiles.map((file) => {
  const filePath = path.join(directoryPath, file);
  return JSON.parse(readFileSync(filePath, 'utf-8'));
});

mkdirSync(path.join(__dirname, `filter_json_${Vulntype}`), {
  recursive: true,
});

// Create a temp directory for npm pack files
const tempDir = path.join(__dirname, 'temp_pack_dir');
if (!existsSync(tempDir)) {
  mkdirSync(tempDir);
}

jsonContents.forEach((jsonContent, index) => {
  const { upstream, keymethod, downstreams } = jsonContent;
  if (!downstreams) {
    return;
  }

  const filterdownstreams = [];
  downstreams.forEach((downstream) => {
    const [libName, version] = downstream.startsWith('@')
      ? [`@${downstream.split(/@(.+?)@/)[1]}`, downstream.split(/@(.+?)@/)[2]]
      : downstream.split('@');

    const folderName = `downstream_${index + 1}`;
    const folderPath = path.join(__dirname, folderName);

    if (!existsSync(folderPath)) {
      mkdirSync(folderPath);
    }

    // Use npm pack to download the package as a tarball
    try {
      // Change to temp directory for packing
      process.chdir(tempDir);

      // Run npm pack to get the tarball
      const tarballName = execSync(`npm pack ${libName}@${version} --silent`)
        .toString()
        .trim();
      const tarballPath = path.join(tempDir, tarballName);

      // Create the node_modules structure
      const nodeModulesPath = path.join(folderPath, 'node_modules');
      if (!existsSync(nodeModulesPath)) {
        mkdirSync(nodeModulesPath, { recursive: true });
      }

      let packagePath;
      if (libName.startsWith('@')) {
        const scopeName = libName.split('/')[0];
        const scopePath = path.join(nodeModulesPath, scopeName);
        if (!existsSync(scopePath)) {
          mkdirSync(scopePath, { recursive: true });
        }

        // Create the package directory (e.g., credential-provider-ini)
        const packageName = libName.split('/')[1];
        packagePath = path.join(nodeModulesPath, scopeName, packageName);
      } else {
        packagePath = path.join(nodeModulesPath, libName);
      }

      // Create the package directory if it doesn't exist
      if (!existsSync(packagePath)) {
        mkdirSync(packagePath, { recursive: true });
      }

      // Extract the tarball to the correct directory
      tar.extract({
        file: tarballPath,
        cwd: packagePath,
        sync: true,
        strip: 1,
      });

      // Delete the tarball after extraction
      rmSync(tarballPath);

      // Return to original directory
      process.chdir(__dirname);

      // Analyze the extracted package
      if (analyzeDirectory(packagePath, upstream, keymethod)) {
        filterdownstreams.push(downstream);
      }
    } catch (error) {
      console.error(`Error processing ${libName}@${version}:`, error.message);
    } finally {
      // Clean up
      if (existsSync(folderPath)) {
        rmSync(folderPath, { recursive: true, force: true });
      }
    }
  });

  const jsonFilePath = path.join(
    __dirname,
    `filter_json_${Vulntype}`,
    `${upstream}.json`
  );

  jsonContent.downstreams = filterdownstreams;
  if (filterdownstreams.length > 0) {
    writeFileSync(jsonFilePath, JSON.stringify(jsonContent, null, 2), 'utf-8');
  }
});

// Clean up the temp directory at the end
rmSync(tempDir, { recursive: true, force: true });
