const { execSync } = require('child_process');
const { readFileSync } = require('fs');


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
  try {
    const stdout = execSync(`node -e "${PoC}"`, {
      stdio: 'pipe',
    });
    return stdout.toString().trim() === 'true';
  } catch (error) {return false;}
}

// verify command-injection
function verify_PoC_CI(package, seed) {
  const PoC = `
    const ${package} = require('${package}');
    ${seed};
  `;
  try {
    const stdout = execSync(`node -e "${PoC}"`, {
      stdio: 'pipe',
    });
    const fileExists = fs.existsSync('a');
    if (fileExists) {
      fs.rmSync('a');
      return true;
    }
    return false;
  } catch (error) {return false;}
}

function mutate_verify(package, seed, timeout, values, vulnType) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const mutatedSeed = mutate(seed, values);

    if (vulnType == 1) {
      const isVulnerable_CI = verify_PoC_CI(package, mutatedSeed);
      if (isVulnerable_CI) {
        console.log('Vulnerable seed for CI:', mutatedSeed);
        return;
      }
    }

    if (vulnType == 2) {
      const isVulnerable_PP = verify_PoC_PP(package, mutatedSeed);
      if (isVulnerable_PP) {
        console.log('Vulnerable seed for PP:', mutatedSeed);
        return;
      }
    }

  }
}

function PoCgenerator(package, timeout, keyexpression, vulnType) {
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

  // const keyexpression todo
  if (typeof keyexpression === 'string') {
    values.push(`'${keyexpression}'`);
  } else {
    values.push(`''`);
  }

  const path = `seed/${package}_seed.json`;
  const seeds = JSON.parse(readFileSync(path, 'utf8'));
  seeds.forEach((seed) => {
    mutate_verify(package, seed, timeout, values, vulnType);
  });
}

module.exports = {
  PoCgenerator,
};
