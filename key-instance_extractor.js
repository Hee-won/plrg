const fs = require('fs');
const acorn = require('acorn');
const walk = require('acorn-walk');
const generate = require('escodegen').generate;

function extractKeyInstances(filePath) {
  // Read and parse the file
  const code = fs.readFileSync(filePath, 'utf8');
  const ast = acorn.parse(code, {
    ecmaVersion: 2020,
    sourceType: 'module',
  });

  // Track variables in the environment
  const env = {};

  // Results to return
  const results = {
    calledFunctions: 'Not Found',
    arguments: [],
  };

  // Find require statements
  const requireRegex =
    /(const|let|var)\s+(\w+)\s*=\s*require\(['"`](.*?)['"`]\)/g;
  let match;
  const requireVariables = [];

  while ((match = requireRegex.exec(code)) !== null) {
    requireVariables.push(match[2]);
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
    // Return the processed node directly
    const processedNode = processNode(clonedNode);

    // If it's a literal or simple value, return its value
    if (processedNode.type === 'Literal') {
      return processedNode.value;
    } else if (processedNode.type === 'ArrayExpression') {
      return processedNode.elements.map((elem) => resolveArgument(elem));
    } else if (processedNode.type === 'ObjectExpression') {
      const result = {};
      for (const prop of processedNode.properties) {
        let key;
        if (prop.key.type === 'Identifier') {
          key = prop.key.name;
        } else if (prop.key.type === 'Literal') {
          key = prop.key.value;
        }

        if (key !== undefined) {
          result[key] = resolveArgument(prop.value);
        }
      }
      return result;
    } else if (processedNode.type === 'TemplateLiteral') {
      return generate(processedNode);
    } else if (processedNode.type === 'CallExpression') {
      // Only handle JSON.parse calls
      if (
        processedNode.callee.type === 'MemberExpression' &&
        processedNode.callee.object.name === 'JSON' &&
        processedNode.callee.property.name === 'parse' &&
        processedNode.arguments.length === 1
      ) {
        try {
          const argValue = resolveArgument(processedNode.arguments[0]);
          if (typeof argValue === 'string') {
            return JSON.parse(argValue);
          }
        } catch (e) {
          // If parsing fails, return the original node
          return processedNode;
        }
      }
      // For other function calls, return the node as is
      return processedNode;
    }

    // For other cases, return the AST node
    return processedNode;
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

  walk.simple(ast, {
    CallExpression(node) {
      let functionName = null;

      // Extract function name from different call patterns
      if (node.callee.type === 'MemberExpression') {
        const propertyPath = extractPropertyPath(node.callee);

        // Check if this is a call on a required module
        if (requireVariables.includes(propertyPath[0])) {
          functionName = propertyPath.at(-1);
        }
      } else if (
        node.callee.type === 'Identifier' &&
        requireVariables.includes(node.callee.name)
      ) {
        functionName = '#main';
      }

      // If we found a function call on a required module
      if (functionName) {
        results.calledFunctions = functionName;

        // Add all arguments to the results
        if (node.arguments.length > 0) {
          results.arguments = node.arguments.map((arg) => resolveArgument(arg));
        }
      }
    },
  });

  return results;
}

// Usage example:
const results = extractKeyInstances('./PoC.js');
console.log('Called Functions:', results.arguments);

module.exports = extractKeyInstances;
