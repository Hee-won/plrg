const { execSync } = require('child_process');
const { time } = require('console');
const { readFileSync } = require('fs');

// const keyexpression todo
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

function parsePkgAndVersion(pkgWithVersion) {
  const atIndex = pkgWithVersion.lastIndexOf('@');
  if (atIndex <= 0) {
    throw new Error(`Invalid format: ${pkgWithVersion}`);
  }
  const name = pkgWithVersion.slice(0, atIndex);
  const version = pkgWithVersion.slice(atIndex + 1);
  return { name, version };
}

function mutate(seed) {
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
function verify_PoC(package, seed) {
  const importcode = `const ${package} = require('${package}')`;
  try {
    execSync(`node -e "${importcode + '\n' + seed}"`, {
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('Error during PoC verification:', error.message);
  }
}

function mutate_verify(package, seed, timeout) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const mutatedSeed = mutate(seed);
    verify_PoC(package, mutatedSeed);
    console.log('Mutated seed:', mutatedSeed);
  }
}

function PoCgenerator(package, timeout) {
  const path = `seed/${package}_seed.json`;
  const seeds = JSON.parse(readFileSync(path, 'utf8'));
  seeds.forEach((seed) => {
    mutate_verify(package, seed, timeout);
  });
}

PoCgenerator('lodash', 1000);
