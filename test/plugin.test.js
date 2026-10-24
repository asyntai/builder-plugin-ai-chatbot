import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeWidgetId, widgetSnippet, widgetBlock, isWidgetBlock, hasWidget,
  dataWithWidget, dataWithoutWidget, htmlToText, extractPageText, knowledgeTitle,
  pagePath, syncPage, AsyntaiError, DEFAULT_SCRIPT_URL,
} from '../src/core.js';
import { register, getSettings, PLUGIN_ID } from '../src/register.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// A page as Builder.io stores it (shape taken from real Builder content JSON).
const page = () => ({
  id: 'abc123',
  modelId: 'model1',
  name: 'About us',
  query: [{ property: 'urlPath', operator: 'is', value: '/about' }],
  data: {
    title: 'About Acme &amp; Co',
    description: 'Who we are',
    url: '/about',
    blocks: [
      { '@type': '@builder.io/sdk:Element', id: 'b1', component: { name: 'Text', options: { text: '<h1>Welcome to <b>Acme</b></h1><p>We fix bikes&nbsp;fast.</p>' } } },
      { '@type': '@builder.io/sdk:Element', id: 'b2', component: { name: 'Image', options: { image: 'https://cdn.builder.io/x.png', altText: 'logo' } } },
      {
        '@type': '@builder.io/sdk:Element', id: 'b3',
        component: {
          name: 'Columns',
          options: {
            columns: [
              { blocks: [{ '@type': '@builder.io/sdk:Element', component: { name: 'Text', options: { text: '<p>Open Mon&ndash;Fri 9&#8211;5</p>' } } }] },
              { blocks: [{ '@type': '@builder.io/sdk:Element', component: { name: 'Core:Button', options: { text: 'Book a repair', link: '/book' } } }] },
            ],
          },
        },
      },
      { '@type': '@builder.io/sdk:Element', id: 'b4', children: [
        { '@type': '@builder.io/sdk:Element', component: { name: 'Text', options: { text: '<ul><li>Road bikes</li><li>E-bikes</li></ul>' } } },
        { '@type': '@builder.io/sdk:Element', component: { name: 'Custom Code', options: { code: '<script>alert(1)</script>' } } },
      ] },
      { '@type': '@builder.io/sdk:Element', component: { name: 'Text', options: { text: '<p>We fix bikes fast.</p>' } } },
    ],
  },
});

test('plugin id equals the npm package name (Builder stores settings under it)', () => {
  assert.equal(PLUGIN_ID, pkg.name);
});

test('widget id: valid ids pass, anything that could break the script is refused', () => {
  assert.equal(normalizeWidgetId(' asyntai_1a2b3c4d5e6f '), 'asyntai_1a2b3c4d5e6f');
  assert.equal(normalizeWidgetId('asyntai_x");alert(1);//'), '');
  assert.equal(normalizeWidgetId('a b'), '');
  assert.equal(normalizeWidgetId(''), '');
  assert.equal(normalizeWidgetId(null), '');
  assert.throws(() => widgetSnippet('bad id'), /Invalid/);
});

test('snippet loads the widget with the id as data-asyntai-id, once', () => {
  const s = widgetSnippet('asyntai_abc123');
  assert.match(s, /^<script>\(function\(\)\{/);
  assert.ok(s.includes('s.setAttribute("data-asyntai-id","asyntai_abc123")'));
  assert.ok(s.includes(JSON.stringify(DEFAULT_SCRIPT_URL)));
  assert.ok(s.includes('if(window.__asyntaiBuilderLoaded)return'));
  assert.ok(!s.includes(' src="'), 'no <script src>: Custom Code drops its data attributes');
});

test('widget block is a Builder Custom Code element and is recognised', () => {
  const b = widgetBlock('asyntai_abc123');
  assert.equal(b['@type'], '@builder.io/sdk:Element');
  assert.equal(b.component.name, 'Custom Code');
  assert.equal(b.component.options.scriptsClientOnly, true);
  assert.ok(isWidgetBlock(b));
  // Recognised even if Builder dropped the meta marker
  assert.ok(isWidgetBlock({ component: { options: { code: b.component.options.code } } }));
  assert.ok(!isWidgetBlock({ component: { name: 'Custom Code', options: { code: '<script>x()</script>' } } }));
  assert.ok(!isWidgetBlock(null));
});

test('add widget appends once, keeps other blocks, and replaces an old widget', () => {
  const p = page();
  assert.equal(hasWidget(p), false);
  const d1 = dataWithWidget(p, 'asyntai_one111');
  assert.equal(d1.blocks.length, p.data.blocks.length + 1);
  assert.equal(d1.title, p.data.title);
  const p2 = Object.assign(page(), { data: d1 });
  assert.equal(hasWidget(p2), true);
  const d2 = dataWithWidget(p2, 'asyntai_two222');
  assert.equal(d2.blocks.filter(isWidgetBlock).length, 1);
  assert.ok(d2.blocks.at(-1).component.options.code.includes('asyntai_two222'));
  // The original object is not changed
  assert.equal(p.data.blocks.length, 5);
});

test('remove widget takes out only the widget', () => {
  const p = Object.assign(page(), { data: dataWithWidget(page(), 'asyntai_one111') });
  const d = dataWithoutWidget(p);
  assert.equal(d.blocks.length, 5);
  assert.equal(d.blocks.some(isWidgetBlock), false);
});

test('works with page data that has no blocks yet', () => {
  const d = dataWithWidget({ id: 'x', data: { title: 'Empty' } }, 'asyntai_abc123');
  assert.equal(d.blocks.length, 1);
  assert.deepEqual(dataWithoutWidget({ id: 'x' }).blocks, []);
});

test('mobx-style data (with toJSON) is read as plain data', () => {
  const raw = page().data;
  const wrapped = { id: 'm', data: { toJSON: () => raw, blocks: 'not-plain' } };
  assert.equal(dataWithWidget(wrapped, 'asyntai_abc123').blocks.length, 6);
});

test('htmlToText strips tags, scripts and decodes entities', () => {
  assert.equal(htmlToText('<p>A&amp;B&nbsp;C</p><p>&#8211; &#x41;</p>'), 'A&B C\n– A');
  assert.equal(htmlToText('<style>p{}</style><script>bad()</script><b>ok</b>'), 'ok');
  assert.equal(htmlToText('<ul><li>One</li><li>Two</li></ul>'), '- One\n- Two');
});

test('page text: titles, nested columns and children, no code, no urls, no duplicates', () => {
  const text = extractPageText(page());
  const lines = text.split('\n');
  assert.deepEqual(lines.slice(0, 2), ['About Acme & Co', 'Who we are']);
  for (const want of ['Welcome to Acme', 'We fix bikes fast.', 'Open Mon–Fri 9–5', 'Book a repair', '- Road bikes', '- E-bikes']) {
    assert.ok(lines.includes(want), 'missing: ' + want + '\n' + text);
  }
  assert.ok(!text.includes('alert'), 'custom code must not become knowledge');
  assert.ok(!text.includes('cdn.builder.io'));
  assert.ok(!text.includes('/book'));
  assert.equal(lines.filter((l) => l === 'We fix bikes fast.').length, 1);
});

test('page text never includes the Asyntai widget block itself', () => {
  const p = Object.assign(page(), { data: dataWithWidget(page(), 'asyntai_abc123') });
  assert.ok(!extractPageText(p).includes('asyntai'));
});

test('knowledge title uses page title and path; falls back to name and query', () => {
  assert.equal(knowledgeTitle(page()), 'About Acme &amp; Co /about (Builder.io)');
  const p = { name: 'Pricing', query: [{ property: 'urlPath', value: ['/pricing'] }], data: {} };
  assert.equal(pagePath(p), '/pricing');
  assert.equal(knowledgeTitle(p), 'Pricing /pricing (Builder.io)');
  assert.equal(knowledgeTitle({ data: {} }), 'Untitled page (Builder.io)');
  assert.ok(knowledgeTitle({ data: { title: 'x'.repeat(400) } }).length <= 250);
});

// --- Asyntai API -----------------------------------------------------------

function fakeApi(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null });
    const key = init.method + ' ' + url.replace('https://asyntai.com', '').split('?')[0];
    const r = responses[key];
    if (r instanceof Error) throw r;
    const [status, json] = r || [404, { success: false, error: 'not found' }];
    return { ok: status >= 200 && status < 300, status, json: async () => json };
  };
  return { calls, fetchImpl };
}

test('sync adds the page as text with the right headers and body', async () => {
  const { calls, fetchImpl } = fakeApi({
    'GET /api/v1/knowledge/': [200, { success: true, entries: [{ id: 'other', title: 'Something else' }] }],
    'POST /api/v1/knowledge/text/': [200, { success: true, id: 'ctx1', chunks_created: 2 }],
  });
  const r = await syncPage(page(), { apiKey: 'key_123', fetchImpl });
  assert.equal(r.id, 'ctx1');
  assert.equal(r.replaced, 0);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://asyntai.com/api/v1/knowledge/?limit=100');
  assert.equal(calls[1].headers.Authorization, 'Bearer key_123');
  assert.equal(calls[1].headers['Content-Type'], 'application/json');
  assert.equal(calls[1].body.title, 'About Acme &amp; Co /about (Builder.io)');
  assert.ok(calls[1].body.content.includes('Open Mon–Fri 9–5'));
  assert.equal('website_id' in calls[1].body, false);
});

test('sync replaces an earlier copy of the same page (no duplicates)', async () => {
  const title = knowledgeTitle(page());
  const { calls, fetchImpl } = fakeApi({
    'GET /api/v1/knowledge/': [200, { success: true, entries: [{ id: 'old1', title }, { id: 'keep', title: 'Other' }] }],
    'DELETE /api/v1/knowledge/old1/': [200, { success: true }],
    'POST /api/v1/knowledge/text/': [200, { success: true, id: 'new1', chunks_created: 1 }],
  });
  const r = await syncPage(page(), { apiKey: 'k', fetchImpl, websiteId: '42' });
  assert.equal(r.replaced, 1);
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'DELETE', 'POST']);
  assert.equal(calls[0].url, 'https://asyntai.com/api/v1/knowledge/?limit=100&website_id=42');
  assert.equal(calls[2].body.website_id, '42');
});

test('sync reports API errors in plain words', async () => {
  const bad = fakeApi({ 'GET /api/v1/knowledge/': [401, { success: false, error: 'Invalid API key' }] });
  await assert.rejects(syncPage(page(), { apiKey: 'nope', fetchImpl: bad.fetchImpl }), (e) => e instanceof AsyntaiError && e.status === 401 && e.message === 'Invalid API key');
  const plan = fakeApi({ 'GET /api/v1/knowledge/': [403, { success: false, error: 'API access requires a paid plan' }] });
  await assert.rejects(syncPage(page(), { apiKey: 'k', fetchImpl: plan.fetchImpl }), /paid plan/);
  const down = fakeApi({ 'GET /api/v1/knowledge/': new TypeError('Failed to fetch') });
  await assert.rejects(syncPage(page(), { apiKey: 'k', fetchImpl: down.fetchImpl }), /Could not reach Asyntai/);
  const html = { fetchImpl: async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json'); } }) };
  await assert.rejects(syncPage(page(), { apiKey: 'k', fetchImpl: html.fetchImpl }), /HTTP 502/);
});

test('sync refuses without key or without text, before any request', async () => {
  const { calls, fetchImpl } = fakeApi({});
  await assert.rejects(syncPage(page(), { apiKey: '', fetchImpl }), /API key/);
  await assert.rejects(syncPage({ data: { blocks: [] } }, { apiKey: 'k', fetchImpl }), /no text/);
  assert.equal(calls.length, 0);
});

// --- Registration with a fake Builder ---------------------------------------

function fakeEditor(settings) {
  const registered = [];
  const drafts = [];
  const messages = [];
  let dialogFor = null;
  const builder = { register: (type, cfg) => registered.push({ type, cfg }) };
  const state = {
    user: { organization: { value: { settings: { plugins: new Map(settings ? [[PLUGIN_ID, new Map(Object.entries(settings))]] : []) } } } },
    updateLatestDraft: async (d) => { drafts.push(d); },
    snackBar: { show: (m) => messages.push(m) },
    dialogs: { alert: async (m) => messages.push('ALERT ' + m) },
  };
  const find = (type, label) => registered.find((r) => r.type === type && (!label || r.cfg.label === label));
  return { builder, state, registered, drafts, messages, find, get dialogFor() { return dialogFor; }, trigger: async (id) => { dialogFor = id; } };
}

const PAGE_MODEL = { kind: 'page', name: 'page' };

test('register adds settings, onLoad, three entry actions and one bulk action', () => {
  const ed = fakeEditor({ widgetId: 'asyntai_abc123' });
  register(ed.builder, ed.state, async () => {});
  const types = ed.registered.map((r) => r.type);
  assert.deepEqual(types, ['plugin', 'app.onLoad', 'content.action', 'content.action', 'content.action', 'content.bulkAction']);
  const plugin = ed.find('plugin').cfg;
  assert.equal(plugin.id, PLUGIN_ID);
  assert.equal(plugin.name, 'Asyntai AI Chatbot');
  assert.deepEqual(plugin.settings.map((s) => s.name), ['widgetId', 'apiKey', 'websiteId']);
  assert.equal(plugin.settings[0].required, true);
  assert.equal(plugin.settings[1].type, 'password');
});

test('settings dialog opens on load only while the widget id is missing', async () => {
  const empty = fakeEditor(null);
  register(empty.builder, empty.state);
  await empty.find('app.onLoad').cfg({ triggerSettingsDialog: empty.trigger });
  assert.equal(empty.dialogFor, PLUGIN_ID);
  const set = fakeEditor({ widgetId: 'asyntai_abc123' });
  register(set.builder, set.state);
  await set.find('app.onLoad').cfg({ triggerSettingsDialog: set.trigger });
  assert.equal(set.dialogFor, null);
});

test('getSettings drops a widget id that is not safe', () => {
  const ed = fakeEditor({ widgetId: 'x"; alert(1)', apiKey: ' k ', websiteId: '7' });
  assert.deepEqual(getSettings(ed.state), { widgetId: '', apiKey: 'k', websiteId: '7' });
  assert.deepEqual(getSettings({}), { widgetId: '', apiKey: '', websiteId: '' });
});

test('"Add chatbot" shows on pages without the widget and writes the draft', async () => {
  const ed = fakeEditor({ widgetId: 'asyntai_abc123' });
  register(ed.builder, ed.state);
  const add = ed.find('content.action', 'Add Asyntai AI Chatbot here').cfg;
  const remove = ed.find('content.action', 'Remove Asyntai AI Chatbot').cfg;
  assert.equal(add.showIf(page(), PAGE_MODEL), true);
  assert.equal(add.showIf(page(), { kind: 'component' }), true);
  assert.equal(add.showIf(page(), { kind: 'data' }), false);
  assert.equal(remove.showIf(page(), PAGE_MODEL), false);
  await add.onClick(page());
  assert.equal(ed.drafts.length, 1);
  assert.equal(ed.drafts[0].id, 'abc123');
  assert.equal(ed.drafts[0].modelId, 'model1');
  assert.equal(ed.drafts[0].data.blocks.filter(isWidgetBlock).length, 1);
  assert.match(ed.messages.at(-1), /added/);
  const withWidget = Object.assign(page(), { data: ed.drafts[0].data });
  assert.equal(add.showIf(withWidget, PAGE_MODEL), false);
  assert.equal(remove.showIf(withWidget, PAGE_MODEL), true);
  await remove.onClick(withWidget);
  assert.equal(ed.drafts[1].data.blocks.some(isWidgetBlock), false);
});

test('"Add chatbot" without a widget id asks for settings and writes nothing', async () => {
  const ed = fakeEditor({});
  register(ed.builder, ed.state);
  await ed.find('content.action', 'Add Asyntai AI Chatbot here').cfg.onClick(page());
  assert.equal(ed.drafts.length, 0);
  assert.match(ed.messages.at(-1), /widget ID/);
});

test('knowledge actions show only with an API key, and not on data models', () => {
  const none = fakeEditor({ widgetId: 'asyntai_abc123' });
  register(none.builder, none.state);
  assert.equal(none.find('content.action', 'Add to Asyntai knowledge base').cfg.showIf(page(), PAGE_MODEL), false);
  const ed = fakeEditor({ widgetId: 'asyntai_abc123', apiKey: 'k' });
  register(ed.builder, ed.state);
  const one = ed.find('content.action', 'Add to Asyntai knowledge base').cfg;
  assert.equal(one.showIf(page(), PAGE_MODEL), true);
  assert.equal(one.showIf(page(), { kind: 'component' }), true);
  assert.equal(one.showIf(page(), { kind: 'data' }), false);
  const bulk = ed.find('content.bulkAction').cfg;
  assert.equal(bulk.showIf(['a'], [page()], PAGE_MODEL), true);
  assert.equal(bulk.showIf([], [], PAGE_MODEL), false);
});

test('single knowledge action sends the page and reports the result', async () => {
  const api = fakeApi({
    'GET /api/v1/knowledge/': [200, { success: true, entries: [] }],
    'POST /api/v1/knowledge/text/': [200, { success: true, id: 'c1', chunks_created: 1 }],
  });
  const ed = fakeEditor({ widgetId: 'asyntai_abc123', apiKey: 'key9', websiteId: '5' });
  register(ed.builder, ed.state, api.fetchImpl);
  await ed.find('content.action', 'Add to Asyntai knowledge base').cfg.onClick(page());
  assert.equal(api.calls.at(-1).body.website_id, '5');
  assert.equal(api.calls.at(-1).headers.Authorization, 'Bearer key9');
  assert.match(ed.messages.at(-1), /^Added "About/);
});

test('single knowledge action shows the API error instead of throwing', async () => {
  const api = fakeApi({ 'GET /api/v1/knowledge/': [401, { success: false, error: 'Invalid API key' }] });
  const ed = fakeEditor({ widgetId: 'asyntai_abc123', apiKey: 'bad' });
  register(ed.builder, ed.state, api.fetchImpl);
  await ed.find('content.action', 'Add to Asyntai knowledge base').cfg.onClick(page());
  assert.equal(ed.messages.at(-1), 'Asyntai: Invalid API key');
});

test('bulk action sends each selected entry, counts failures and refreshes', async () => {
  const api = fakeApi({
    'GET /api/v1/knowledge/': [200, { success: true, entries: [] }],
    'POST /api/v1/knowledge/text/': [200, { success: true, id: 'c', chunks_created: 1 }],
  });
  const ed = fakeEditor({ widgetId: 'asyntai_abc123', apiKey: 'k' });
  register(ed.builder, ed.state, api.fetchImpl);
  let refreshed = 0;
  const empty = { id: 'e1', name: 'Blank', data: { blocks: [] } };
  const other = Object.assign(page(), { id: 'p2' });
  await ed.find('content.bulkAction').cfg.onClick({ refreshList: () => { refreshed += 1; } }, ['abc123', 'e1'], [page(), empty, other]);
  assert.equal(api.calls.filter((c) => c.method === 'POST').length, 1, 'only selected entries, only ones with text');
  assert.match(ed.messages.at(-1), /^Asyntai: 1 of 2 added/);
  assert.match(ed.messages.at(-1), /Blank: This page has no text/);
  assert.equal(refreshed, 1);
});

test('falls back to a dialog when the editor has no snack bar', async () => {
  const ed = fakeEditor({});
  delete ed.state.snackBar;
  register(ed.builder, ed.state);
  await ed.find('content.action', 'Add Asyntai AI Chatbot here').cfg.onClick(page());
  assert.match(ed.messages.at(-1), /^ALERT /);
});
