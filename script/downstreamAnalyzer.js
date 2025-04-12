const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, spawnSync } = require('child_process');
const filenameExtractor = require('./filenameExtractor');

// ------------------ Downstream Fetcher ------------------

/**
 * deps.dev API를 사용하여 패키지의 직접적인 dependent 패키지를 가져옴 (재귀적으로도 가능)
 *
 * @param {string} pkg - 패키지 이름 (예: '@babel/core')
 * @param {string} version - 패키지 버전 (예: '7.15.0')
 * @param {number} currentDepth - 현재 재귀 깊이 = 다운스트림 몇개나 나왔는지
 * @param {number} depthLimit - 최대 재귀 깊이 = 현재 실행중인 다운스트림이 몇번째인
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

// ------------------  npm view versions & minor version filtering ------------------

/**
 * npm view 명령어를 통해 ‼️모든 버전 리스트‼️를 가져옴
 *
 * @param {string} pkgName
 * @returns {string[]} 버전 목록
 */
function getAllVersions(pkgName) {
  try {
    const result = execSync(`npm view ${pkgName} versions --json`, { encoding: 'utf-8' });
    const versions = JSON.parse(result);
    return Array.isArray(versions) ? versions : [];
  } catch (err) {
    console.error(`[에러] ${pkgName} 버전 조회 실패: ${err.message}`);
    return [];
  }
}

/**
 * 기준 버전 이하의 ‼️compatible versions 필터링‼️
 * (major 동일 + minor는 기준 이하 + patch는 조건 만족)
 *
 * @param {string[]} versions - 전체 버전 목록
 * @param {string} baseVersion - 기준 버전 (예: '1.2.1')
 * @returns {string[]} - 필터링된 버전 목록
 */
function filterCompatibleVersions(versions, baseVersion) {
  const baseMatch = baseVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!baseMatch) return [];

  const [baseMajor, baseMinor, basePatch] = baseMatch.map(Number);

  return versions.filter(version => {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) return false;

    const [vMajor, vMinor, vPatch] = match.map(Number);

    return (
      vMajor === baseMajor &&
      (vMinor < baseMinor || (vMinor === baseMinor && vPatch <= basePatch))
    );
  });
}

// ------------------ Main Generator ------------------

/**
 * PoC 디렉토리 내 .js 파일들을 분석해 패키지 이름/버전을 추출하고,
 * 각 패키지의 dependent 정보를 deps.dev로부터 받아 JSON 파일로 저장
 *
 * @param {string} pocDir - PoC 파일들이 위치한 디렉토리
 * @param {string} outputDir - 저장할 downstream JSON 결과 디렉토리
 * @returns {Promise<void>}
 */
async function generateDownstreamJSONs(pocDir, outputDir) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const files = fs.readdirSync(pocDir);
  for (const file of files) {
    const [pkgName, pkgVersion] = filenameExtractor.parsePoCFilename2(file);
    if (!pkgName || !pkgVersion) {
      console.log(`[Skip] 파일명 파싱 실패: ${file}`);
      continue;
    }

    console.log(`\n[Processing...] ${pkgName}@${pkgVersion}`);
    const tree = await fetchDependents(pkgName, pkgVersion, 1, 1);

    const jsonObj = {
      package: pkgName,
      version: pkgVersion,
      dependents: tree,
      latest_downstreams,
      dep_nums: tree.length
    };

    const filename = pkgName.replace(/\//g, '__') + `_${pkgVersion}_dependencies.json`;
    const outputPath = path.join(outputDir, filename);
    fs.writeFileSync(outputPath, JSON.stringify(jsonObj, null, 2), 'utf-8');
    console.log(`  ✔ Saved: ${outputPath}`);
  }
}

// ------------------ Downstream Analysis Launcher ------------------

/**
 * 타겟폴더에 있는 폴더 이름을 긁어다가 패키지 이름과 버전으로 나누고 버전을 minor change 까지 긁어다 json 만들기
 *
 * @param {string} jsonDir - 기존 _dependencies.json의 이름을 가진 JSON 파일들이 들어있는 폴더 경로
 * @param {string} outputDir - 새 JSON 저장 위치 (예: './downstream_infos')
 */
function runDownstreamAll(jsonDir, outputDir = './downstream_infos') {
  if (!fs.existsSync(jsonDir)) {
    console.error(`[Error] Path does nor exists : ${jsonDir}`);
    return;
  }

  const files = fs.readdirSync(jsonDir).filter(f => f.endsWith('_dependencies.json'));

  for (const file of files) {
    const [pkgName, pkgVersion] = filenameExtractor.parseJSONFilename(file);
    if (!pkgName || !pkgVersion) {
      console.log(`[Skip] 파일명 파싱 실패: ${file}`);
      continue;
    }

    console.log(`\n[Processing] ${pkgName} - ${pkgVersion}`);
    const allVersions = getAllVersions(pkgName);
    if (!allVersions.length) continue;

    const targetVersions = filterCompatibleVersions(allVersions, pkgVersion);
    console.log(`  └─ 타겟 버전들: ${targetVersions.join(', ')}`);

    for (const v of targetVersions) {
      const outPath = path.join(outputDir, `${pkgName}_${v}_dependencies.json`);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });

      try {
        const result = fetch_dependents(root_package, root_version, 1, depth_limit)

        fs.writeFileSync(outPath, result.stdout, 'utf-8');
        console.log(`    ✔ 저장됨: ${outPath}`);
      } catch (err) {
        console.error(`    ❌ 실패: ${pkgName}@${v} - ${err.message}`);
      }
    }
  }
}

// ------------------ Export ------------------

/**
 * 외부에서 사용할 수 있도록 함수들을 export
 */
module.exports = {
  fetchDependents,           // deps.dev에서 dependent 패키지 트리 가져오기
  generateDownstreamJSONs,   // PoC 기반으로 종속 패키지 트리 저장
  getAllVersions,            // npm view로 전체 버전 조회
  filterCompatibleVersions,  // 조회된 버전 중 기준 버전 이하만 필터링
  runDownstreamAll,          // 여러 PoC의 하위 버전까지 모두 분석
};
