/**
 * DOM manipulation utilities with security focus
 * Replaces scattered DOM operations throughout the codebase
 */

// All innerHTML must use DOMPurify

// Centralized DOMPurify configuration — one place to tighten later
// DOMPurify is loaded as a global via <script> tag in sidebar.html
export const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: ['div', 'span', 'p', 'ul', 'li', 'strong', 'em', 'br', 'button'],
  ALLOWED_ATTR: ['class', 'style', 'title'],
};

// HTML escaping utility (string-based, avoids DOM element creation per call)
export function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Safe DOM element creation
export function safeCreateElement(tag, className = '', textContent = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (textContent) element.textContent = textContent;
  return element;
}

// Safe HTML setter — DOMPurify-backed (replaces old regex implementation)
export function safeSetHTML(element, htmlContent) {
  element.innerHTML = DOMPurify.sanitize(htmlContent, DOMPURIFY_CONFIG);
}

// Copy to clipboard utility
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy text: ', err);
    return false;
  }
}