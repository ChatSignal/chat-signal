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

// Utility for creating list items safely
export function createListItem(className, textContent) {
  const li = safeCreateElement('li', className, textContent);
  return li;
}

// Utility for creating spans safely
export function createSpan(className, textContent) {
  const span = safeCreateElement('span', className, textContent);
  return span;
}

// Utility for creating divs safely
export function createDiv(className = '', textContent = '') {
  return safeCreateElement('div', className, textContent);
}

// Batch DOM operations for performance
export function batchDOMUpdates(container, operations) {
  const fragment = document.createDocumentFragment();
  operations.forEach(operation => fragment.appendChild(operation));
  container.innerHTML = '';
  container.appendChild(fragment);
}

// Show/hide element utilities
export function showElement(element) {
  if (element) element.classList.remove('hidden');
}

export function hideElement(element) {
  if (element) element.classList.add('hidden');
}

export function toggleElement(element, show) {
  if (show) {
    showElement(element);
  } else {
    hideElement(element);
  }
}

// Modal utilities
export function showModal(modalElement) {
  if (modalElement) modalElement.classList.remove('hidden');
}

export function hideModal(modalElement) {
  if (modalElement) modalElement.classList.add('hidden');
}

// Tab switching utilities
export function setActiveTab(tabElement, contentElement) {
  // Remove active class from all tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Hide all content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.add('hidden');
  });
  
  // Set active tab and show content
  if (tabElement) tabElement.classList.add('active');
  if (contentElement) contentElement.classList.remove('hidden');
}

// Theme utilities
export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Copy to clipboard utility
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy text: ', err);
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch (fallbackErr) {
      console.error('Fallback copy failed: ', fallbackErr);
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
}