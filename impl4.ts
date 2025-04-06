// ✅ PoC 후보 AST 생성기 및 실행/검증 지원
const fs = require('fs');
const path = require('path');
// npm install 해줘야
const astring = require('astring');
const { execSync } = require('child_process');
const { analyzeModule } = require('./getOwnPropertyTree');


// 🎯 사용 가능한 값들 정의
// stringValues 내용 /home/heewon/plrg/keyExpression/unique_itemscommand-injection_a.json에서 불러오기
// keyExpression Mutator 업데이트 @성민님
let stringValues = ["__proto__.polluted", "yes", "touch a", "& touch a &", "; touch a"];
try {
  stringValues = JSON.parse(
    fs.readFileSync('/home/heewon/plrg/keyExpression/unique_itemscommand-injection_a.json', 'utf-8')
  );
} catch (e) {
  console.error("❌ stringValues JSON 파일 로딩 실패:", e.message);
  process.exit(1);
}
const numberValues = [0];
const booleanValues = [true, false];
const nullValues = [null];
const undefinedValues = [undefined];
const objectValues = [{}];
const arrayValues = [[]];
const functionValues = [() => {}];

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
    ...booleanValues,
    ...nullValues,
    ...undefinedValues,
    ...objectValues,
    ...arrayValues,
    ...functionValues,
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
// code2AST
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
// [ast2code] const pkg = require(""); 만들기
function writeSinglePoCFile(pkgName, funcName, args, index, outputDir) {
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
              arguments: [ { type: 'Literal', value: pkgName } ] // 이거 value도 downstream이름 파싱한거 넣어줘야..
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
  // 파일도 끝나면 지워야됨. poc 터진건 남기고 싶은데 되려나. 안되면 console.log로 남겨둬..
  const filename = path.join(outputDir, `generated-poc${index + 1}.js`);
  fs.writeFileSync(filename, code, 'utf-8');
  return filename;
}


// 🧪 실행 및 결과 검증
function validatePoC(filePath) {
  try {
    // ✅ PoC 파일 실제 실행
    execSync(`node ${filePath}`, { stdio: 'ignore' }); // 또는 'inherit' 으로 로그 보기

    // 🔍 Command Injection 확인
    if (fs.existsSync("a")) {
      console.log(`🔥 [${filePath}] - Command Injection 확인됨 (파일 생성됨)`);
    } else {
      console.log(`💥 [${filePath}] - Command Injection 실패!`);
      fs.unlinkSync(filePath); // 실패한 PoC 파일 삭제
    }
  } catch (err) {
    console.warn(`⚠️ [${filePath}] 실행 중 예외 발생: ${err.message}`);
    fs.unlinkSync(filePath); // 실패한 PoC 삭제
  }
}

// 🚀 전체 흐름: PoC 생성 + 저장 + 실행 + 검증
function runPoCMutationAndTest(pkgName, argCount, limit = 10, outputDir = __dirname) {
  const argCombos = generateArgCombinations(argCount, limit);
  for (let i = 0; i < argCombos.length; i++) {
    // parents-children 하나씩 가져오기
    const family_result = analyzeModule(pkgName, 3);  // module name, depth
    if (family_result.length === 0) {
      console.warn(`⚠️ 분석된 함수 없음: ${pkgName}`);
      continue;
    }
    for (let j = 0; j < family_result.length; j++) {
      const funcName = family_result[j];
      const filePath = writeSinglePoCFile(pkgName, funcName, argCombos[i], i, outputDir);
      validatePoC(filePath);
    }
  }
}


/**
 * 📦 패키지이름@버전 → 이름, 버전 분리
 */
function parsePkgAndVersion(pkgWithVersion: string): { name: string; version: string } {
  const atIndex = pkgWithVersion.lastIndexOf('@');

  // 🔸 예외 처리: '@'가 없으면 잘못된 입력
  if (atIndex <= 0) {
    throw new Error(`Invalid format: ${pkgWithVersion}`);
  }

  const name = pkgWithVersion.slice(0, atIndex);     // 패키지 이름 (@scope 포함 가능)
  const version = pkgWithVersion.slice(atIndex + 1); // 버전만 추출

  return { name, version };
}

// 📦 CLI 실행부
if (require.main === module) {
  const inputDir = process.argv[2];
  if (!inputDir) {
    console.error('❗ Usage: node impl4.ts <json-folder-path> 아 ts -> js 해야됨');
    process.exit(1);
  }
  const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.json'));

  // upstream json 읽어오기
  for (const jsonFile of files) {
    const fullPath = path.join(inputDir, jsonFile);
    const vulnData = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    const downstreams = vulnData.downstreams || [];

    for (const downstream of downstreams) {
      const { name: downpkgname, version: downpkgversion } = parsePkgAndVersion(downstream);
      const pkg = downpkgname;
      const argCount = 5;
      const tempDir = path.join(__dirname, 'temp_downstreams', pkg.replace(/\W/g, '_'));

      try {
        // ✅ temp 디렉터리 생성
        fs.mkdirSync(tempDir, { recursive: true });

      console.log("📦 해당 downstream 패키지:", downstream);

      // ✅ 취약한 다운스트림 패키지 설치
      execSync(`npm install ${downstream} --prefix ${tempDir}`, {
          stdio: 'inherit'
        });

      // ✅ PoC 실행
      // 패키지 이름, 걍 일단 5개 냅다 집어넣기, 10개-임의-의 조합 테스트
      runPoCMutationAndTest(downpkgname, argCount, 10);
      } 
      catch (e) {
        console.error("❌ npm install 또는 실행 실패:", e.message);
      } finally {
        // ✅ 항상 디렉터리 삭제
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
          console.log(`🧹 ${tempDir} 삭제 완료`);
        } catch (cleanupErr) {
          console.warn(`⚠️ ${tempDir} 삭제 실패:`, cleanupErr.message);
        }

      }
    }

  }
}
