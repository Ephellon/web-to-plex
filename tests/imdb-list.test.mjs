/*** /tests/imdb-list.test.mjs
 * IL1: cloud/imdb.js on list pages. The rows below have the shape of https://www.imdb.com/list/ls029715673/
 * (2026-10-03): the heading is `.ipc-title--title` around an `h3.ipc-title__text--reduced`, the metadata is
 * `.dli-title-metadata li`, and the JSON-LD ItemList has no dates and names titles in their original language.
 * There is no DOM in `node --test`, so the page is a small element tree with just enough of querySelector(All) and
 * closest for the selectors the script uses.
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Builds an element.
 * @param {string} tag - The tag name
 * @param {object} [attributes] - Attributes (`class` is split into classes)
 * @param {...(object|string)} children - Elements and text
 * @returns {object} The element
 */
function h(tag, attributes = {}, ...children) {
    const element = { tag, attributes, classes: (attributes.class ?? '').split(/\s+/).filter(name => name), children, parent: null };

    for(const child of children)
        if(typeof child == 'object')
            child.parent = element;

    return Object.assign(element, {
        get textContent() {
            return children.map(child => (typeof child == 'string' ? child : child.textContent)).join('');
        },
        get href() {
            return attributes.href;
        },
        get src() {
            return attributes.src;
        },
        querySelectorAll: selector => queryAll(element, selector),
        querySelector: selector => queryAll(element, selector)[0] ?? null,
        closest: selector => {
            for(let node = element; node; node = node.parent)
                if(matches(node, selector))
                    return node;

            return null;
        },
    });
}

/**
 * Tests one compound selector (`tag.class[attr*="value"]`) against an element.
 * @param {object} element - The element
 * @param {string} compound - The compound selector
 * @returns {boolean} Whether it matches
 */
function matchesCompound(element, compound) {
    const tag = /^[a-z][\w-]*/i.exec(compound)?.[0];

    if(tag && tag != element.tag)
        return false;

    for(const [, name] of compound.matchAll(/\.([\w-]+)/g))
        if(!element.classes.includes(name))
            return false;

    for(const [, name, operator, value] of compound.matchAll(/\[([\w-]+)([*^]?=)"([^"]*)"\]/g)) {
        const actual = element.attributes[name] ?? '';

        if(operator == '*=' ? !actual.includes(value) : operator == '^=' ? !actual.startsWith(value) : actual != value)
            return false;
    }

    return true;
}

/**
 * Tests a selector list (descendant combinators only) against an element.
 * @param {object} element - The element
 * @param {string} selector - The selector list
 * @returns {boolean} Whether any selector matches
 */
function matches(element, selector) {
    return selector.split(',').some(complex => {
        const parts = complex.trim().split(/\s+/);
        let node = element;

        if(!matchesCompound(node, parts.pop()))
            return false;

        while(parts.length) {
            do
                node = node.parent;
            while(node && !matchesCompound(node, parts.at(-1)));

            if(!node)
                return false;

            parts.pop();
        }

        return true;
    });
}

/**
 * Lists the descendants of `root` that match `selector`, in document order.
 * @param {object} root - The element searched
 * @param {string} selector - The selector list
 * @returns {object[]} The matches
 */
function queryAll(root, selector) {
    const found = [];
    const visit = element => element.children.forEach(child => typeof child == 'object' && (matches(child, selector) && found.push(child), visit(child)));

    visit(root);

    return found;
}

/**
 * Loads cloud/imdb.js against a page.
 * @param {string} pathname - The page path
 * @param {object} body - The page body
 * @returns {object} The script
 */
function load(pathname, body) {
    const source = fs.readFileSync('src/cloud/imdb.js', 'utf8');

    return new Function('document', 'top', `${ source }\nreturn script;`)(body, { location: { pathname } });
}

// A row as the live list renders it
const row = (n, IMDbID, title, metadata) => h('li', { class: 'ipc-metadata-list-summary-item' },
    h('img', { class: 'ipc-image', src: `https://example.invalid/${ IMDbID }.jpg` }),
    h('a', { href: `/title/${ IMDbID }/?ref_=ttls_li_tt` }, h('div', { class: 'ipc-title ipc-title--base ipc-title--title' }, h('h3', { class: 'ipc-title__text--reduced' }, `${ n }. ${ title }`))),
    h('div', { class: 'dli-title-metadata' }, h('ul', {}, ...metadata.map(text => h('li', {}, text)))),
    h('div', { 'data-testid': 'title-list-item-description' }, 'List creator notes'));

const ROWS = [
    row(1, 'tt5814060', 'The Nun', ['2018', '1h 36m', 'R']),
    row(2, 'tt2661044', 'The 100', ['2014–2020', '100 eps', 'TV-14']),
    row(3, 'tt5723272', 'In the Fade', ['2017', '1h 46m', 'R']),
];

const EXPECTED = [
    { type: 'movie', title: 'The Nun', year: 2018, IMDbID: 'tt5814060' },
    { type: 'show', title: 'The 100', year: 2014, IMDbID: 'tt2661044' },
    { type: 'movie', title: 'In the Fade', year: 2017, IMDbID: 'tt5723272' },
];

const strip = items => items.map(({ image, ...item }) => item);

test('rendered rows: title from .ipc-title--title, year from .dli-title-metadata li, a year range is a show', () => {
    const script = load('/list/ls029715673/', h('body', {}, h('ul', {}, ...ROWS)));

    assert.equal(script.getType(), 'list');
    assert.equal(script.ready(), true);
    assert.deepEqual(strip(script.init()), EXPECTED);
    assert.equal(script.init()[0].image, 'https://example.invalid/tt5814060.jpg');
});

test('with the ItemList (no dates, original-language names), the rows give the year and the shown title', () => {
    const ld = h('script', { type: 'application/ld+json' }, JSON.stringify({ '@type': 'ItemList', itemListElement: [
        { '@type': 'ListItem', item: { '@type': 'Movie', url: 'https://www.imdb.com/title/tt5814060/', name: 'The Nun' } },
        { '@type': 'ListItem', item: { '@type': 'TVSeries', url: 'https://www.imdb.com/title/tt2661044/', name: 'The 100' } },
        { '@type': 'ListItem', item: { '@type': 'Movie', url: 'https://www.imdb.com/title/tt5723272/', name: 'Aus dem Nichts' } },
    ] }));
    const script = load('/list/ls029715673/', h('body', {}, ld, h('ul', {}, ...ROWS)));

    assert.deepEqual(strip(script.init()), EXPECTED);
});

test('the older row shape (h3.ipc-title__text, .dli-title-metadata-item) still reads', () => {
    const old = h('li', { class: 'ipc-metadata-list-summary-item' },
        h('a', { href: '/title/tt0903747/' }, h('h3', { class: 'ipc-title__text' }, '1. Breaking Bad')),
        h('div', {}, h('span', { class: 'dli-title-metadata-item' }, '2008–2013'), h('span', { class: 'dli-title-metadata-item' }, '62 eps')));
    const script = load('/list/ls000000001/', h('body', {}, h('ul', {}, old)));

    assert.deepEqual(strip(script.init()), [{ type: 'show', title: 'Breaking Bad', year: 2008, IMDbID: 'tt0903747' }]);
});

test('a list with no rows yet asks for a retry', () => {
    const script = load('/list/ls000000003/', h('body', {}, h('p', {}, 'no rows yet')));

    assert.equal(script.ready(), false);
    assert.equal(script.init(), 1000);
});
