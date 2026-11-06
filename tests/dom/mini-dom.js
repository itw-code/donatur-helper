// Deliberately not a real DOM: this parser supports only the rendered-output checks in this directory.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'wbr']);

function decode(text) {
  return text.replace(/&(?:amp|lt|gt|quot|#39|middot);/g, value => ({
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&middot;': '·'
  }[value]));
}

function parseAttributes(source) {
  const attrs = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = pattern.exec(source))) attrs[match[1]] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  return attrs;
}

class Element {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName;
    this.attributes = attributes;
    this.children = [];
  }

  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
  get textContent() { return this.children.map(child => typeof child === 'string' ? decode(child) : child.textContent).join(''); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const result = [];
    const visit = node => {
      if (node instanceof Element) {
        if (node.matches(selector)) result.push(node);
        node.children.forEach(visit);
      }
    };
    this.children.forEach(visit);
    return result;
  }

  matches(selector) {
    const testId = selector.match(/\[data-testid(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/);
    if (testId && (this.getAttribute('data-testid') === null || (testId[1] ?? testId[2] ?? testId[3]) !== undefined && this.getAttribute('data-testid') !== (testId[1] ?? testId[2] ?? testId[3]))) return false;
    const id = selector.match(/#([\w-]+)/);
    if (id && this.getAttribute('id') !== id[1]) return false;
    const classes = [...selector.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
    if (classes.some(name => !this.getAttribute('class')?.split(/\s+/).includes(name))) return false;
    const tag = selector.replace(/\[.*?\]|#[\w-]+|\.[\w-]+/g, '').trim();
    return !tag || this.tagName === tag.toLowerCase();
  }
}

export function parseHtml(html) {
  const root = new Element('#document');
  const stack = [root];
  for (const token of html.match(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g) || []) {
    if (token.startsWith('<!--')) continue;
    if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
    if (!token.startsWith('<')) { stack.at(-1).children.push(token); continue; }
    const match = token.match(/^<\s*([\w-]+)([\s\S]*?)\/?>$/);
    if (!match) continue;
    const element = new Element(match[1].toLowerCase(), parseAttributes(match[2]));
    stack.at(-1).children.push(element);
    if (!VOID.has(element.tagName) && !token.endsWith('/>')) stack.push(element);
  }
  return root;
}
