// verify_CI.js
const fs = require('fs');
const path = require('path');

const packageDir = process.argv[2]; // 검증 대상 패키지 디렉터리 경로
const seed = process.argv[3];       // 검증할 seed 문자열 (명령줄 인자로 전달)
const index = Number(process.argv[4]);

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

function testSeed(seed, index) {
  if (fs.existsSync('/tmp/a')) {
    try { fs.unlinkSync('/tmp/a'); } catch (e) {}
  }
  const uniqueDir = path.join(process.cwd(), 'candidate-' + index);
  if (fs.existsSync(uniqueDir)) {
    fs.rmSync(uniqueDir, { recursive: true, force: true });
  }
  fs.mkdirSync(uniqueDir);
  process.chdir(uniqueDir);

  const evalCode = `
      const _ = require('${packageDir}');
      ${seed};
    `;

  try {
    eval(evalCode);
    sleepSync(100);  // 동기 대기 (필요하다면 제거 가능)
    if (fs.existsSync('/tmp/a')) {
      fs.writeFileSync(path.join(process.cwd(), 'success-' + index), 'vulnerable');
      fs.unlinkSync('/tmp/a');
      return true;
    }
    return false;
  } catch (e) {
    return false;
  } finally {
    process.chdir('..');
    try {
      fs.rmSync(uniqueDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

const vulnerable = testSeed(seed, index);
console.log(JSON.stringify({ index, vulnerable, seed }));
process.exit(0);
