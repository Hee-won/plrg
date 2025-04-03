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
// const nestedValues = [ { a: { b: 1 } },[1, [2, 3]], { x: 1, y: true },Object.create({ polluted: 123 })]; 밑에서도 사용해줘야함

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
      // randomness 개선해야할수도
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
              arguments: [ { type: 'Literal', value: 'lodash' } ] // 이거 value도 downstream이름 파싱한거 넣어줘야..
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


// 🧪 실행 및 결과 검증
function validatePoC(filePath) {
    // prototype pollution 검증어려움..ㅠ @성민님

    // 🔍 Command Injection 확인
    if (fs.existsSync("a")) {
      console.log(`🔥 [${filePath}] - Command Injection 확인됨 (파일 생성됨)`);
      fs.unlinkSync("a"); // 삭제
      return;
    } else {
    console.log(`💥 [${filePath}] - Command Injection 실패!`);
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

const pkg = require("lodash"); // 추후 downstream에서 파싱해오기 (@,/,버전 등 주의)
const funcName = "set"; // 추후 cg에서 파싱해오기
const argCount = pkg[funcName].length;
console.log(argCount)

// ▶️ 실행 예시 (downstream 함수, 인자 .length개, 10개-임의-의 조합 테스트)
runPoCMutationAndTest(funcName, argCount, 10);
