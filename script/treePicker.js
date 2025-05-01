const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const generateSeed = require('./base_seed').generateSeed;
const { Worker } = require('worker_threads');

const Vuln = {
  1: 'prototype-pollution'
  // 1: 'command-injection'
};

const failedPkgs = [];
const successedPkgs = [];

const blacklistPath = path.join(__dirname, 'blacklist.txt');
const blacklist = new Set(
  fs.existsSync(blacklistPath)
    ? fs.readFileSync(blacklistPath, 'utf-8').split('\n').map(line => line.trim()).filter(Boolean)
    : []
);

const originalDir = process.cwd();


/**
 * "pkg@version" 형태의 문자열을 파싱하여 객체를 반환합니다.
 *
 * @param {string} pkgWithVersion - 패키지 문자열 ("pkg@version")
 * @returns {{ name: string, version: string }} 패키지 이름과 버전 정보
 * @throws 에러: 문자열 형식이 올바르지 않은 경우
 */
function parsePkgAndVersion(pkgWithVersion) {
  const atIndex = pkgWithVersion.lastIndexOf('@');
  if (atIndex <= 0) throw new Error(`[xxxxx] Invalid format: ${pkgWithVersion}`);
  return { name: pkgWithVersion.slice(0, atIndex), version: pkgWithVersion.slice(atIndex + 1) };
}

function safeAnalyzeModule(packageDir, packageName, depth_limit = 20, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `
      const { parentPort } = require('worker_threads');
      const { createRequire } = require('module');
      const fs = require('fs');
      process.argv = ['node', '']; 
      process.stdout.write = () => {};
      process.stderr.write = () => {};
      process.exit = () => {};

      function isCallable(f) { return typeof f === 'function'; }
      function isConstructable(f) {
        try { Reflect.construct(function () {}, [], f); return true; } catch (_) { return false; }
      }
      function makePropTree(target, depth) {
        const properties = Object.keys(target);
        if (Object.getPrototypeOf(target)) {
          Object.keys(Object.getPrototypeOf(target)).forEach((prop) => {
            if (!properties.includes(prop)) properties.push(prop);
          });
        } // 여기 살짝 달라짐..!
        const result = {};
        for (const prop of properties) {
          const value = target[prop];
          result[prop] = {
            callable: isCallable(value),
            constructable: isConstructable(value),
          };
          if (typeof value === 'object' && value !== null && depth > 0) {
            result[prop].children = makePropTree(value, depth - 1);
          }
        }
        return result;
      }
      try {
        const require = createRequire(${JSON.stringify(packageDir)});
        const obj = require(${JSON.stringify(packageName)});
        const result = {
          callable: typeof obj === 'function',
          constructable: isConstructable(obj),
          children: makePropTree(obj, ${depth_limit})
        };
        parentPort.postMessage({ status: 'ok', result });
      } catch (err) {
        parentPort.postMessage({ status: 'error', message: err.message });
      }
      `,
      { eval: true });


    let isResolved = false;

    const timeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        worker.terminate();
        reject(new Error(`[xxxxx] Timeout: ${packageName} analysis exceeded ${timeout}ms`));
      }
    }, timeout);

    worker.on('message', (msg) => {
      if (isResolved) return;
      isResolved = true;
      clearTimeout(timeoutId);
      if (msg.status === 'ok') {
        resolve(msg.result);
      } else {
        reject(new Error(`[xxxxx] Failed to analyze ${packageName}: ${msg.message}`));
      }
    });

    worker.on('error', (err) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutId);
        reject(err);
      }
    });

    worker.on('exit', (code) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutId);
        console.error(`[xxxxx] Worker exited with code ${code} for ${packageName}`);
        if (code !== 0) {
          reject(new Error(`[xxxxx] Worker exited abnormally for ${packageName}, code: ${code}`));
        } else {
          reject(new Error(`[xxxxx] Worker exited early without message for ${packageName}`));
        }
      }
    });
  });
}

async function analyzeModule(packageName, depth_limit, modulePath, version) {
  const sanitizedName = packageName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const outputFileName = `${sanitizedName}@${version}_PropertyTree.json`;
  const outputFilePath = path.join(process.cwd(), 'tree_PP', outputFileName);

  try {
    const result = await safeAnalyzeModule(path.dirname(modulePath), packageName, depth_limit);
    fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
    fs.writeFileSync(outputFilePath, JSON.stringify(result, null, 2));
    console.log(`💛💛💛 TREE Output saved to ${outputFilePath}`);
    return result;
  } catch (err) {
    console.error(`[xxxxx] analyzeModule failed for ${packageName}: ${err.message}`);
    return null;
  }
}

async function main() {
  try {
    // tree_transitive 출력 디렉토리 생성
    fs.mkdirSync(path.join(originalDir, 'tree_PP'), { recursive: true });

    const vulnType = Vuln[1];
    const directoryPath = path.join(originalDir, `JSON_${vulnType}`);

    if (!fs.existsSync(directoryPath)) {
      console.error(`Directory not found: ${directoryPath}`);
      return;
    }

    // 대상 JSON 파일 목록 읽기
    const jsonFiles = fs
      .readdirSync(directoryPath)
      .filter((file) => file.endsWith('.json'));

    // JSON 파일별 처리
    for (const jsonFile of jsonFiles) {
      const fullPath = path.join(directoryPath, jsonFile);
      console.log(`[+++++] Processing ${fullPath}`);
      const jsonData = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));

      if (jsonData.downstreams && jsonData.downstreams.length > 0) {
        try {
          for (const downstream of jsonData.downstreams) {
            let packageDir = '';
            try {
              // 파싱: "pkg@version" 문자열 분리
              const { name, version } = parsePkgAndVersion(downstream);
              const downstreamId = `${name}@${version}`;

              // 블랙리스트에 있으면 건너뛰기
              if (blacklist.has(downstreamId)) {
                console.warn(`\n[xxxxx] SKIPPED: Blacklisted package ${downstreamId}`);
                continue;
              }

              // 파일 시스템에 안전한 이름 생성 및 설치 디렉토리 결정
              const sanitizedName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
              const folderName = `${sanitizedName}@${version}`;
              packageDir = path.join(originalDir, 'packages', folderName);

              const now = new Date();
              const timestamp = now.toISOString().replace('T', ' ').split('.')[0]; 
              console.log(`\n[${timestamp}] Processing package: ${downstream}`);
              console.log(`packageDir: ${packageDir}`);

              if (!fs.existsSync(packageDir)) {
                console.error(`[xxxxx] NPM INSTALL FAILED: ${packageDir}`);
                continue;
              }

              // 설치된 패키지 내 모듈 경로 구성
              const packagePath = path.join(
                originalDir,
                'packages',
                `${sanitizedName}@${version}`,
                'node_modules',
                name
              );

              // 이미 분석된 property tree 파일 존재 여부 확인
              const treePath = path.join(
                originalDir,
                'tree_PP',
                `${sanitizedName}@${version}_PropertyTree.json`
              );
              if (fs.existsSync(treePath)) {
                console.log(`[SKIP] Tree already exists for ${sanitizedName}@${version}, skipping analysis`);
                successedPkgs.push(`${name}@${version}`);
                continue;
              }
              
              // 모듈 분석 수행: property tree 생성 및 파일 저장
              const result_tree = await analyzeModule(name, 20, packagePath, version);
              if (!result_tree) {
                console.warn(`[xxxxx] Skipping analysis for "${name}" due to module loading failure`);
                failedPkgs.push(`${name}@${version}`);
                continue;
              }

              // 추가 seed 분석 수행
              const result_seed = generateSeed(name, version);
              if (result_seed) {
                successedPkgs.push(`${name}@${version}`);
              }

            } catch (err) {
              console.error(`[xxxxx] Error processing package "${downstream}": ${err.message}`);
            }
          }
        } catch (outerErr) {
          console.error(`[xxxxx] Error processing JSON file "${jsonFile}": ${outerErr.message}`);
        }
      }
    }
  } catch (err) {
    console.error(`[xxxxx] Main execution error: ${err.message}`);
  } finally {
    process.chdir(originalDir);
  }

  // 실패 및 성공 패키지 목록을 로그 파일로 저장
  if (failedPkgs.length > 0) {
    fs.writeFileSync('failed-packages.log', failedPkgs.join('\n'), 'utf-8');
    console.log(`[⚠️] ${failedPkgs.length} packages failed. Logged to failed-packages.log`);
  }

  if (successedPkgs.length > 0) {
    fs.writeFileSync('successed-packages.log', successedPkgs.join('\n'), 'utf-8');
    console.log(`[🏃] ${successedPkgs.length} packages succeeded. Logged to successed-packages.log`);
  }
}


// ------------------ Export ------------------
module.exports = {
  main,
  parsePkgAndVersion,
  safeAnalyzeModule,
  analyzeModule
};