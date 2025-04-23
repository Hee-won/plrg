const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, spawnSync } = require('child_process');
const semver = require('semver');

const filenameExtractor = require('./filenameExtractor');
const fileManager = require('./fileManager');
const npmAnalyzer = require('./npmAnalyzer');
const extractKeyInstances = require('./keyInstanceExtractor');


// ------------------ Downstream Fetcher ------------------

/**
 * deps.dev API를 사용하여 패키지의 직접적인 dependent 패키지를 가져옴 (재귀적으로도 가능)
 *
 * @param {string} pkg - 패키지 이름 (예: '@babel/core')
 * @param {string} version - 패키지 버전 (예: '7.15.0')
 * @param {number} currentDepth - 현재 재귀 깊이 
 * @param {number} depthLimit - 최대 재귀 깊이 
 * @returns {Promise<Array<Object>>} - dependent 트리 구조 (배열 형태)
 */
function fetchDependents(pkg, version, currentDepth, depthLimit) {
  return new Promise((resolve, reject) => {
    let encodedPkg = pkg.startsWith('@') ? pkg.replace('/', '%2F') : pkg;
    const url = `https://deps.dev/_/s/npm/p/${encodedPkg}/v/${version}/dependents`;

    https.get(url, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', async () => {
        if (res.statusCode !== 200) {
          console.error(`[에러] ${pkg}@${version} 요청 실패: HTTP ${res.statusCode}`);
          return resolve([]);
        }

        let jsonData;
        try {
          jsonData = JSON.parse(data);
        } catch (e) {
          console.error(`[에러] JSON 파싱 실패: ${e.message}`);
          return resolve([]);
        }

        const directSample = jsonData.directSample || [];
        const tree = [];

        for (let i = 0; i < directSample.length; i++) {
          const dep = directSample[i];
          const depName = dep.package.name;
          const depVersion = dep.version;

          let dependents = [];
          if (currentDepth < depthLimit) {
            // 재귀적으로 더 깊은 dependent 가져오기
            dependents = await fetchDependents(depName, depVersion, currentDepth + 1, depthLimit);
          }

          const depObj = {
            no: i + 1,
            package: depName,
            version: depVersion
          };

          if (dependents.length > 0) {
            depObj.dep_nums = dependents.length;
            depObj.dependents = dependents;
          }

          tree.push(depObj);
        }

        resolve(tree);
      });
    }).on('error', err => {
      console.error(`[에러] ${pkg}@${version} 요청 중 오류: ${err.message}`);
      resolve([]);
    });
  });
}

// ------------------ JSON Generator ------------------

/**
 * 주어진 upstream 정보(패키지 이름과 버전)를 사용해 deps.dev API를 호출하여,
 * 해당 upstream을 사용하는 dependent(다운스트림) 정보를 가져와 문자열 배열로 반환
 *
 * @param {string} upstreamName - upstream 패키지 이름
 * @param {string} upstreamVersion - upstream 패키지 버전
 * @returns {Promise<string[]>} - 예: ["generator-fireloop@1.0.0-alpha.38", ...]
 */
async function getDownstreams(upstreamName, upstreamVersion) {
  // 어차피 필터링을 거치므로 transitive를 못봄!! 그래서 depth를 1로 주는거!!
  const tree = await fetchDependents(upstreamName, upstreamVersion, 1, 1);
  // tree는 객체 배열 형태이므로 문자열 배열로 변환
  return tree.map(item => `${item.package}@${item.version}`);
}



/**
 * 주어진 package.json 파일을 읽어, 필요한 upstream 및 id 정보를 추출하고,
 * dependent(다운스트림) 정보를 수집하여 최종 JSON 객체를 생성 후 저장한다.
 * JSON 파일명은: `${sanitizedUpstream}@${upstreamVersion}_${id}.json`
 *
 * @param {string} packageJsonPath - package.json 파일의 전체 경로 (Secbench)
 * @param {string} outputDir - JSON 파일을 저장할 디렉토리
 * @returns {Promise<void>}
 */
async function processField(pkgDir, outputDir) {
  const packageJsonPath = path.join(pkgDir, 'package.json');
  const jsonData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  
  // id: package.json에 "id" 필드가 있을 경우 사용, 없으면 빈 문자열
  const id = jsonData.id ? jsonData.id : "";

  // dependencies: ‼️package‼️.json 안의 "dependencies" 필드 중 첫 번째 항목 = upstream이 맞음!!
  let upstream = "";
  if (jsonData.dependencies && typeof jsonData.dependencies === 'object') {
    const depEntries = Object.entries(jsonData.dependencies);
    if (depEntries.length > 0) {
      const [upstreamName, upstreamVersion] = depEntries[0];
      upstream = `${upstreamName}@${upstreamVersion}`;
      
      // 최신 판단 및 dependent 수집을 위해 upstreamName과 upstreamVersion 사용
      var downstreams = await getDownstreams(upstreamName, upstreamVersion);
    }
  }
  // 만약 의존성이 없으면, upstream을 빈 문자열로 하고 downstreams 빈 배열
  if (!upstream) {
    downstreams = [];
  }
  
  // 기존 downstreams 배열 중 최신 버전인 항목만 필터링
  const downstreams_latest = downstreams.filter(npmAnalyzer.isLatestDownstream);
  
  // downstream 개수를 "downstream_count"로 표기
  const downstream_count = downstreams.length;
  const outputJSON = {
    id,
    upstream,
    keyMethod: "",
    keyExpression: "",
    downstream_count,
    downstreams,
    downstreams_latest
  };

  // keyInstanse 찾기
  const testFiles = fs.readdirSync(pkgDir).filter(f => f.endsWith('.test.js'));

  if (testFiles.length === 0) {
    console.warn(`[⚠️] ${pkgDir}에 .test.js 파일이 없음! 분석 건너뜀`);
  } else {
    if (testFiles.length > 0) {
    const testjsPath = path.join(pkgDir, testFiles[0]); // 첫 번째 파일 선택

    try {
      const extracted = extractKeyInstances(testjsPath);

      if (
        extracted &&
        extracted.calledFunctions !== 'Not Found' &&
        Array.isArray(extracted.arguments) &&
        extracted.arguments.length > 0
      ) {
        outputJSON.keyMethod = extracted.calledFunctions;

        const keyExprCandidate = extracted.arguments.find(
          (arg) =>
            typeof arg === 'string' &&
            // (arg.includes('__proto__') || arg.includes('constructor.prototype'))
            arg.includes('touch') 
        );

        if (keyExprCandidate) {
          outputJSON.keyExpression = keyExprCandidate;
        } else {
          // console.warn('[keyInstance] [❌] "__proto__" 또는 "constructor.prototype" 포함된 인자가 없음');
          console.warn('[keyInstance] [❌] "touch" 포함된 인자가 없음');
        }
      } else {
        console.warn('[keyInstance] [❌] 함수 호출 정보가 충분하지 않음');
      }
    } catch (err) {
      console.error(`[⚠️ extractKeyInstances 실패] ${testjsPath}`);
      console.error(err.message);
    }
  } else {
     console.warn(`[⚠️] ${pkgDir}에 .test.js 파일이 없음! 키 정보 없이 저장`);
  }
}


  // 파일명 생성: upstream 이름을 안전하게 변환한 후, 출력: `${sanitizedUpstream}@${upstreamVersion}_${id}.json`
  // upstream은 "upstreamName@upstreamVersion" 형식이므로, 분리해서 사용
  const [upName, upVersion] = filenameExtractor.parseStringFilename2(upstream);
  const sanitizedUpName = upName ? upName.replace(/[^a-zA-Z0-9._-]/g, '_') : "unknown";
  const outputFilename = `${sanitizedUpName}@${upVersion}_${id}.json`;
  const outputPath = path.join(outputDir, outputFilename);
  
  // 출력 폴더가 없으면 생성
  fileManager.ensureDirectoryExists(outputDir);
  fs.writeFileSync(outputPath, JSON.stringify(outputJSON, null, 2), 'utf-8');
  console.log(`[Saved] ${outputPath}`);
}

/**
 * 주어진 루트 폴더에서 직접 하위 폴더들을 순회하여, 하위 폴더에 맞는 JSON 생성
 *
 * @param {string} rootDir - 예: './prototype-pollution'
 * @param {string} outputDir - 결과 JSON 저장 위치
 */
async function generateJSONs(rootDir, outputDir) {
  const folders = fs.readdirSync(rootDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => path.join(rootDir, dirent.name));

  console.log(`[Found] ${folders.length} subfolders`);

  for (const pkgPath of folders) {
    console.log(`\n[Processing package folder] ${pkgPath}`);
    await processField(pkgPath, outputDir);
  }
}


module.exports = {
  fetchDependents,
  getDownstreams,
  processField,
  generateJSONs,
};
