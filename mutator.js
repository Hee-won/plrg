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

// verify prototype-pollution
function verify_PoC_PP(package, seed) {
  const PoC = `
    const a = { ...Object.prototype };
    const ${package} = require('${package}');
    ${seed};
    console.log(!(JSON.stringify(a) === JSON.stringify(Object.prototype)));
  `;
  console.log(`[++++++] Executing PP PoC in: ${process.cwd()}`);
  console.log(`[++++++] PoC code:\n${PoC}`);

  try {
    const stdout = execSync(`node -e "${PoC}"`, {
      stdio: 'pipe',
    });
    return stdout.toString().trim() === 'true';
  } catch (error) {
    return false;
  }
}

// verify command-injection
function verify_PoC_CI(package, seed) {
  const PoC = `
    const _ = require('${package}');
    ${seed};
  `;
  try {
    execSync(`node -e "${PoC}"`, {
      stdio: 'pipe',
    });
    const fileExists = fs.existsSync('a');
    if (fileExists) {
      fs.rmSync('a');
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

function mutate_verify(package, seed, timeout, values, vulnType) {
  const startTime = Date.now();
  let i = 0;
  while (Date.now() - startTime < timeout) {
    i++;
    const mutatedSeed = mutate(seed, values);

    if (vulnType == 'command-injection') {
      const isVulnerable_CI = verify_PoC_CI(package, mutatedSeed);
      if (isVulnerable_CI) {
        fs.writeFileSync(
          path.join(originalDir, 'PoC', `${package}_PoC_${i}.js`),
          mutatedSeed
        );
        return;
      }
    }

    if (vulnType == 'prototype-pollution') {
      const isVulnerable_PP = verify_PoC_PP(package, mutatedSeed);
      if (isVulnerable_PP) {
        fs.writeFileSync(
          path.join(originalDir, 'PoC', `${package}_PoC_${i}.js`),
          mutatedSeed
        );
        return;
      }
    }
  }
}

function PoCgenerator(package, timeout, keyexpression, vulnType) {
  // Create a sanitized filename (remove special characters)
  const sanitizedName = package.replace(/[^a-zA-Z0-9._-]/g, '_');

  const seedPath = path.join(__dirname, 'seed-3', `${sanitizedName}_seed.json`);
  console.log(`[++++++] PoCgenerator seedPath : ${seedPath}`);
  const seeds = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const values = [
    '1',
    '-1',
    '42', // Numeric values
    'true',
    'false', // Boolean values
    'null', // Null value
    'undefined', // Undefined value
    '{}', // Empty object
    '[]', // Empty array
    '() => {}', // Empty function
    'function () {}', // Anonymous function
    'new Error()', // Error object
    `'string'`, // String value
    `Symbol('sym')`, // Symbol value
    'new Date()', // Date object
    `'http://example.com'`, // URL string
  ];
  const outputDirPath = path.join(originalDir, 'PoC');
  if (!fs.existsSync(outputDirPath)) {
    fs.mkdirSync(outputDirPath, { recursive: true });
  }

  // const keyexpression todo
  const valuesLength = values.length;
  for (let i = 0; i < valuesLength; i++) {
    if (typeof keyexpression === 'string') {
      values.push(`'${keyexpression}'`);
    } else {
      values.push(`${keyexpression}`);
    }
  }

  seeds.forEach((seed) => {
    mutate_verify(package, seed, timeout, values, vulnType);
  });
}

module.exports = {
  PoCgenerator,
};
