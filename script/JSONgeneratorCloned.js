// 반드시 keyInstance 확인하고 클론할
const fs = require('fs');
const path = require('path');
const filenameExtractor = require('./filenameExtractor');
const JSONgenerator = require('./JSONgenerator');
const semver = require('semver');
const npmAnalyzer = require('./npmAnalyzer');


/**
 * 특정 패키지 버전 조합으로 새로운 JSON 저장
 * @param {object} baseJson - 기존 JSON 객체
 * @param {string} pkgName
 * @param {string} version
 * @param {string} id
 */
async function cloneJsonWithVersion(baseJson, pkgName, version, id, outputDir, index) {
  const upstream = `${pkgName}@${version}`;
  console.log(`\n${index}번째 실행 [PROCESS] ${pkgName}@${version} 생성 중...`);
  const outputFilename = `${pkgName.replace(/[^a-zA-Z0-9._-]/g, '_')}@${version}_${id}.json`;
  const outputPath = path.join(outputDir, outputFilename);

  if (fs.existsSync(outputPath)) {
    console.log(`[SKIP] ${outputFilename} 이미 존재함`);
    return;
  }

  const downstreams = (await JSONgenerator.fetchDependents(pkgName, version, 1, 1))
    .map(dep => `${dep.package}@${dep.version}`);

    if (downstreams.length === 0) {
    console.log(`[SKIP] ${pkgName}@${version} → downstream이 없어 JSON 생성하지 않음`);
    return;
  }

  const downstreamsLatest = downstreams.filter(npmAnalyzer.isLatestDownstream);

  const newJson = {
    id: baseJson.id,
    upstream,
    keyMethod: baseJson.keyMethod || '',
    keyExpression: baseJson.keyExpression || '',
    downstreamCount: downstreams.length,
    downstreams,
    downstreamsLatest
  };

  fs.writeFileSync(outputPath, JSON.stringify(newJson, null, 2), 'utf-8');
  console.log(`[✔] 저장됨: ${outputPath}`);
}

/**
 * 기존 json-output 폴더의 파일들을 기준으로 하위 버전 복제 생성
 *  * @param {inputDir} 
 *  * @param {outputDir}
 */
async function cloneOlderUpstreams(inputDir, outputDir) {
  const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const fullPath = path.join(inputDir, file);
    const json = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    const [pkgName, baseVersion] = filenameExtractor.parseStringFilename2(json.upstream);
    const id = json.id || 'noid';

    if (!pkgName || !baseVersion) {
      console.warn(`[무시] upstream 파싱 실패: ${json.upstream}`);
      continue;
    }

    const allVersions = npmAnalyzer.getAllVersions(pkgName);
    const olderVersions = npmAnalyzer.filterCompatibleVersions(allVersions, baseVersion);
    
    let i = 1;
    for (const v of olderVersions) {
      if (v === baseVersion) continue; // 자기 자신은 skip
      await cloneJsonWithVersion(json, pkgName, v, id, outputDir, i++);
    }
  }
}

module.exports = {
  cloneOlderUpstreams,
};

