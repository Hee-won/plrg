// cg8.js - 외부 모듈 내부까지 파싱하는 Call Graph 생성기

const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const fs = require('fs');
const pathModule = require('path');

const functionDefinitions = {};
const callRelations = new Set();
const analyzedFiles = new Set();
const requireMap = new Map();
let targetDirectory = '';
const builtinModules = require('module').builtinModules;

function analyzePath(targetPath, allowNodeModules = false) {
  if (!fs.existsSync(targetPath)) return;

  const stat = fs.statSync(targetPath);

  if (stat.isDirectory()) {
    fs.readdirSync(targetPath).forEach((entry) => {
      const next = pathModule.join(targetPath, entry);
      if (!allowNodeModules && next.includes('node_modules')) return;
      analyzePath(next, allowNodeModules);
    });
  } else if (stat.isFile() && targetPath.endsWith('.js')) {
    analyzeFile(targetPath, allowNodeModules);
  }
}

function analyzeFile(filePath, allowNodeModules = false) {
  if (analyzedFiles.has(filePath)) return;
  analyzedFiles.add(filePath);

  const code = fs.readFileSync(filePath, 'utf8');
  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'classProperties', 'dynamicImport']
    });
  } catch (error) {
    console.error(`파싱 오류 in ${filePath}: ${error.message}`);
    return;
  }

  traverse(ast, {
    enter(path) {
      if (
        path.isFunctionDeclaration() ||
        path.isFunctionExpression() ||
        path.isArrowFunctionExpression() ||
        path.isClassMethod() ||
        path.isObjectMethod()
      ) {
        collectFunctionDefinition(path, filePath);
      }
    }
  });

  traverse(ast, {
    enter(path) {
      if (path.isCallExpression()) {
        collectFunctionCall(path, filePath);
      }

      if (path.isClassDeclaration()) {
        collectClassMethodsAndCalls(path, filePath);
      }

      if (path.isVariableDeclarator()) {
        collectRequireAlias(path, filePath, allowNodeModules);
      }

      if (path.isImportDeclaration()) {
        const requiredPath = resolveModulePath(filePath, path.node.source.value);
        if (requiredPath) analyzeFile(requiredPath, allowNodeModules);
      }
    }
  });
}

function collectRequireAlias(path, filePath, allowNodeModules) {
  const init = path.node.init;
  if (
    init && init.type === 'CallExpression' &&
    init.callee.name === 'require' &&
    init.arguments.length === 1 &&
    init.arguments[0].type === 'StringLiteral'
  ) {
    const requiredModulePath = init.arguments[0].value;
    const resolvedPath = resolveModulePath(filePath, requiredModulePath, allowNodeModules);

    if (resolvedPath) {
      const varName = path.node.id.name;
      const exportFuncName = getModuleExportFunctionName(resolvedPath);
      if (exportFuncName) {
        requireMap.set(varName, exportFuncName);
      }
    }
  }
}

function getModuleExportFunctionName(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'classProperties', 'dynamicImport']
    });
  } catch (error) {
    return null;
  }

  let foundName = null;
  traverse(ast, {
    AssignmentExpression(path) {
      const left = path.node.left;
      const right = path.node.right;

      if (
        left.type === 'MemberExpression' &&
        left.object.name === 'module' &&
        left.property.name === 'exports'
      ) {
        const loc = right.loc?.start;
        foundName = `anonymous@${loc?.line}:${loc?.column}`;
      }
      if (
        left.type === 'MemberExpression' &&
        left.object.name === 'exports' &&
        left.property.type === 'Identifier'
      ) {
        foundName = left.property.name;
      }
    }
  });
  return foundName;
}

function collectFunctionDefinition(path, filePath) {
  const funcName = getFunctionName(path);
  if (!funcName) return;
  if (!functionDefinitions[funcName]) {
    functionDefinitions[funcName] = {
      name: funcName,
      loc: path.node.loc,
      file: filePath
    };
  }
}

function collectFunctionCall(path, filePath) {
  const callee = path.node.callee;
  let calleeName = getCalleeName(callee);

  const callerPath = path.getFunctionParent();
  const callerName = callerPath ? getFunctionName(callerPath) || 'anonymous' : 'global';

  if (callee.type === 'Identifier' && requireMap.has(callee.name)) {
    const realFunc = requireMap.get(callee.name);
    callRelations.add(`${callerName}->${callee.name}`);
    callRelations.add(`${callee.name}->${realFunc}`);
    return;
  }

  if (!calleeName) return;
  callRelations.add(`${callerName}->${calleeName}`);
}

function collectClassMethodsAndCalls(path, filePath) {
  const className = path.node.id ? path.node.id.name : 'anonymous_class';
  path.traverse({
    ClassMethod(innerPath) {
      const methodName = innerPath.node.key.name;
      const fullName = `${className}.${methodName}`;
      if (!functionDefinitions[fullName]) {
        functionDefinitions[fullName] = {
          name: fullName,
          loc: innerPath.node.loc,
          file: filePath
        };
      }
      innerPath.traverse({
        CallExpression(callPath) {
          const callee = getCalleeName(callPath.node.callee);
          if (!callee) return;
          callRelations.add(`${fullName}->${callee}`);
        }
      });
    }
  });
}

function getFunctionName(path) {
  if (path.node.id && path.node.id.name) return path.node.id.name;
  if ((path.isClassMethod() || path.isObjectMethod()) && path.node.key.name) return path.node.key.name;
  if (path.parentPath.isVariableDeclarator() && path.parentPath.node.id.name) return path.parentPath.node.id.name;
  if (path.parentPath.isAssignmentExpression() && path.parentPath.node.left.name) return path.parentPath.node.left.name;
  if (path.parentPath.isObjectProperty() && path.parentPath.node.key.name) return path.parentPath.node.key.name;
  if (path.node.loc) {
    const { line, column } = path.node.loc.start;
    return `anonymous@${line}:${column}`;
  }
  return null;
}

function getCalleeName(callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression') return callee.property.name || '';
  return null;
}

function resolveModulePath(currentFile, modulePath, allowNodeModules = false) {
  const currentDir = pathModule.dirname(currentFile);

  // ✅ 1. 내장 모듈이면 건너뜀
  if (builtinModules.includes(modulePath)) return null;

  // ✅ 2. 상대 경로 처리
  if (modulePath.startsWith('.')) {
    let resolved = pathModule.resolve(currentDir, modulePath);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      resolved = pathModule.join(resolved, 'index.js');
    } else if (!pathModule.extname(resolved)) {
      resolved += '.js';
    }
    return fs.existsSync(resolved) ? resolved : null;
  }

  // ✅ 3. 외부 모듈 처리
  if (allowNodeModules) {
    try {
      return require.resolve(modulePath);
    } catch {
      return null;
    }
  }

  return null;
}

function outputCallGraph() {
  console.log('digraph CallGraph {');
  console.log('  rankdir=LR;');
  for (const func in functionDefinitions) {
    const f = functionDefinitions[func];
    const label = `${func}\\n${pathModule.basename(f.file)}`;
    console.log(`  "${func}" [label="${label}"];`);
  }
  for (const relation of callRelations) {
    const [caller, callee] = relation.split('->');
    console.log(`  "${caller}" -> "${callee}";`);
  }
  console.log('}');
}

const targetPath = process.argv[2];
if (!targetPath) {
  console.error('사용법: node cg8.js <분석대상 폴더>');
  process.exit(1);
}

targetDirectory = pathModule.resolve(process.cwd(), targetPath);
analyzePath(targetDirectory, true); // ✅ 외부 모듈도 분석
outputCallGraph();