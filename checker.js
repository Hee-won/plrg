const fs = require('fs');
const path = require('path');
const { c } = require('tar');

// Step 1: alias 또는 직접 함수 추출
function findAliasAndDirectFunctions(jsCode, upstreamName) {
  // const aliases = new Set();
  // const directFunctions = new Set();

  // // require: const alias = require('module');
  // const requireRegex = new RegExp(
  //   `(?:const|let|var)\\s+(\\w+)\\s*=\\s*require\\s*\\(\\s*['"]${upstreamName}['"]\\s*\\)`,
  //   'g'
  // );
  // let match;
  // while ((match = requireRegex.exec(jsCode)) !== null) {
  //   aliases.add(match[1]);
  // }

  // // import alias from 'module';
  // const importDefaultRegex = new RegExp(
  //   `import\\s+(\\w+)\\s+from\\s+['"]${upstreamName}['"]`,
  //   'g'
  // );
  // while ((match = importDefaultRegex.exec(jsCode)) !== null) {
  //   aliases.add(match[1]);
  // }

  // // import * as alias from 'module';
  // const importAllRegex = new RegExp(
  //   `import\\s+\\*\\s+as\\s+(\\w+)\\s+from\\s+['"]${upstreamName}['"]`,
  //   'g'
  // );
  // while ((match = importAllRegex.exec(jsCode)) !== null) {
  //   aliases.add(match[1]);
  // }

  // // import { func } from 'module'
  // const importNamedRegex = new RegExp(
  //   `import\\s+\\{([^}]+)\\}\\s+from\\s+['"]${upstreamName}['"]`,
  //   'g'
  // );
  // while ((match = importNamedRegex.exec(jsCode)) !== null) {
  //   const functions = match[1].split(',').map((f) => f.trim().split(' as ')[0]);
  //   functions.forEach((f) => directFunctions.add(f));
  // }

  // const hasDynamicThenImport = new RegExp(
  //   `import\\(['"]${upstreamName}['"]\\)\\s*\\.then`
  // ).test(jsCode);
  // const hasAwaitImport = new RegExp(
  //   `await\\s+import\\(['"]${upstreamName}['"]\\)`
  // ).test(jsCode);

  // Check if the upstream string exists anywhere in the code
  const hasUpstreamStringAnywhere = jsCode.includes(upstreamName);
  return {
    hasUpstreamStringAnywhere,
  };
}

// Step 2: 함수 호출 찾기
function findFunctionCall(jsCode, targetFunction, hasUpstreamStringAnywhere) {
  const results = [];

  // alias.func() or alias()
  // aliases.forEach((alias) => {
  //   if (targetFunction === '#main') {
  //     const regex = new RegExp(`${alias}\\s*\\(`);
  //     if (regex.test(jsCode))
  //       results.push({ type: 'alias-call', alias, call: `${alias}(...)` });
  //   } else {
  //     const regex = new RegExp(`${alias}\\.${targetFunction}\\s*\\(`);
  //     if (regex.test(jsCode))
  //       results.push({
  //         type: 'alias-method',
  //         alias,
  //         call: `${alias}.${targetFunction}(...)`,
  //       });
  //   }
  // });

  // // direct import: compile()
  // if (targetFunction !== '#main' && directFns.includes(targetFunction)) {
  //   const regex = new RegExp(`\\b${targetFunction}\\s*\\(`);
  //   if (regex.test(jsCode))
  //     results.push({ type: 'direct-import', call: `${targetFunction}(...)` });
  // }

  // // dynamic import().then(...)
  // if (hasThen && targetFunction !== '#main') {
  //   const regex = new RegExp(
  //     `import\\(['"]${upstreamName}['"]\\)\\s*\\.then\\s*\\(.*?=>.*?\\.${targetFunction}\\s*\\(`,
  //     's'
  //   );
  //   if (regex.test(jsCode)) {
  //     results.push({
  //       type: 'dynamic-then-import',
  //       call: `import(...).then(... => mod.${targetFunction}(...))`,
  //     });
  //   }
  // }

  // // await import().then(...): mod.compile()
  // if (hasAwait && targetFunction !== '#main') {
  //   const regex = new RegExp(
  //     `await\\s+import\\(['"]${upstreamName}['"]\\).*?\\.${targetFunction}\\s*\\(`,
  //     's'
  //   );
  //   if (regex.test(jsCode)) {
  //     results.push({
  //       type: 'dynamic-await-import',
  //       call: `await import(...).mod.${targetFunction}(...)`,
  //     });
  //   }
  // }

  const haskeymethod = jsCode.includes(targetFunction);
  if (
    (haskeymethod || targetFunction === '#main') &&
    hasUpstreamStringAnywhere
  ) {
    results.push({
      type: 'keymethod',
      call: `${targetFunction}(...)`,
    });
  }

  return results;
}

// Step 3: 파일 분석
function analyzeFile(filePath, upstreamName, functionName) {
  const jsCode = fs.readFileSync(filePath, 'utf-8');
  const { hasUpstreamStringAnywhere } = findAliasAndDirectFunctions(
    jsCode,
    upstreamName
  );

  const calls = findFunctionCall(
    jsCode,
    functionName,
    hasUpstreamStringAnywhere,
    upstreamName
  );

  return calls;
}

function getAllJsFiles(dir) {
  const files = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // 재귀 탐색
      files.push(...getAllJsFiles(fullPath));
    } else if (
      entry.isFile() &&
      fullPath.endsWith('.js') && // ✅ .js 파일만
      path.basename(fullPath) !== 'package.json' // ✅ package.json 제외
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

// Step 4: 디렉토리 내 모든 JS 파일 분석
function analyzeDirectory(dirPath, upstreamName, functionName) {
  const results = [];

  const files = getAllJsFiles(dirPath); // 🔄 수정된 재귀 + 필터링 함수 사용
  files.forEach((file) => {
    const calls = analyzeFile(file, upstreamName, functionName);
    if (calls.length > 0) {
      results.push({ file, calls });
    }
  });

  if (results.length === 0) {
    return false;
  } else {
    console.log(
      `[✓] Found matches for "${functionName}" from "${upstreamName}":`
    );
    return results.map((r) => ({
      file: r.file,
      calls: r.calls.map((c) => ({
        type: c.type,
        call: c.call,
      })),
    }));
  }
}

// // CLI 실행
// const [, , targetPath, upstreamName, funcName] = process.argv;
// if (!targetPath || !upstreamName || !funcName) {
//   console.log(
//     'Usage: node checker.js <fileOrDir> <upstream> <functionName>\n #main은 반드시 "#main"으로 인자주기'
//   );
//   process.exit(1);
// }

// const stat = fs.statSync(targetPath);
// if (stat.isDirectory()) {
//   analyzeDirectory(targetPath, upstreamName, funcName);
// } else {
//   const calls = analyzeFile(targetPath, upstreamName, funcName);
//   if (calls.length === 0) {
//     console.log(
//       `[!] No calls to ${upstreamName}'s function "${funcName}" found.`
//     );
//   } else {
//     console.log(`[✓] Found calls to "${funcName}" in "${upstreamName}":`);
//     calls.forEach((c) => {
//       console.log(`    → (${c.type}) ${c.call}`);
//     });
//   }
// }
module.exports = {
  analyzeDirectory,
  analyzeFile,
  findAliasAndDirectFunctions,
  findFunctionCall,
  getAllJsFiles,
};
