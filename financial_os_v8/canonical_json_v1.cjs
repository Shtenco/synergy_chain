'use strict';

const crypto = require('crypto');

const MAX_SAFE_JSON_INTEGER = Number.MAX_SAFE_INTEGER;

class CanonicalJsonError extends Error {}

function assertCanonicalJsonProfile(value, path = '$') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new CanonicalJsonError(
        `${path} contains non-safe-integer number; canonical JSON requires decimal strings`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertCanonicalJsonProfile(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === 'object') {
    Object.keys(value).forEach((key) => assertCanonicalJsonProfile(value[key], `${path}.${key}`));
    return;
  }
  throw new CanonicalJsonError(`${path} contains a non-JSON value`);
}

function canonicalStringify(value) {
  assertCanonicalJsonProfile(value);
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
    .join(',')}}`;
}

function sha256Canonical(payload) {
  return crypto.createHash('sha256').update(canonicalStringify(payload), 'utf8').digest('hex');
}

module.exports = {
  MAX_SAFE_JSON_INTEGER,
  CanonicalJsonError,
  assertCanonicalJsonProfile,
  canonicalStringify,
  sha256Canonical,
};
