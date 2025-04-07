// 로컬 설치된 npm 패키지들 대상으로 뽑아진 seed와 tree를 이용해 mutation 돌리기
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

const originalDir = process.cwd();

function mutate(seed, values) {
  let result = '';
  for (let i = 0; i < seed.length; i++) {
    if (seed[i] === '0') {
      const randomValue = values[Math.floor(Math.random() * values.length)];
      result += randomValue;
    } else {
      result += seed[i];
    }
  }
  return result;
}

// Single verification for prototype pollution
function verify_all_PP(package, seeds, packageDir) {
  console.log(
    `[++++++] Verifying ${seeds.length} seeds for prototype pollution`
  );

  let verificationCode = `
    const _ = require('${packageDir}');
    
    function testSeed(seed) {
      const a = { ...Object.prototype };
      try {
        eval(seed);
        return !(JSON.stringify(a) === JSON.stringify(Object.prototype));
      } catch (e) {
        return false;
      }
    }
    
    const seeds = ${JSON.stringify(seeds)};
    const results = [];
    
    seeds.forEach((seed, index) => {
      const isVulnerable = testSeed(seed);
      if (isVulnerable) {
        results.push({ index, seed, vulnerable: true });
      }
    });
    
    console.log(JSON.stringify(results));
  `;

  try {
    const startime = Date.now();
    const stdout = execSync(
      `node -e "${verificationCode.replace(/"/g, '\\"')}"`,
      {
        stdio: 'pipe',
        timeout: 30000, // 30 second timeout for all seeds
        maxBuffer: 100 * 1024 * 1024, // Increase buffer size to 100MB
      }
    );
    const endtime = Date.now();
    const duration = endtime - startime
    console.log(
    `[++++++] Verifying mutations with ${duration}ms ...`
    );
    const output = stdout.toString().trim();
    if (output) {
      try {
        return JSON.parse(output);
      } catch (e) {
        console.error('Failed to parse output:', e);
        return [];
      }
    }
  } catch (error) {
    console.error('Verification execution error:', error.message);
  }

  return [];
}

// Single verification for command injection
function verify_all_CI(package, seeds, packageDir) {
  console.log(`[++++++] Verifying ${seeds.length} seeds for command injection`);

  // Create a temp directory for this verification
  const tempDir = path.join(originalDir, 'temp', `verification-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  let verificationCode = `
    const fs = require('fs');
    const path = require('path');
    const _ = require('${packageDir}');
    
    function testSeed(seed, index) {
      try {
        eval(seed);
        // Check if 'a' file was created in this directory
        if (fs.existsSync('a')) {
          fs.writeFileSync(path.join(process.cwd(), 'success-' + index), 'vulnerable');
          fs.unlinkSync('a');
          return true;
        }
        return false;
      } catch (e) {
        return false;
      }
    }
    
    const seeds = ${JSON.stringify(seeds)};
    const results = [];
    
    seeds.forEach((seed, index) => {
      const isVulnerable = testSeed(seed, index);
      if (isVulnerable) {
        results.push({ index, seed, vulnerable: true });
      }
    });
    
    console.log(JSON.stringify(results));
  `;

  const results = [];

  try {
    process.chdir(tempDir);

    const stdout = execSync(
      `node -e "${verificationCode.replace(/"/g, '\\"')}"`,
      {
        stdio: 'pipe',
        timeout: 30000, // 30 second timeout for all seeds
        maxBuffer: 100 * 1024 * 1024, // Increase buffer size to 100MB
      }
    );

    // Check for success-* files
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      if (file.startsWith('success-')) {
        const index = parseInt(file.split('-')[1]);
        results.push({
          index,
          seed: seeds[index],
          vulnerable: true,
        });
      }
    }

    // Process stdout
    const output = stdout.toString().trim();
    if (output) {
      try {
        const stdoutResults = JSON.parse(output);
        // Combine with file-based results, avoiding duplicates
        for (const result of stdoutResults) {
          if (!results.some((r) => r.index === result.index)) {
            results.push(result);
          }
        }
      } catch (e) {
        console.error('Failed to parse output:', e);
      }
    }
  } catch (error) {
    console.error('Verification execution error:', error.message);
  } finally {
    process.chdir(originalDir);
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error('Error cleaning up temp directory:', e);
    }
  }

  return results;
}

function generate_mutations(seeds, timeout, values) {
  const startTime = Date.now();
  const mutatedSeeds = new Set(); // Use Set directly to avoid duplicates

  console.log(
    `[++++++] Generating mutations for ${seeds.length} seeds with ${timeout}ms timeout...`
  );

  while (Date.now() - startTime < timeout) {
    for (const seed of seeds) {
      mutatedSeeds.add(mutate(seed, values));
    }
  }

  console.log(`[++++++] Generated ${mutatedSeeds.size} unique mutations`);
  return [...mutatedSeeds]; // Convert Set back to array
}

function PoCgenerator(package, timeout, keyexpression, vulnType, packageDir) {
  // Create a sanitized filename
  const sanitizedName = package.replace(/[^a-zA-Z0-9._-]/g, '_');
  const seedPath = path.join(__dirname, 'seed-3', `${sanitizedName}_seed.json`);
  console.log(`[++++++] PoCgenerator seedPath : ${seedPath}`);

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
  if (typeof keyexpression === 'string') {
    values.push(`'${keyexpression}'`);
  } else if (keyexpression !== undefined) {
    values.push(`${keyexpression}`);
  }

  const outputDirPath = path.join(originalDir, 'PoC');
  if (!fs.existsSync(outputDirPath)) {
    fs.mkdirSync(outputDirPath, { recursive: true });
  }

  // Generate mutations
  const mutatedSeeds = generate_mutations(seeds, timeout / 2, values);

  // Verify all seeds at once
  let vulnerableSeeds = [];
  if (vulnType === 'prototype-pollution') {
    vulnerableSeeds = verify_all_PP(package, mutatedSeeds);
  } else if (vulnType === 'command-injection') {
    vulnerableSeeds = verify_all_CI(package, mutatedSeeds);
  }

  // Save all vulnerable seeds as PoCs
  if (vulnerableSeeds.length > 0) {
    console.log(`[++++++] Found ${vulnerableSeeds.length} vulnerable seeds`);
    vulnerableSeeds.forEach((result, i) => {
      fs.writeFileSync(
        path.join(outputDirPath, `${package}_PoC_${i}.js`),
        result.seed
      );
    });
  } else {
    console.log(`[++++++] No vulnerable seeds found`);
  }
}

module.exports = {
  PoCgenerator,
};
