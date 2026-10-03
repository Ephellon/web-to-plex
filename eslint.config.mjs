/*** /eslint.config.mjs
 * Lints `src/` and codifies the house style (docs/STYLEGUIDE.md).
 *
 * Content scripts that load together share one global scope, so a name declared at the top of
 * `utils.js` is visible in `sites/imdb/index.js`. The globals for each file are derived from
 * `manifest.json` and the extension pages: every top-level declaration and every `window.NAME =`
 * in the files loaded alongside it.
 *
 * Correctness findings in the legacy files are warnings until Phase 2 clears them; see REVAMP.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import * as espree from 'espree';
import js from '@eslint/js';
import globals from 'globals';
import stylistic from '@stylistic/eslint-plugin';
import house from './scripts/eslint/style.mjs';

const ROOT = 'src';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const GLOBAL_OBJECTS = new Set(['window', 'top', 'globalThis', 'self']);

/**
 * Lists the names a classic script contributes to the shared global scope.
 * @param {string} file - The script, relative to ROOT
 * @returns {Set<string>} The declared names
 */
function declaredNames(file) {
    const names = new Set;
    let source, program;

    try {
        source = read(file);
        program = espree.parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
    } catch {
        return names;
    }

    for(const node of program.body)
        collectStatement(node, names, true);

    walk(program, node => {
        const { callee, arguments: [target, what] = [] } = node.type == 'CallExpression' ? node : {};

        if(callee?.object?.name != 'Object' || !GLOBAL_OBJECTS.has(target?.name))
            return;

        if(/^(assign|defineProperties)$/.test(callee.property?.name) && what?.type == 'ObjectExpression')
            what.properties.forEach(({ key }) => key && names.add(key.name ?? key.value));
        else if(callee.property?.name == 'defineProperty' && typeof what?.value == 'string')
            names.add(what.value);
    });

    for(const [, name] of source.matchAll(/\b(?:window|globalThis|self|top)\.([A-Za-z_$][\w$]*)\s*(?:\?\?|\|\||&&)?=[^=]/g))
        names.add(name);

    return names;
}

/**
 * Visits every node of a syntax tree.
 * @param {object} node - The root node
 * @param {function} visit - Called with each node
 */
function walk(node, visit) {
    if(!node || typeof node.type != 'string')
        return;

    visit(node);

    for(const key in node)
        if(key != 'parent')
            for(const child of [].concat(node[key]))
                if(child && typeof child == 'object')
                    walk(child, visit);
}

/**
 * Collects the global names a statement declares. Sloppy-mode scripts also leak function
 * declarations out of top-level blocks (Annex B).
 * @param {object} node - The statement
 * @param {Set<string>} names - Receives the names
 * @param {boolean} [topLevel=false] - Whether the statement sits at the top of the script
 */
function collectStatement(node, names, topLevel = false) {
    switch(node?.type) {
        case 'VariableDeclaration': {
            if(topLevel || node.kind == 'var')
                node.declarations.forEach(({ id }) => collectPattern(id, names));
        } break;

        case 'FunctionDeclaration': {
            names.add(node.id.name);
        } break;

        case 'ClassDeclaration': {
            topLevel && names.add(node.id.name);
        } break;

        case 'LabeledStatement': {
            collectStatement(node.body, names);
        } break;

        case 'BlockStatement': {
            node.body.forEach(child => collectStatement(child, names));
        } break;

        case 'IfStatement': {
            collectStatement(node.consequent, names);
            collectStatement(node.alternate, names);
        } break;
    } // switch node?.type
}

/**
 * Collects the names bound by a declaration pattern.
 * @param {object} node - The pattern
 * @param {Set<string>} names - Receives the names
 */
function collectPattern(node, names) {
    switch(node?.type) {
        case 'Identifier': { names.add(node.name) } break;
        case 'ObjectPattern': { node.properties.forEach(p => collectPattern(p.value ?? p.argument, names)) } break;
        case 'ArrayPattern': { node.elements.forEach(e => collectPattern(e, names)) } break;
        case 'RestElement': { collectPattern(node.argument, names) } break;
        case 'AssignmentPattern': { collectPattern(node.left, names) } break;
    } // switch node?.type
}

/**
 * Lists the scripts an extension page loads, relative to ROOT.
 * @param {string} page - The page, relative to ROOT
 * @returns {string[]} The scripts, in load order
 */
function pageScripts(page) {
    const folder = path.posix.dirname(page);

    return [...read(page).matchAll(/<script[^>]*\bsrc=['"]([^'"]+)['"]/gi)].map(([, src]) => path.posix.join(folder, src));
}

// Each group of scripts that share a scope: one per content-script entry, the background page, and each extension page
const manifest = JSON.parse(read('manifest.json'));
const groups = manifest.content_scripts.map(({ js }) => js);

groups.push(manifest.background?.scripts ?? [], pageScripts('options/index.html'), pageScripts('popup/index.html'));

const sharedGlobals = {};

for(const group of groups) {
    const names = {};

    for(const file of group)
        for(const name of declaredNames(file))
            names[name] = 'writable';
    for(const file of group)
        Object.assign(sharedGlobals[file] ??= {}, names);
}

const legacy = {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^\\$' }],     // Replace callbacks list every positional parameter
    'no-useless-escape': 'warn',
    'no-unused-labels': 'off',
    'no-constant-binary-expression': 'off',     // `(false || a || b)` is used for alignment
    'no-constant-condition': 'off',
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-setter-return': 'warn',
    'no-useless-assignment': 'warn',
    'no-extra-boolean-cast': 'warn',
    'no-unreachable': 'warn',
    'no-cond-assign': 'warn',
    'no-delete-var': 'warn',
    'no-redeclare': ['warn', { builtinGlobals: false }],
    'no-global-assign': 'warn',
    'no-dupe-keys': 'warn',
    'no-sparse-arrays': 'warn',
    'no-control-regex': 'warn',
    'no-case-declarations': 'warn',
    'no-unused-private-class-members': 'warn',
    'no-fallthrough': 'warn',
    'no-unassigned-vars': 'warn',
    'no-useless-catch': 'warn',
    'no-unsafe-optional-chaining': 'warn',
    'no-async-promise-executor': 'warn',
    'no-prototype-builtins': 'warn',
    'no-self-assign': 'warn',
    'no-func-assign': 'warn',
    'no-inner-declarations': 'off',
    'preserve-caught-error': 'off',
    'no-misleading-character-class': 'warn',
    'getter-return': 'warn',
    'no-undef': 'warn',
};

// The house style (docs/STYLEGUIDE.md). Warnings; `npm run format` fixes what it safely can
const PADDED = ['const', 'let', 'var', 'if', 'for', 'while'];
const DECLARATIONS = ['const', 'let', 'var'];
const style = {
    '@stylistic/indent': ['warn', 4, { SwitchCase: 1, MemberExpression: 1, CallExpression: { arguments: 'off' }, offsetTernaryExpressions: false, VariableDeclarator: 1, ignoreComments: true, ignoredNodes: ['ExpressionStatement > AssignmentExpression > FunctionExpression', 'ExpressionStatement > AssignmentExpression > ArrowFunctionExpression'] }],
    '@stylistic/indent-binary-ops': ['warn', 4],
    '@stylistic/keyword-spacing': ['warn', {
        before: true, after: true,
        overrides: Object.fromEntries(['if', 'for', 'while', 'switch'].map(k => [k, { after: false }])),
    }],
    '@stylistic/space-before-function-paren': ['warn', { anonymous: 'never', named: 'never', asyncArrow: 'never', catch: 'never' }],
    'w2p/semi': ['warn', 'always', { omitLastInOneLineBlock: true, omitLastInOneLineClassBody: true }],
    '@stylistic/operator-linebreak': ['warn', 'before', { overrides: { '=': 'after' } }],
    '@stylistic/space-infix-ops': 'warn',
    '@stylistic/space-unary-ops': ['warn', { words: true, nonwords: false }],
    '@stylistic/array-bracket-spacing': ['warn', 'never'],
    '@stylistic/comma-style': ['warn', 'first', { exceptions: Object.fromEntries([
        'ArrayExpression', 'ArrayPattern', 'ArrowFunctionExpression', 'CallExpression', 'FunctionDeclaration', 'FunctionExpression',
        'ImportDeclaration', 'ObjectExpression', 'ObjectPattern', 'NewExpression', 'ExportNamedDeclaration', 'ExportAllDeclaration',
    ].map(type => [type, true])) }],
    'w2p/body-below': 'warn',
    '@stylistic/comma-spacing': ['warn', { before: false, after: true }],
    'w2p/statement-per-line': 'warn',
    'w2p/comment-indent': 'warn',
    '@stylistic/brace-style': ['warn', '1tbs', { allowSingleLine: true }],
    '@stylistic/padding-line-between-statements': ['warn',
        { blankLine: 'always', prev: '*', next: ['break', 'continue'] },
        { blankLine: 'any', prev: 'block', next: 'break' },
        // Different kinds of block are separated; a run of the same kind needn't be
        ...PADDED.map(kind => ({
            blankLine: 'always', prev: kind,
            next: PADDED.filter(other => other != kind && !(DECLARATIONS.includes(kind) && DECLARATIONS.includes(other))),
        })),
        // A declaration group has a blank line before and after it
        { blankLine: 'always', prev: '*', next: DECLARATIONS },
        { blankLine: 'always', prev: DECLARATIONS, next: '*' },
        { blankLine: 'any', prev: DECLARATIONS, next: DECLARATIONS },
        // So does anything after a statement that spans lines (`…);`, `…];`, `…};`)
        { blankLine: 'always', prev: ['multiline-expression', 'multiline-const', 'multiline-let', 'multiline-var'], next: '*' },
    ],
    'no-var': 'warn',
    'w2p/prefer-const': ['warn', { destructuring: 'all' }],
    'w2p/void-null': 'warn',
    'w2p/switch-case-braces': 'warn',
    'w2p/prefix-update': 'warn',
    'w2p/if-braces': 'warn',
    'w2p/if-block-semi': 'warn',
    'w2p/quotes': 'warn',
    'w2p/regex-callback-params': 'warn',
    'w2p/breadcrumbs': 'warn',
    '@stylistic/comma-dangle': ['warn', 'only-multiline'],
    '@stylistic/object-curly-spacing': ['warn', 'always'],
    '@stylistic/template-curly-spacing': ['warn', 'always'],
    '@stylistic/no-trailing-spaces': 'warn',
    '@stylistic/no-tabs': 'warn',
    '@stylistic/eol-last': ['warn', 'always'],
};

export default [
    {
        // Vendored libraries and build output
        ignores: ['dist/**', 'node_modules/**', `${ ROOT }/**/*.min.js`],
    },
    js.configs.recommended,
    {
        files: [`${ ROOT }/**/*.js`],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'script',
            globals: { ...globals.browser, ...globals.webextensions, _: 'readonly' },
        },
        linterOptions: { reportUnusedDisableDirectives: 'off' },
        plugins: { '@stylistic': stylistic, w2p: house },
        rules: { ...legacy, ...style },
    },
    {
        // Cloud scripts run wrapped in a function by plugn.js `prepare`, so a top-level `return` is legal
        files: [`${ ROOT }/cloud/**/*.js`],
        languageOptions: { parserOptions: { ecmaFeatures: { globalReturn: true } } },
    },
    {
        // src/background holds the MV3 service worker's ES modules, bundled by esbuild (docs/PHASE3.md)
        files: [`${ ROOT }/background/**/*.js`],
        languageOptions: { sourceType: 'module', globals: { ...globals.serviceworker, ...globals.webextensions } },
    },
    {
        // src/lib holds ES modules, bundled by esbuild into classic scripts (docs/PHASE3.md)
        files: [`${ ROOT }/lib/**/*.js`],
        languageOptions: { sourceType: 'module' },
    },
    ...Object.entries(sharedGlobals).map(([file, names]) => ({
        files: [`${ ROOT }/${ file }`],
        languageOptions: { globals: names },
    })),
    {
        files: ['*.mjs', 'scripts/**/*.mjs', 'tests/**/*.mjs'],
        languageOptions: { sourceType: 'module', globals: globals.node },
        plugins: { '@stylistic': stylistic, w2p: house },
        rules: { ...style, 'no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^\\$' }], 'no-constant-binary-expression': 'off' },
    },
];
