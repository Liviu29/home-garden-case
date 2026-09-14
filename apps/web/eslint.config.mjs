import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';
import baseConfig from '../../eslint.config.mjs';

/**
 * The web app's lint: the workspace rules, Angular's, typescript-eslint's
 * type-aware rules, and the layer boundaries ARCHITECTURE.md §3 describes.
 *
 * The boundaries are the part worth reading. Dependencies point one way —
 * features → state → domain and core — and each layer below says what it
 * may not reach for. A violation is an error, not a code-review note.
 */

/** A layer's rule: which imports it may not have, and why. */
const mayNotImport = (files, patterns, ignores = []) => ({
  files,
  ignores,
  rules: {
    'no-restricted-imports': ['error', { patterns }],
  },
});

const APP = 'src/app';

export default tseslint.config(
  ...baseConfig,

  // ── Angular, and the type-aware rules ──────────────────────────────────
  {
    files: ['src/**/*.ts', '.storybook/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      // ARCHITECTURE §9: signal inputs and outputs, inject(), OnPush, host: {}.
      '@angular-eslint/prefer-signals': 'error',
      '@angular-eslint/prefer-output-emitter-ref': 'error',
      '@angular-eslint/prefer-inject': 'error',
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@angular-eslint/prefer-host-metadata-property': 'error',
      '@angular-eslint/no-lifecycle-call': 'error',
    },
  },
  {
    // Type-aware rules need a program: the app's and the specs' tsconfigs
    // cover src/; the stories have a program of their own under .storybook
    // and get the syntactic rules only.
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.stories.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.spec.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // `if (loading)` on a signal is always true; the call was forgotten.
      '@angular-eslint/no-uncalled-signals': 'error',
      // A promise nobody awaits or voids is a silent failure path.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      // A switch over a union must name every member (or assertNever).
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true },
      ],
      // Type-only imports are erased: they are not a dependency between layers.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', prefer: 'type-imports' },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      // Templates and messages interpolate numbers and enums freely.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true, allowNullish: true },
      ],
      '@typescript-eslint/unbound-method': ['error', { ignoreStatic: true }],
    },
  },
  {
    files: ['src/**/*.spec.ts'],
    rules: {
      // Specs hand mocks to Angular and await what they must; an `async`
      // mock that returns a value without awaiting is how a promise is faked.
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },

  // ── Templates ───────────────────────────────────────────────────────────
  {
    files: ['src/**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {
      '@angular-eslint/template/prefer-control-flow': 'error',
      '@angular-eslint/template/prefer-self-closing-tags': 'error',
      '@angular-eslint/template/prefer-at-empty': 'error',
      '@angular-eslint/template/button-has-type': 'error',
    },
  },

  // ── Layer boundaries (ARCHITECTURE.md §3) ───────────────────────────────
  {
    // The API's contract enters the app in one place, as types: core/api
    // turns its DTOs into the app's models. Nothing else reads it.
    files: ['src/**/*.ts'],
    ignores: [`${APP}/core/api/**`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@itp-home-garden/api-contract'],
              message: 'Only core/api reads the API contract; everything else uses the models.',
            },
          ],
        },
      ],
    },
  },
  mayNotImport(
    [`${APP}/domain/**/*.ts`],
    [
      {
        group: ['**/features/**', '**/state/**', '**/shared/**'],
        message: 'domain/ is pure: it knows no screens, stores or UI.',
      },
      {
        // `import type` is erased at build time: not a dependency, only a shape.
        group: ['**/core/**'],
        allowTypeImports: true,
        message: 'domain/ takes only types from core/ (import type), never a service or a value.',
      },
      {
        group: ['@angular/*', '@ngrx/*', 'rxjs', 'rxjs/*'],
        message: 'domain/ does not depend on the framework.',
      },
    ],
    [`${APP}/domain/**/*.spec.ts`],
  ),
  {
    // Text belongs where it is rendered; the catalog is the one documented
    // exception (it is content, not a rule — ARCHITECTURE §3).
    files: [`${APP}/domain/**/*.ts`],
    ignores: [`${APP}/domain/catalog/plant-catalog.ts`, `${APP}/domain/**/*.spec.ts`],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: '$localize', message: 'domain/ returns keys; the UI turns them into words.' },
      ],
    },
  },
  mayNotImport(
    [`${APP}/shared/**/*.ts`],
    [
      {
        group: [
          '**/features/**',
          '**/state/**',
          '**/core/api/*-api',
          '**/core/auth/**',
          '**/core/http/**',
          '**/core/resilience/**',
          '**/core/weather/**',
          '**/core/layout/**',
        ],
        message:
          'shared/ui is presentational: inputs in, outputs out. It may use domain functions, models, the Logger and the toast queue — never a feature, a store, or an API.',
      },
    ],
  ),
  mayNotImport(
    [`${APP}/state/**/*.ts`],
    [{ group: ['**/features/**', '**/shared/**'], message: 'state/ knows no screens.' }],
  ),
  mayNotImport(
    [`${APP}/core/**/*.ts`],
    [
      {
        group: ['**/features/**', '**/state/**', '**/shared/**'],
        message: 'core/ is the foundation: nothing above it (the shell is the one exception).',
      },
    ],
    [`${APP}/core/layout/**/*.ts`],
  ),
  mayNotImport(
    [`${APP}/core/layout/**/*.ts`],
    [
      {
        group: ['**/features/**', '!**/features/profile/profile-dialog', '**/state/**'],
        message:
          'The shell composes shared/ui and lazy-loads the profile dialog (documented exception); it imports no other feature and no store.',
      },
    ],
  ),
);
