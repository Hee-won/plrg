const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, spawnSync } = require('child_process');

// ------------------ Utility Functions ------------------

/**
 * ‼️PoC 파일 이름‼️에서 취약점 종류, 패키지 이름, 버전을 추출
 * 예: 'prototype-pollution_emily@3.0.1_PoC_57.js'
 *      → { vulnType: 'prototype-pollution', pkgName: 'emily', pkgVersion: '3.0.1' }
 *
 * @param {string} fileName - PoC 파일명 (확장자 .js 포함)
 * @returns {{ vulnType: string, pkgName: string, pkgVersion: string }|null}
 */
function parsePoCFilename3(fileName) {
  if (!fileName.endsWith('.js')) return null;

  // .js 제거 후, _PoC_를 기준으로 앞부분을 취함
  const base = fileName.slice(0, -3);
  const [mainPart] = base.split('_PoC_');
  if (!mainPart) return null;

  // 첫 번째 언더바를 기준으로 취약점 종류와 패키지 정보 분리
  const underscoreIndex = mainPart.indexOf('_');
  if (underscoreIndex === -1) return null;
  const vulnType = mainPart.slice(0, underscoreIndex);
  const pkgWithVersion = mainPart.slice(underscoreIndex + 1);

  // '@' 문자를 기준으로 패키지 이름과 버전 분리
  const atIndex = pkgWithVersion.lastIndexOf('@');
  if (atIndex === -1) return null;
  const pkgName = pkgWithVersion.slice(0, atIndex);
  const pkgVersion = pkgWithVersion.slice(atIndex + 1);

  if (!vulnType || !pkgName || !pkgVersion) return null;
  return { vulnType, pkgName, pkgVersion };
}

/**
 * ‼️PoC 파일 이름‼️에서 패키지 이름과 버전을 추출
 * 예: 'prototype-pollution_@scope/pkg@1.2.3_PoC_1.js' → ['@scope/pkg', '1.2.3']
 *
 * @param {string} filename - PoC 파일명
 * @returns {[string|null, string|null]} - [패키지 이름, 버전] 또는 실패 시 [null, null]
 */
function parsePoCFilename2(filename) {
  if (!filename.endsWith('.js')) return [null, null];

  const base = filename.split('_PoC_')[0];
  const parts = base.split('_').slice(1).join('_').split('@');
  if (parts.length < 2) return [null, null];

  const version = parts.pop(); // 마지막이 버전
  const pkg = parts.join('@'); // 나머지가 패키지 이름
  return [pkg, version];
}

/**
 * ‼️JSON 파일명‼️에서 패키지 이름과 버전 추출
 * 예: 'component-builder_1.2.1_dependencies.json' → ['component-builder', '1.2.1']
 *
 * @param {string} filename
 * @returns {[string|null, string|null]} - [패키지 이름, 버전] 또는 실패 시 [null, null]
 */
function parseJSONFilename(filename) {
  if (!filename.endsWith('_dependencies.json')) return [null, null];

  const base = filename.slice(0, -'_dependencies.json'.length);
  if (!base.includes('_')) return [null, null];

  const [pkgName, pkgVersion] = base.split(/_(?=[^_]+$)/); // 마지막 언더바 기준으로 나눔
  return [pkgName, pkgVersion];
}


/**
 * ‼️패키지@버전 형식 문자열‼️에서 이름과 버전 분리
 * 예: 'lodash.merge@4.6.2' → { name: 'lodash.merge', version: '4.6.2' }
 *
 * @param {string} pkgWithVersion - 패키지@버전 형식 문자열
 * @returns {{ name: string, version: string }} - 이름과 버전
 */
function parsePkgAndVersion(pkgWithVersion) {
  const atIndex = pkgWithVersion.lastIndexOf('@');
  if (atIndex <= 0) {
    throw new Error(`Invalid format: ${pkgWithVersion}`);
  }
  const name = pkgWithVersion.slice(0, atIndex);
  const version = pkgWithVersion.slice(atIndex + 1);
  return { name, version };
}


// ------------------ Export ------------------
module.exports = {
  parsePoCFilename3,          // _PoC_[i].js 파일명에서 패키지 취약점종류/이름/버전 추출
  parsePoCFilename2,          // _PoC_[i].js 파일명에서 패키지 이름/버전 추출
  parseJSONFilename,         // _dependencies.json JSON 파일명에서 패키지명/버전 추출
  parsePkgAndVersion,
};