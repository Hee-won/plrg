function convetUnicode(string) {
  // convert some character (ex . , ; :) to unicode
  const unicodeMap = {
    '.': '\\u002E',
    ',': '\\u002C',
    ';': '\\u003B',
    ':': '\\u003A',
  };
  let result = '';
  for (let i = 0; i < string.length; i++) {
    const char = string[i];
    if (unicodeMap[char]) {
      result += unicodeMap[char];
    } else {
      result += char;
    }
  }
  return result;
}

function convertParentheses(string) {
  // add parentheses front and back
  const brackets = ['()', '{}', '[]'];
  const randomBracket = brackets[Math.floor(Math.random() * brackets.length)];
  const openBracket = randomBracket[0];
  const closeBracket = randomBracket[1];
  const randomCount =
    Math.random() < 0.1
      ? Math.floor(Math.random() * 2) + 2
      : Math.floor(Math.random() * 2); // 10% chance for 2-3, 90% chance for 0-1
  let result = string;
  for (let i = 0; i < randomCount; i++) {
    result = `${openBracket}${result}${closeBracket}`;
  }
  return result;
}

function keystringMutator(string) {
  // 5% chance to convert string to unicode
  const shouldConvertToUnicode = Math.random() < 0.05;
  const unicodeString = shouldConvertToUnicode ? convetUnicode(string) : string;
  // Convert parentheses
  const result = convertParentheses(unicodeString);
  return result;
}
