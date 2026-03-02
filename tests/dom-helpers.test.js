import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { escapeHtml, safeCreateElement, safeSetHTML, DOMPURIFY_CONFIG } = await import(
  '../extension/sidebar/utils/DOMHelpers.js'
);

describe('escapeHtml', () => {
  it('escapes all dangerous characters', () => {
    const input = '<script>alert("xss")</script> & \'test\'';
    const result = escapeHtml(input);
    assert.ok(!result.includes('<script>'));
    assert.ok(result.includes('&lt;'));
    assert.ok(result.includes('&gt;'));
    assert.ok(result.includes('&quot;'));
    assert.ok(result.includes('&#039;'));
    assert.ok(result.includes('&amp;'));
  });

  it('returns unchanged string when no special characters', () => {
    assert.equal(escapeHtml('hello world'), 'hello world');
  });

  it('handles empty string', () => {
    assert.equal(escapeHtml(''), '');
  });
});

describe('DOMPURIFY_CONFIG', () => {
  it('has allowed tags and attributes', () => {
    assert.ok(Array.isArray(DOMPURIFY_CONFIG.ALLOWED_TAGS));
    assert.ok(DOMPURIFY_CONFIG.ALLOWED_TAGS.includes('span'));
    assert.ok(DOMPURIFY_CONFIG.ALLOWED_TAGS.includes('div'));
    assert.ok(!DOMPURIFY_CONFIG.ALLOWED_TAGS.includes('script'));
    assert.ok(Array.isArray(DOMPURIFY_CONFIG.ALLOWED_ATTR));
    assert.ok(DOMPURIFY_CONFIG.ALLOWED_ATTR.includes('class'));
    assert.ok(!DOMPURIFY_CONFIG.ALLOWED_ATTR.includes('onclick'));
  });
});
