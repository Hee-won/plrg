const path = require('path');
const fs = require('fs');
const vm = require('vm');
const child_process = require('child_process');
process.env.TMPDIR = '/ssd/tmp';


const originalDir = process.cwd();

function mutate(seed, values, requiredValue) {
  // console.log(`[++++++] Values used for mutation:`);
  // values.forEach((v, i) => {
  //   console.log(`  [${i}] ${v}`);
  // });

  if (typeof requiredValue === 'string' && !/^['"]/.test(requiredValue)) {
    requiredValue = `'${requiredValue}'`;
  }

  const placeholderCount = [...seed].filter((c) => c === '0').length;
  if (placeholderCount === 0) return seed;

  const insertIndex = Math.floor(Math.random() * placeholderCount);
  let currentIndex = 0;
  let result = '';

  for (let i = 0; i < seed.length; i++) {
    if (seed[i] === '0') {
      if (currentIndex === insertIndex) {
        result += requiredValue;
      } else {
        let randomValue;
        //do {
          randomValue = values[Math.floor(Math.random() * values.length)];
        //} while (randomValue === requiredValue);
        result += randomValue;
      }
      currentIndex++;
    } else {
      result += seed[i];
    }
  }

  // console.log(`[RESULT] ${result}`);
  return result;
}

function verify_all_CI(package, seeds, packageDir, sanitizedName) {
  console.log(`[++++++] Verifying ${seeds.length} seeds for command injection`);

  const tempDir = path.join(originalDir, 'temp', `${sanitizedName}`,`verification-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  //seeds = ["& touch /tmp/a &',function () {},true,'http://example.com',true"]
  const verificationFilePath = path.join(tempDir, 'verify.js');
  const verificationCode = `
    const fs = require('fs');
    const path = require('path');
    const _ = require('${packageDir}');
    
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
      try {
        eval(seed);
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
    }}

    // suppress console.log from target code
    console.log = () => {};

    const seeds = ${JSON.stringify(seeds)};
    const results = [];

    seeds.forEach((seed, index) => {
      const isVulnerable = testSeed(seed, index);
      if (isVulnerable) {
        results.push({ index, seed, vulnerable: true});
        process.stdout.write("CI_RESULTS::" + JSON.stringify(results), () => process.exit(0));
        process.exit(0);
      }
    });

    process.stdout.write("CI_RESULTS::" + JSON.stringify(results));
  `;

  fs.writeFileSync(verificationFilePath, verificationCode);

  const results = [];

  try {
    const stdout = child_process.execSync(`node ${verificationFilePath}`, {
      stdio: 'pipe',
      timeout: 10000,
      maxBuffer: 100 * 1024 * 1024,
    });
    //console.log('\n\n\n[stdout]\n\n\n', stdout);
    const output = stdout.toString().trim();
    const match = output.match(/CI_RESULTS::(\[.*?\])/s);
if (match) {
  const jsonPart = match[1]; // ✅ 정확히 [ ... ] 만 추출

    //console.log('\n\n\n[output]\n\n\n', output);
    // 💡 JSON 추출: 가장 먼저 나오는 [부터 마지막 ]까지
    // const startIdx = output.indexOf('CI_RESULTS:: [');
    // const endIdx = output.lastIndexOf(']');
    // let jsonPart = '';

    // if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    //  jsonPart = output.substring(startIdx, endIdx + 1);
      const stdoutResults = JSON.parse(jsonPart);

      //console.log('\n\n\n[stdoutResults]\n\n\n', stdoutResults);
      for (const result of stdoutResults) {
        if (!results.some((r) => r.index === result.index)) {
          results.push(result);
        }
      }

      if (results.length === 0) {
        console.log('[++++++] No PoC triggered');
      } else {
        console.log(`[++++++] ${results.length} PoC(s) triggered`);
      }

    }     else {
      console.warn('[xxxxx] JSON block not found in output');
    }

  } catch (error) {
    console.error('[xxxxx] Verification execution error:', error.message);
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error('[xxxxx] Error cleaning up temp directory:', e);
    }
  }

  return results;
}



/////////////////////////////////////////////////////////////////////////////

function generate_mutations(seeds, timeout, values, requiredValue) {
  const startTime = Date.now();
  const mutatedSeeds = new Set(); // Use Set directly to avoid duplicates

  console.log(
    `[++++++] Generating mutations for ${seeds.length} seeds with ${timeout}ms timeout...`
  );
  // console.log(`[++++++] Showing sample seed[0]:`, seeds[0]);

  while (Date.now() - startTime < timeout) {
    for (const seed of seeds) {
      mutatedSeeds.add(mutate(seed, values, requiredValue));
    }
  }

  const mutatedArray = Array.from(mutatedSeeds);

  console.log(`[++++++] Generated ${mutatedSeeds.size} unique mutations`);
  console.log(`[++++++] Showing sample mutatedSeeds[0]:`, mutatedArray[0]);
  console.log(`[++++++] Showing sample mutatedSeeds[100]:`, mutatedArray[100]);
  console.log(`[++++++] Showing sample mutatedSeeds[200]:`, mutatedArray[200]);
  console.log(`[++++++] Showing sample mutatedSeeds[300]:`, mutatedArray[300]);
  console.log(`[++++++] Showing sample mutatedSeeds[400]:`, mutatedArray[400]);
  console.log(`[++++++] Showing sample mutatedSeeds[500]:`, mutatedArray[500]);

  return [...mutatedSeeds]; // Convert Set back to array
}

function PoCgenerator(
  package,
  timeout,
  vulnType,
  packageDir,
  version,
  keyexpression
) {

  console.log('Calling PoCgenerator with:', {
  package,
  timeout,
  vulnType,
  packageDir,
  version,
  keyexpression
  });

  // Create a sanitized filename
  const sanitizedName = package.replace(/[^a-zA-Z0-9._-]/g, '_');
  const seedPath = path.join(
    __dirname,
    'seed_CI',
    `${sanitizedName}@${version}_seed.json`
  );
  console.log(`[++++++] PoCgenerator seedPath : ${seedPath}`);

  if (!fs.existsSync(seedPath)) {
    console.error(`[xxxxx] ❌ Seed file not found for ${package}: ${seedPath}`);
    return;
  }

  const seeds = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  let values = [
    '1',
    '-1',
    '42',
    'true',
    'false',
    'null',
    'undefined',
    '{}',
    '[]',
    '() => {}',
    'function () {}',
    'new Error()',
    `'string'`,
    `Symbol('sym')`,
    'new Date()',
    `'http://example.com'`,
  ];
  // Add keyexpression to values
  console.log('[DEBUG] typeof keyexpression:', typeof keyexpression);
  if (typeof keyexpression === 'string') {
    for (let i = 0; i < 3; i++) {
      values.push(`'${keyexpression}'`);
    }
    console.log(`keyexpression is string`);
  } else if (keyexpression !== undefined) {
    for (let i = 0; i < 3; i++) {
      values.push(`${keyexpression}`);
    }
  }
  const startTime = Date.now();
  const outputDirPath = path.join(originalDir, 'PoC');
  if (!fs.existsSync(outputDirPath)) {
    fs.mkdirSync(outputDirPath, { recursive: true });
  }

  // Generate mutations
  console.log(`keyexpression: ${keyexpression}`);

  console.log(`[SEED] Original seed count: ${seeds.length}`);
  console.log(`[SEED] Timeout: ${timeout}ms`);

  const mutatedSeeds = generate_mutations(
    seeds,
    timeout / 5,
    values,
    keyexpression
  );

  // Verify all seeds at once
  let vulnerableSeeds = [];
  // if (vulnType === 'prototype-pollution') {
  //  vulnerableSeeds = verify_all_PP(package, mutatedSeeds, packageDir);
  // } 
  // else 
  if (vulnType === 'command-injection') {
     vulnerableSeeds = verify_all_CI(package, mutatedSeeds, packageDir, sanitizedName);
  }
  console.log(`[SEED] vulnerableSeeds count: ${vulnerableSeeds.length}`);
  // Save all vulnerable seeds as PoCs
  if (vulnerableSeeds.length > 0) {
    console.log(
      `[========================] 🔥🔥🔥 Found ${vulnerableSeeds.length} vulnerable seeds`
    );
    vulnerableSeeds.forEach((result, i) => {  
    
    const filename = `${sanitizedName}_${i}_PoC.js`;
      fs.writeFileSync(
        path.join(outputDirPath, filename),
        result.seed
      );
    });
  } else {
    console.log(`[++++++] No vulnerable seeds found`);
  }
}

module.exports = { PoCgenerator };