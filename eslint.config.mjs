import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'next-env.d.ts',
      // Root-level operational Node scripts (migrations, seeds, smoke tests)
      // are CommonJS by design and are not part of the Next build.
      'migrate-*.mjs',
      'migrate-*.js',
      'seed-*.js',
      'test-*.js',
      // Vendored ffmpeg.wasm ESM glue, served as-is to the browser.
      'public/ffmpeg/**',
    ],
  },
  {
    rules: {
      // react-hooks v6 introduced this rule; the codebase's load-then-setState
      // effects predate it. Downgraded to a warning until those data-loading
      // paths are refactored (e.g. to loaders) — do not silence new code.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];
