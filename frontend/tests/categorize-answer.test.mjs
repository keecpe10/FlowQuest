import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({
    configFile: false,
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const { default: CategorizeAnswer } = await server.ssrLoadModule(
    '/src/components/mcq/answers/CategorizeAnswer.tsx',
);
const categories = ['สัตว์', 'ผลไม้'];
const items = ['แมว', 'มะม่วง'];
const render = (metadata, value = {}, disabled = false) => renderToStaticMarkup(
    React.createElement(CategorizeAnswer, { metadata, value, disabled, onDragEnd() {} }),
);

test('student question renders both categories and draggable item labels', () => {
    const html = render({ categories, items });
    for (const label of [...categories, ...items]) assert.ok(html.includes(label));
    assert.equal((html.match(/role="button"/g) || []).length, 2);
});

test('teacher preview objects render like student strings without rendering answer objects', () => {
    const metadata = { categories, items: [
        { text: 'แมว', category: 'สัตว์' },
        { text: 'มะม่วง', category: 'ผลไม้' },
    ] };
    const html = render(metadata);
    assert.equal((html.match(/role="button"/g) || []).length, 2);
    assert.ok(html.includes('แมว'));
    assert.ok(!html.includes('&quot;category&quot;'));
});

test('missing or malformed metadata does not crash rendering', () => {
    for (const metadata of [null, undefined, {}, { categories: {}, items: {} },
        { categories: [null, {}], items: [null, {}, { text: {} }, 42] }]) {
        assert.doesNotThrow(() => render(metadata));
    }
});

test('saved assignments render once in the selected category and become disabled', () => {
    const html = render({ categories, items }, { 'แมว': 'สัตว์', 'มะม่วง': 'ผลไม้' }, true);
    assert.ok(html.indexOf('สัตว์') < html.indexOf('แมว'));
    assert.ok(html.indexOf('แมว') < html.indexOf('ผลไม้'));
    assert.ok(html.indexOf('ผลไม้') < html.indexOf('มะม่วง'));
    assert.equal((html.match(/aria-disabled="true"/g) || []).length, 2);
    assert.equal((html.match(/แมว/g) || []).length, 1);
});

test('stale category assignments and object prototype names remain visible', () => {
    const html = render({ categories, items: ['แมว', 'constructor'] }, { 'แมว': 'หมวดเก่า' });
    assert.equal((html.match(/role="button"/g) || []).length, 2);
    assert.ok(html.includes('แมว'));
    assert.ok(html.includes('constructor'));
});

test('student images survive grouping while answer keys remain item text', () => {
    const html = render({ categories, items, item_images: { 'แมว': '/api/v1/uploads/cat.png' } }, { 'แมว': 'สัตว์' });
    assert.match(html, /<img[^>]*src="[^"]*\/api\/v1\/uploads\/cat\.png"[^>]*alt="แมว"[^>]*draggable="false"/);
    assert.equal((html.match(/role="button"/g) || []).length, 2);
    assert.ok(html.indexOf('cat.png" alt=') < html.indexOf('ผลไม้'));
});

test('teacher image objects render without exposing their category as item content', () => {
    const html = render({ categories, items: [{ text: 'แมว', category: 'สัตว์', image_url: '/api/v1/uploads/cat.png' }, 'มะม่วง'] });
    assert.match(html, /<img[^>]*\/api\/v1\/uploads\/cat\.png/);
    assert.ok(!html.includes('&quot;image_url&quot;'));
});
