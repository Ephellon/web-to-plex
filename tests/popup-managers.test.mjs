/*** /tests/popup-managers.test.mjs
 * S30: popup/index.js builds a cell per manager from its saved URL. It wrote the URL into an HTML string (`href`, `url`)
 * and set the table's innerHTML, so a URL like `"><img src=x onerror=…>` became markup. The cells are now built with
 * DOM calls, and only http: and https: URLs become links. The page is a small DOM stub: elements record attributes and
 * children, and any innerHTML write is recorded (and parsed by nothing).
 */

import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const HOSTILE = 'http://evil.invalid/"><img src=x onerror=alert(1)><a x="';

/**
 * A DOM element stub.
 * @param {string} tag - The tag name
 * @param {object} page - Collects `innerHTML` writes
 * @returns {object} The element
 */
function element(tag, page) {
    const self = {
        tag, attributes: {}, children: [], textContent: '',
        setAttribute: (name, value) => (self.attributes[name] = String(value)),
        getAttribute: name => self.attributes[name] ?? null,
        removeAttribute: name => delete self.attributes[name],
        append: (...nodes) => self.children.push(...nodes),
        insertBefore: (node, before) => self.children.splice(Math.max(0, self.children.indexOf(before)), 0, node),
        get firstChild() {
            return self.children[0] ?? null;
        },
        get innerHTML() {
            return '';
        },
        set innerHTML(html) {
            page.html.push(html);
        },
    };

    return self;
}

/**
 * Runs popup/index.js with `saved` in localStorage (keys as `load` reads them).
 * @param {object} saved - Values by name
 * @returns {object} `{ table, html }`
 */
function popup(saved) {
    const page = { html: [] }
        , table = element('table', page)
        , document = {
            createElement: tag => element(tag, page),
            querySelector: selector => (selector == 'table' ? table : null),
            querySelectorAll: () => [],
            body: {},
        }
        , localStorage = { getItem: key => JSON.stringify(saved[atob(key)] ?? null) };

    new Function('document', 'localStorage', 'top', fs.readFileSync('src/popup/index.js', 'utf8'))(document, localStorage, {});

    return { table, html: page.html };
}

/**
 * Lists every element under a node.
 * @param {object} node - The root
 * @returns {object[]} The elements
 */
const all = node => node.children.flatMap(child => [child, ...all(child)]);

test('a saved URL with markup in it stays an attribute value: no innerHTML, no extra elements, no handlers', () => {
    const { table, html } = popup({ URLs: ['radarr', 'ombi'], 'radarr.url': HOSTILE, 'ombi.url': 'https://ombi.example.invalid/' });
    const elements = all(table);

    assert.deepEqual(html, []);
    assert.deepEqual(elements.map(node => node.tag), ['tbody', 'tr', 'td', 'a', 'img', 'label', 'td', 'a', 'img', 'label']);
    assert.ok(elements.every(node => Object.keys(node.attributes).every(name => !/^on/i.test(name))));

    const [radarr, ombi] = elements.filter(node => node.tag == 'td');

    assert.equal(radarr.attributes.id, 'local-radarr');
    assert.equal(radarr.children[0].attributes.href, HOSTILE);
    assert.equal(radarr.children[0].children[1].textContent, 'radarr');
    assert.equal(ombi.children[0].attributes.href, 'https://ombi.example.invalid/');
    assert.equal(ombi.attributes.url, 'https://ombi.example.invalid/');
});

test('only http: and https: URLs become links', () => {
    const { table } = popup({ URLs: ['plex', 'sonarr', 'medusa'], 'plex.url': 'javascript:alert(1)', 'sonarr.url': 'data:text/html,<b>x</b>', 'medusa.url': 'http://localhost:8081/' });
    const links = all(table).filter(node => node.tag == 'a');

    assert.deepEqual(links.map(link => link.attributes.href ?? null), [null, null, 'http://localhost:8081/']);
    assert.deepEqual(links.map(link => link.attributes.target ?? null), [null, null, '_blank']);
});

test('managers without a URL get no cell; four managers make two rows', () => {
    const { table } = popup({ URLs: ['radarr', 'sonarr', 'ombi', 'plex', 'watcher'], 'radarr.url': 'http://a.invalid/', 'sonarr.url': 'http://b.invalid/', 'ombi.url': 'http://c.invalid/', 'plex.url': 'http://d.invalid/' });
    const rows = all(table).filter(node => node.tag == 'tr');

    assert.deepEqual(rows.map(row => row.children.map(cell => cell.attributes.name)), [['radarr', 'sonarr', 'ombi'], ['plex']]);
});
