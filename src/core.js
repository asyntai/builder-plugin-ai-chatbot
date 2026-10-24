// Pure logic for the Asyntai AI Chatbot plugin for Builder.io.
// No Builder.io imports here, so every function can be tested in plain Node.

export const DEFAULT_SCRIPT_URL = 'https://asyntai.com/static/js/chat-widget.js';
export const DEFAULT_API_BASE = 'https://asyntai.com';
export const WIDGET_BLOCK_MARKER = 'asyntaiChatbot';
export const KNOWLEDGE_TITLE_SUFFIX = '(Builder.io)';

// Widget IDs look like "asyntai_1a2b3c4d5e6f". The ID goes into a script, so
// anything outside this set is refused instead of escaped.
const WIDGET_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

export function normalizeWidgetId(value) {
  const id = String(value == null ? '' : value).trim();
  return WIDGET_ID_RE.test(id) ? id : '';
}

export function widgetSnippet(widgetId, scriptUrl = DEFAULT_SCRIPT_URL) {
  const id = normalizeWidgetId(widgetId);
  if (!id) throw new Error('Invalid Asyntai widget ID');
  // An inline loader, not <script src data-asyntai-id>: Builder's Custom Code
  // block re-creates <script src> tags and drops their data attributes, so
  // the widget would load without knowing which chatbot to show.
  return (
    '<script>(function(){' +
    'if(window.__asyntaiBuilderLoaded)return;window.__asyntaiBuilderLoaded=true;' +
    'var s=document.createElement("script");' +
    's.src=' + JSON.stringify(scriptUrl) + ';s.async=true;' +
    's.setAttribute("data-asyntai-id",' + JSON.stringify(id) + ');' +
    'document.head.appendChild(s);' +
    '})();</script>'
  );
}

export function widgetBlock(widgetId, scriptUrl = DEFAULT_SCRIPT_URL) {
  return {
    '@type': '@builder.io/sdk:Element',
    id: 'builder-asyntai-ai-chatbot',
    meta: { [WIDGET_BLOCK_MARKER]: true },
    component: {
      name: 'Custom Code',
      options: {
        code: widgetSnippet(widgetId, scriptUrl),
        scriptsClientOnly: true,
        replaceNodes: false,
      },
    },
  };
}

export function isWidgetBlock(block) {
  if (!block || typeof block !== 'object') return false;
  if (block.meta && block.meta[WIDGET_BLOCK_MARKER]) return true;
  const code = block.component && block.component.options && block.component.options.code;
  return typeof code === 'string' && code.indexOf('__asyntaiBuilderLoaded') !== -1;
}

function toPlain(value) {
  // Builder hands plugins mobx-wrapped objects; a JSON round trip gives a
  // plain copy that is safe to change and send back.
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function contentData(content) {
  const data = content && content.data;
  if (!data) return {};
  if (typeof data.toJSON === 'function') return toPlain(data.toJSON());
  return toPlain(data) || {};
}

export function hasWidget(content) {
  const blocks = contentData(content).blocks;
  return Array.isArray(blocks) && blocks.some(isWidgetBlock);
}

export function dataWithWidget(content, widgetId, scriptUrl = DEFAULT_SCRIPT_URL) {
  const data = contentData(content);
  const blocks = Array.isArray(data.blocks) ? data.blocks.filter((b) => !isWidgetBlock(b)) : [];
  blocks.push(widgetBlock(widgetId, scriptUrl));
  return Object.assign({}, data, { blocks });
}

export function dataWithoutWidget(content) {
  const data = contentData(content);
  const blocks = Array.isArray(data.blocks) ? data.blocks.filter((b) => !isWidgetBlock(b)) : [];
  return Object.assign({}, data, { blocks });
}

// ---------------------------------------------------------------------------
// Page text for the knowledge base
// ---------------------------------------------------------------------------

const TEXT_OPTION_KEYS = new Set([
  'text', 'title', 'heading', 'subtitle', 'subheading', 'label', 'content',
  'description', 'buttonText', 'caption', 'question', 'answer', 'body',
]);

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™', euro: '€',
};

export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z0-9]+);/gi, (m, name) => {
      const key = name.toLowerCase();
      if (ENTITIES[key] !== undefined) return ENTITIES[key];
      if (key[0] === '#') {
        const code = key[1] === 'x' ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return m;
    })
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function looksLikeText(value) {
  return typeof value === 'string' && /[A-Za-zÀ-￿]/.test(value) && !/^(https?:|\/|#|data:)/.test(value.trim());
}

function collectText(node, out, depth) {
  if (depth > 40 || node == null) return;
  if (Array.isArray(node)) {
    node.forEach((child) => collectText(child, out, depth + 1));
    return;
  }
  if (typeof node !== 'object') return;
  if (isWidgetBlock(node)) return;
  const options = node.component && node.component.options;
  if (options && typeof options === 'object') {
    Object.keys(options).forEach((key) => {
      const value = options[key];
      if (TEXT_OPTION_KEYS.has(key) && looksLikeText(value)) {
        const text = htmlToText(value);
        if (text) out.push(text);
      } else if (value && typeof value === 'object') {
        collectText(value, out, depth + 1);
      }
    });
  }
  ['children', 'blocks'].forEach((key) => {
    if (node[key]) collectText(node[key], out, depth + 1);
  });
  // Nested option objects that are not elements (columns, tabs, accordion items)
  if (!node['@type'] && !node.component) {
    Object.keys(node).forEach((key) => {
      const value = node[key];
      if (key === 'children' || key === 'blocks') return;
      if (value && typeof value === 'object') collectText(value, out, depth + 1);
      else if (TEXT_OPTION_KEYS.has(key) && looksLikeText(value)) {
        const text = htmlToText(value);
        if (text) out.push(text);
      }
    });
  }
}

export function pageTitle(content) {
  const data = contentData(content);
  const title = (data.title || (content && content.name) || 'Untitled page').toString().trim();
  return title || 'Untitled page';
}

export function pagePath(content) {
  const data = contentData(content);
  if (typeof data.url === 'string' && data.url) return data.url;
  const query = (content && content.query) || [];
  for (const q of query) {
    if (q && q.property === 'urlPath') {
      const v = Array.isArray(q.value) ? q.value[0] : q.value;
      if (typeof v === 'string' && v) return v;
    }
  }
  return '';
}

export function knowledgeTitle(content) {
  const path = pagePath(content);
  const base = pageTitle(content) + (path ? ' ' + path : '');
  return (base + ' ' + KNOWLEDGE_TITLE_SUFFIX).slice(0, 250);
}

export function extractPageText(content) {
  const data = contentData(content);
  const parts = [];
  if (looksLikeText(data.title)) parts.push(htmlToText(data.title));
  if (looksLikeText(data.description)) parts.push(htmlToText(data.description));
  collectText(data.blocks || [], parts, 0);
  const seen = new Set();
  const lines = [];
  parts.join('\n').split('\n').forEach((line) => {
    const clean = line.trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    lines.push(clean);
  });
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Asyntai API
// ---------------------------------------------------------------------------

export class AsyntaiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status || 0;
  }
}

async function call(fetchImpl, base, apiKey, method, path, body) {
  let res;
  try {
    res = await fetchImpl(base.replace(/\/+$/, '') + path, {
      method,
      headers: Object.assign(
        { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' },
        body ? { 'Content-Type': 'application/json' } : {}
      ),
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new AsyntaiError('Could not reach Asyntai. Check your connection and try again.', 0);
  }
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = null;
  }
  if (!res.ok || (json && json.success === false)) {
    const message = (json && (json.error || json.message)) || 'Asyntai answered with HTTP ' + res.status;
    throw new AsyntaiError(message, res.status);
  }
  return json || {};
}

// Adds (or replaces) one page in the knowledge base. An earlier copy of the
// same page, found by its title among the newest 100 entries, is deleted
// first, so pressing the action again updates the page instead of adding a
// duplicate.
export async function syncPage(content, opts) {
  const { apiKey, websiteId, fetchImpl, base = DEFAULT_API_BASE } = opts || {};
  if (!apiKey) throw new AsyntaiError('Add your Asyntai API key in the plugin settings first.', 0);
  const text = extractPageText(content);
  if (text.length < 10) {
    throw new AsyntaiError('This page has no text to add yet.', 0);
  }
  const title = knowledgeTitle(content);
  const qs = '?limit=100' + (websiteId ? '&website_id=' + encodeURIComponent(websiteId) : '');
  const list = await call(fetchImpl, base, apiKey, 'GET', '/api/v1/knowledge/' + qs);
  const old = (list.entries || []).filter((e) => e && e.title === title);
  for (const entry of old) {
    await call(fetchImpl, base, apiKey, 'DELETE', '/api/v1/knowledge/' + encodeURIComponent(entry.id) + '/');
  }
  const body = { title, content: text };
  if (websiteId) body.website_id = String(websiteId);
  const added = await call(fetchImpl, base, apiKey, 'POST', '/api/v1/knowledge/text/', body);
  return { id: added.id, title, chunks: added.chunks_created || 0, replaced: old.length, chars: text.length };
}
