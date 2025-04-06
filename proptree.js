const fs = require('fs');
const path = require('path');
// const black_list = ['length', 'name', 'constructor', 'prototype', 'arguments'];
// maybe need

function isCallable(f) {
  return typeof f === 'function';
}

// assertion for [[Construct]]
function isConstructable(f) {
  try {
    Reflect.construct(function () {}, [], f);
    return true;
  } catch (e) {
    return false;
  }
}
function makePropTree(target, depth) {
  const properties = Object.keys(target);
  Object.getPrototypeOf(target) &&
    Object.keys(Object.getPrototypeOf(target)).forEach((prop) => {
      if (!properties.includes(prop)) properties.push(prop);
    });
  const result = {};
  for (const prop of properties) {
    // if (black_list.includes(prop)) continue;
    const value = target[prop];
    result[prop] = {
      callable: isCallable(value),
      constructable: isConstructable(value),
    };
    if (typeof value === 'object' && depth > 0) {
      result[prop].children = makePropTree(value, depth - 1);
    }
  }
  return result;
}

function analyzeModule(moduleName, depth_limit) {
  let targetObject = {};
  try {
    targetObject = require(moduleName);
  } catch (err) {
    console.error(`Module "${moduleName}" not found.`);
    return targetObject;
  }

  const result = makePropTree(targetObject, depth_limit, {});
  const outputFileName = `${moduleName}_PropertyTree.json`;
  const outputFilePath = path.join(__dirname, 'output', outputFileName);

  try {
    fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
    fs.writeFileSync(outputFilePath, JSON.stringify(result, null, 2));
    console.log(`Output saved to ${outputFilePath}`);
  } catch (err) {
    console.error(`Failed to save output: ${err.message}`);
  }
  return result;
}

module.exports = {
  analyzeModule,
};
