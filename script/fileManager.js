// fileManager.js 파일 읽기,쓰기,존재여 검사

const fs = require('fs');
const path = require('path');

/**
 *  주어진 디렉토리에서 `.json` 파일 목록만 반환
 *  * @param {string} directoryPath - 탐색할 디렉토리 경로
 *  * @returns {string[]} - .json 파일 이름 리스트
 */
function getJSONFilesInDirectory(directoryPath) {
  if (!fs.existsSync(directoryPath)) return [];
  return fs.readdirSync(directoryPath).filter(file => file.endsWith('.json'));
}

/**
 *  JSON 파일을 열어 파싱한 객체 반환
 *  * @param {string} fullPath - JSON 파일의 전체 경로
 *  * @returns {object} - 파싱된 JSON 객체
 */
function readJSONFile(fullPath) {
  const raw = fs.readFileSync(fullPath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * 폴더 존재하지 않으면 생성
 */
function ensureDirectoryExists(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

module.exports = {
  getJSONFilesInDirectory,
  readJSONFile,
  ensureDirectoryExists
};
