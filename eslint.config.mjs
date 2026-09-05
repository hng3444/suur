import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The bundled Capacitor client runs in Vite, not the Next image optimizer.
  { files: ['mobile/**/*.{ts,tsx}'], rules: { '@next/next/no-img-element': 'off' } },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'mobile-dist/**',
    'android/**/build/**',
    'android/app/src/main/assets/public/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
