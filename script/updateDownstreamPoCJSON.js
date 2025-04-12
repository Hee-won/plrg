// updateDownstreamPoCJSON.js

const fs = require('fs');
const path = require('path');
const filenameExtractor = require('./filenameExtractor');
const fileManager = require('./fileManager');
const downstreamAnalyzer = require('./downstreamAnalyzer');

/**
 * PoC 파일에서 함수 호출문 추출 (new 포함 여부 무관)
 * - 괄호 '(' 앞까지를 key로 인식
 * - 한 줄짜리 파일 기준으로 가장 긴 호출문만 유지
 *
 * @param {string} filePath - PoC 파일의 전체 경로
 * @returns {{ vulnType: string, pkgIdentifier: string, snippets: object }|null}
 */
function processPoCFile(filePath) {
  const fileName = path.basename(filePath);
  const parsed = filenameExtractor.parsePoCFilename3(fileName);
  if (!parsed) return null;

  const { vulnType, pkgName, pkgVersion } = parsed;
  const pkgIdentifier = `${pkgName}@${pkgVersion}`;
  const content = fs.readFileSync(filePath, 'utf-8').trim();

  const snippets = {};
  const statements = content.split(';').map(s => s.trim()).filter(Boolean); // 여러 호출문 처리

  for (const stmt of statements) {
    const openParenIndex = stmt.indexOf('(');
    if (openParenIndex === -1) continue;

    const key = stmt.slice(0, openParenIndex).trim();
    const snippet = stmt;

    // 중복 호출문 key → 더 짧은 snippet을 유지
    if (!snippets[key] || snippet.length < snippets[key].length) {
      snippets[key] = snippet;
    }
  }

  return {
    vulnType,
    pkgIdentifier,
    snippets
  };
}


/**
 * 지정한 취약점 타입의 폴더(예: "filter_json_${vulnType}") 내 JSON 파일들을
 * 읽어, JSON 객체의 "downstreams" 배열에 pkgIdentifier가 존재하면,
 * "PoCmethods" 필드에 PoC 파일에서 추출한 snippets를 병합하여 업데이트 후, 출력 폴더에 저장함.
 *
 * @param {string} vulnType - 취약점 종류 (예: "prototype-pollution")
 * @param {string} pkgIdentifier - "pkgName@pkgVersion" 형태
 * @param {object} snippets - { [key]: snippet } 형태의 PoC 호출문들
 * @param {string} outputDir - 업데이트된 JSON 파일을 저장할 폴더 경로
 */
function updateJSONWithPoC(vulnType, pkgIdentifier, snippets, outputDir) {
  const jsonDir = path.join(process.cwd(), `filter_json_${vulnType}`);
  const jsonFiles = fileManager.getJSONFilesInDirectory(jsonDir);
  
  jsonFiles.forEach(file => {
    const fullPath = path.join(jsonDir, file);
    const jsonData = fileManager.readJSONFile(fullPath);

    if (jsonData.downstreams && jsonData.downstreams.includes(pkgIdentifier)) {
      if (!jsonData.PoCmethods) {
        jsonData.PoCmethods = {};
      }
      if (!jsonData.PoCmethods[pkgIdentifier]) {
        jsonData.PoCmethods[pkgIdentifier] = {};
      }
      // snippetMap 병합: 동일 key면 길이 비교 후 업데이트
      for (const key in snippets) {
        if (jsonData.PoCmethods[pkgIdentifier][key]) {
          if (snippets[key].length < jsonData.PoCmethods[pkgIdentifier][key].length) {
            jsonData.PoCmethods[pkgIdentifier][key] = snippets[key];
          }
        } else {
          jsonData.PoCmethods[pkgIdentifier][key] = snippets[key];
        }
      }
      // 출력 폴더가 없으면 생성
      fileManager.ensureDirectoryExists(outputDir)

      const outPath = path.join(outputDir, file);
      fs.writeFileSync(outPath, JSON.stringify(jsonData, null, 2), 'utf-8');
      console.log(`Updated JSON saved: ${outPath}`);
    }
  });
}

/**
 * 기존 downstreams를 기준으로 latest만 추출하여 latest_downstreams 필드 추가
 *
 * @param {string} jsonDir
 * @param {string} outputDir
 */
function addLatestDownstreamsToJSON(jsonDir, outputDir) {
  const files = fileManager.getJSONFilesInDirectory(jsonDir);

  for (const file of files) {
    const fullPath = path.join(jsonDir, file);
    const jsonData = fileManager.readJSONFile(fullPath);

    const downstreams = jsonData.downstreams;
    const pocMethods = jsonData.PoCmethods || {};

    if (!Array.isArray(downstreams)) {
      console.log(`[Skip] downstreams 배열 없음: ${file}`);
      continue;
    }

    const latestDownstreams = [];

    for (const down of downstreams) {
      // PoCmethods에 해당 pkgIdentifier가 없으면 스킵
      if (!pocMethods.hasOwnProperty(down)) {
        continue;
      }

      const { name, version } = filenameExtractor.parsePkgAndVersion(down);
      const versions = downstreamAnalyzer.getAllVersions(name);
      const latest = versions[versions.length - 1];

      if (latest === version) {
        latestDownstreams.push(down);
      }
    }

    jsonData.latest_downstreams = latestDownstreams;

    fileManager.ensureDirectoryExists(outputDir);
    const outPath = path.join(outputDir, file);
    fs.writeFileSync(outPath, JSON.stringify(jsonData, null, 2), 'utf-8');
    console.log(`[✔] 최신 downstream 추가됨: ${outPath}`);
  }
}

/**
 * 지정한 PoC 폴더 내의 모든 .js 파일을 처리하고,
 * 각 PoC 파일에 대해 추출한 코드를 대응하는 JSON 파일에 업데이트함.
 *
 * @param {string} pocFolder - PoC 파일들이 위치한 폴더 경로
 * @param {string} outputJSONDir - 업데이트된 JSON 파일들을 저장할 폴더 경로
 */
function updateDownstreamJSON(pocFolder, outputJSONDir) {
  if (!fs.existsSync(pocFolder)) {
    console.error(`[Error] PoC does not exist: ${pocFolder}`);
    return;
  }
  // PoC 폴더 내의 .js 파일 목록
  const pocFiles = fs.readdirSync(pocFolder).filter(f => f.endsWith('.js'));
  
  pocFiles.forEach(file => {
    const pocFilePath = path.join(pocFolder, file);
    const pocData = processPoCFile(pocFilePath);
    if (!pocData) {
      console.error(`[Skip] 파일명 파싱 실패: ${file}`);
      return;
    }
    const { vulnType, pkgIdentifier, snippets } = pocData;
    console.log(`[INFO] Processed PoC for ${pkgIdentifier} (vuln: ${vulnType})`);
    
    // 지정한 취약점 폴더 내 JSON 업데이트
    updateJSONWithPoC(vulnType, pkgIdentifier, snippets, outputJSONDir);

    // 모든 PoC에서 PoCmethods 처리 후, 최신 downstream 추가
    addLatestDownstreamsToJSON(outputJSONDir, outputJSONDir);

  });
}

module.exports = {
  updateDownstreamJSON,
};