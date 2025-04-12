// downstreamInstaller.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const filenameExtractor = require('./filenameExtractor');
const fileManager = require('./fileManager');

const Vuln = {
  1: 'prototype-pollution',
  // 2: 'command-injection',
};

const originalDir = process.cwd();
const baseInstallDir = path.join(originalDir, 'packages_');



/**
 * 주어진 패키지를 지정된 디렉토리에 npm install 함
 * - 설치 디렉토리는 `${baseDir}/${pkg_name}@${version}`
 *
 * @param {string} downstream - 'pkg@version' 형식의 문자열
 * @param {string} baseDir - 설치할 기본 디렉토리
 */
function installPackage(downstream, baseDir) {
  const { name, version } = parsePkgAndVersion(downstream);
  const sanitizedName = name.replace(/[^a-zA-Z0-9._-]/g, '_'); // 파일 시스템에 안전한 이름으로 변환
  const folderName = `${sanitizedName}@${version}`;
  const packageDir = path.join(baseDir, folderName);

  if (fs.existsSync(packageDir)) {
    console.log(`[SKIPPED] ${downstream} already exists at ${packageDir}`);
    return;
  }

  console.log(`Processing package: ${downstream}`);
  fs.mkdirSync(packageDir, { recursive: true });

  try {
    process.chdir(packageDir);
    console.log(`[++++++] install package directory : ${packageDir}`);

    const output = execSync(`npm install ${downstream} --prefix ${packageDir}`, {
      encoding: 'utf-8',
      stdio: 'pipe'
    });

    console.log(output);
  } catch (err) {
    console.error(`❌ npm install failed for ${downstream}`);
    if (err.stdout) console.error(`stdout:\n${err.stdout}`);
    if (err.stderr) console.error(`stderr:\n${err.stderr}`);
  } finally {
    process.chdir(originalDir);
  }
}

/**
 * 주어진 취약점 타입에 해당하는 모든 JSON 파일을 열어,
 * downstream 리스트 내 패키지들을 순회하며 npm 설치 수행
 *
 * @param {string} vulnType - 취약점 유형 문자열 (예: 'prototype-pollution')
 */
function runForVulnType(vulnType) {
  const jsonDir = path.join(originalDir, `filter_json_${vulnType}_`);
  const jsonFiles = fileManager.getJSONFilesInDirectory(jsonDir);

  for (const file of jsonFiles) {
    const fullPath = path.join(jsonDir, file);
    const jsonData = fileManager.readJSONFile(fullPath);

    if (jsonData.downstreams && jsonData.downstreams.length > 0) {
      for (const downstream of jsonData.downstreams) {
        try {
          installPackage(downstream, baseInstallDir);
        } catch (err) {
          console.error(`Error processing ${downstream}: ${err.message}`);
        }
      }
    }
  }
}

/**
 * 메인 실행 함수
 * - 각 취약점 유형에 대해 `runForVulnType` 호출
 * - 오류 발생 시 복구 및 복귀 경로 관리
 */
function main() {
  try {
    for (let i = 1; i <= 1; i++) {
      const vulnType = Vuln[i];
      if (!vulnType) continue;

      console.log(`\n[★] Processing vulnerability type: ${vulnType}`);
      runForVulnType(vulnType);
    }
  } catch (err) {
    console.error(`Main execution error: ${err.message}`);
  } finally {
    process.chdir(originalDir);
  }
}

main();

// ------------------ Export ------------------
module.exports = {
};