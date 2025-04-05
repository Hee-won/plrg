// getOwnPropertyTree.js
const fs = require('fs');
const path = require('path');
const helper = require('./helper.js'); // helper.js 사용

// ✅ 내부: 들여쓰기 기반 트리 출력
function exploreProps(obj, depth, prefix = '', visited = new WeakSet(), output = []) {
  if (depth < 0 || obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
    return;
  }

  if (visited.has(obj)) return;
  visited.add(obj);

  let props;
  try {
    props = Object.getOwnPropertyNames(obj);
  } catch (e) {
    return;
  }

  for (const key of props) {
    let val;
    try {
      val = obj[key];
    } catch (e) {
      output.push(`${prefix}${key} (접근 실패: ${e.message})`);
      continue;
    }

    let info = '';
    if (helper.$assert.isCallable(val)) info += ' [callable]';
    if (helper.$assert.isConstructable(val)) info += ' [constructable]';
    if (info) {
      output.push(`${prefix}${key}${info}`);
    }

    exploreProps(val, depth - 1, prefix + '    ', visited, output); // 4칸 들여쓰기
  }
}

// ✅ 내부: 트리 문자열에서 경로 추출
function extractPathsFromTree(treeString) {
  const lines = treeString.trim().split('\n');
  const result = [];
  const pathStack = [];

  for (const line of lines) {
    const match = line.match(/^(\s*)([^\[]+)/);
    if (!match) continue;

    const indent = match[1].length;
    const key = match[2].trim();
    const depth = indent / 4;

    pathStack[depth] = key;
    pathStack.length = depth + 1;

    const fullPath = pathStack.slice(0, depth + 1).join('.');
    result.push(fullPath);
  }

  return result;
}

// ✅ 외부에서 사용할 함수
function analyzeModule(moduleName, depth = 3, saveOutput = false) {
  let targetModule;
  try {
    targetModule = require(moduleName);
  } catch (err) {
    console.warn(`⚠️ 모듈 '${moduleName}'을 불러오는 데 실패했습니다: ${err.message}`);
    return [];  // 호출자 쪽에서 length === 0으로 판단하고 넘어가도록
  }

  const outputLines = [];
  exploreProps(targetModule, depth, '', new WeakSet(), outputLines);

  const treeOutput = outputLines.join('\n');
  const outputFileName = `${moduleName}_getOwnPropertyNames.txt`;

  if (saveOutput) {
    fs.writeFileSync(outputFileName, treeOutput, 'utf-8');
    console.log(`✅ 트리 구조 결과가 '${outputFileName}'에 저장되었습니다!`);
  }

  const parents_children = extractPathsFromTree(treeOutput);
  return parents_children;
}

module.exports = { analyzeModule };
