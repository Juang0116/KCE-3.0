/* .eslintrc.cjs */
require('@rushstack/eslint-patch/modern-module-resolution');
const fs = require('fs');
const hasTypeAware = fs.existsSync('./tsconfig.eslint.json') || fs.existsSync('./tsconfig.json');

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,

  env: {
    browser: true,
    node: true,
    es2022: true,
  },

  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ...(hasTypeAware && { project: ['./tsconfig.eslint.json', './tsconfig.json'].filter(fs.existsSync) }),
  },

  plugins: [
    '@typescript-eslint',
    'import',
    'unused-imports',
    'jsx-a11y',
    'tailwindcss',
    'eslint-comments',
  ],

  extends: [
    'next',
    'next/core-web-vitals',
    'plugin:@typescript-eslint/recommended',
    ...(hasTypeAware ? ['plugin:@typescript-eslint/recommended-requiring-type-checking'] : []),
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:jsx-a11y/recommended',
    'plugin:tailwindcss/recommended',
    'plugin:eslint-comments/recommended',
    'prettier',
  ],

  settings: {
    // Para que eslint-plugin-import entienda alias y TS
    'import/resolver': {
      typescript: {
        project: './tsconfig.json',
        alwaysTryTypes: true,
      },
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
    },
    // Tailwind: reconoce helpers comunes
    tailwindcss: {
      callees: ['clsx', 'cx', 'cva'],
      config: 'tailwind.config.ts',
    },
  },

  rules: {
    /* ---------- Next / App Router ---------- */
    // No aplica en App Router (no hay pages/ con routing de file-system clásico)
    '@next/next/no-html-link-for-pages': 'off',

    /* ---------- TypeScript ---------- */
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
    '@typescript-eslint/consistent-type-definitions': ['warn', 'type'],
    '@typescript-eslint/no-unused-vars': 'off', // lo gestiona unused-imports
    '@typescript-eslint/no-misused-promises': ['warn', { checksVoidReturn: { attributes: false, properties: false } }],
    ...(hasTypeAware
      ? {
          '@typescript-eslint/no-floating-promises': ['warn', { ignoreIIFE: true }],
          '@typescript-eslint/await-thenable': 'warn',
        }
      : {}),

    /* ---------- Imports ---------- */
    'import/no-unresolved': 'off', // Lo resuelve TS
    'import/no-named-as-default': 'off',
    'import/no-duplicates': 'warn',
    'import/newline-after-import': ['warn', { count: 1 }],
    'import/first': 'warn',
    'import/no-self-import': 'error',
    'import/no-useless-path-segments': ['warn', { noUselessIndex: true }],
    'import/no-cycle': 'warn',
    'import/order': [
      'warn',
      {
        'newlines-between': 'always',
        groups: [
          'builtin', // fs, path
          'external', // react, next, ...
          'internal', // @/...
          'parent',
          'sibling',
          'index',
          'object',
          'type',
        ],
        pathGroups: [{ pattern: '@/**', group: 'internal', position: 'after' }],
        pathGroupsExcludedImportTypes: ['builtin'],
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'import/no-extraneous-dependencies': [
      'warn',
      {
        devDependencies: [
          '**/*.config.*',
          '**/*.config.*.*',
          '**/scripts/**',
          '**/.eslintrc.cjs',
          'postcss.config.js',
          'tailwind.config.ts',
          'next.config.ts',
          'vitest.config.*',
          'jest.config.*',
          '**/*.test.*',
          '**/*.spec.*',
        ],
      },
    ],
    // Evita importar módulos server-only desde componentes cliente
    'no-restricted-imports': [
      'error',
      {
        paths: [
          { name: '@/lib/stripe', message: 'Este módulo es server-only. Úsalo solo en server.' },
          { name: '@/lib/supabaseAdmin', message: 'Este módulo es server-only. Úsalo solo en server.' },
        ],
      },
    ],

    /* ---------- Unused imports/vars ---------- */
    'unused-imports/no-unused-imports': 'warn',
    'unused-imports/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
    ],

    /* ---------- A11y / Web ---------- */
    // jsx-a11y ya aporta un set sensato por defecto

    /* ---------- Tailwind ---------- */
    'tailwindcss/no-custom-classname': 'off', // permitimos brand-*
    'tailwindcss/classnames-order': 'warn',
    'tailwindcss/no-contradicting-classname': 'error',
    'tailwindcss/enforces-shorthand': 'warn',

    /* ---------- Estilo / sane defaults ---------- */
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'eslint-comments/no-unused-disable': 'error',

    /* Evita disables huérfanos */
    reportUnusedDisableDirectives: true,
  },

  overrides: [
    // Rutas API / webhooks: permitimos console.info para logs de servidor
    {
      files: ['src/app/api/**/*.{ts,tsx}', 'src/app/**/route.{ts,tsx}'],
      env: { node: true, browser: false },
      rules: { 'no-console': ['warn', { allow: ['warn', 'error', 'info'] }] },
    },

    // Archivos server-only: se permite importar stripe/supabaseAdmin
    {
      files: ['src/lib/stripe.ts', 'src/lib/supabaseAdmin.ts'],
      env: { node: true, browser: false },
      rules: { 'no-restricted-imports': 'off' },
    },

    // Next App Router: páginas/plantillas que requieren default export
    {
      files: [
        'src/app/**/layout.{ts,tsx}',
        'src/app/**/template.{ts,tsx}',
        'src/app/**/page.{ts,tsx}',
        'src/app/**/loading.{ts,tsx}',
        'src/app/**/error.{ts,tsx}',
        'src/app/**/not-found.{ts,tsx}',
        'src/middleware.{ts,tsx}',
      ],
      rules: {
        'import/no-default-export': 'off',
      },
    },

    // Scripts y configs: devDeps ok
    {
      files: [
        '**/*.config.*',
        '**/*.config.*.*',
        'scripts/**',
        'next.config.ts',
        'tailwind.config.ts',
        'postcss.config.js',
        '.eslintrc.cjs',
      ],
      rules: {
        'import/no-extraneous-dependencies': 'off',
      },
    },

    // Tests
    {
      files: ['**/*.test.*', '**/*.spec.*'],
      env: { jest: true },
      rules: {
        'no-restricted-imports': 'off',
      },
    },
  ],

  ignorePatterns: [
    '.next/**',
    'node_modules/**',
    'public/**',
    'dist/**',
    'coverage/**',
    // Generados / externos
    'supabase/**',
    'scripts/**',
    '**/*.d.ts',
  ],
};
