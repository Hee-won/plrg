const fs = require('fs');
const acorn = require('acorn');
const walk = require('acorn-walk');
const generate = require('escodegen').generate;

const PoC_code = fs.readFileSync('PoC.js', 'utf8');
const ast = acorn.parse(PoC_code, {
  ecmaVersion: 2020,
  sourceType: 'module',
});

// Track variables in the environment
const env = {};

// Find require statements
const requireRegex =
  /(const|let|var)\s+(\w+)\s*=\s*require\(['"`](.*?)['"`]\)/g;
let match;
const requireVariables = [];

while ((match = requireRegex.exec(PoC_code)) !== null) {
  requireVariables.push(match[2]); // Collect variable names
  console.log(`Found require variable: ${match[2]}`);
}

// Helper function to extract the full property path from a MemberExpression
function extractPropertyPath(node) {
  const path = [];
  let current = node;

  while (current.type === 'MemberExpression') {
    // Add property name to the path
    if (current.property.type === 'Identifier') {
      path.unshift(current.property.name);
    } else {
      path.unshift(generate(current.property));
    }

    current = current.object;
  }

  // Add the root object name
  if (current.type === 'Identifier') {
    path.unshift(current.name);
  }

  return path;
}

walk.simple(ast, {
  VariableDeclarator(node) {
    if (node.init) {
      env[node.id.name] = node.init;
    }
  },
  AssignmentExpression(node) {
    if (node.left.type === 'Identifier') {
      env[node.left.name] = node.right;
    }
  },
});
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
function resolveArgument(node) {
  // Deep clone to avoid modifying the original AST
  const clonedNode = deepClone(node);

  // Recursively process the node
  const processNode = (current) => {
    if (!current || typeof current !== 'object') return current;

    // Replace identifiers with their values from env
    if (current.type === 'Identifier' && env[current.name]) {
      return deepClone(env[current.name]);
    }

    // Process all properties of the node
    for (const key in current) {
      if (current.hasOwnProperty(key) && typeof current[key] === 'object') {
        current[key] = processNode(current[key]);
      }
    }

    return current;
  };

  return generate(processNode(clonedNode), {
    format: { quotes: 'double' },
  });
}

walk.simple(ast, {
  CallExpression(node) {
    if (node.callee.type === 'MemberExpression') {
      const propertyPath = extractPropertyPath(node.callee);

      if (requireVariables.includes(propertyPath[0])) {
        // Resolve arguments using the environment
        const args = node.arguments.map(resolveArgument);

        console.log(`Called properties: ${propertyPath.slice(1).join('.')}`);
        console.log(`Base object: ${propertyPath[0]}`);
        console.log(`Arguments: ${args.join(', ')}`);
      }
    } else if (
      node.callee.type === 'Identifier' &&
      requireVariables.includes(node.callee.name)
    ) {
      // Resolve arguments using the environment
      const args = node.arguments.map(resolveArgument);

      console.log(`Called function: ${node.callee.name}`);
      console.log(`Arguments: ${args.join(', ')}`);
    }
  },
});
