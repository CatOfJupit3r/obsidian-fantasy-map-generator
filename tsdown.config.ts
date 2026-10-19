import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: { main: 'src/main.ts' },
    outDir: 'dist',
    format: 'cjs',
    platform: 'node',
    target: 'es2022',
    dts: false,
    deps: { neverBundle: ['obsidian', 'electron', /^@codemirror\//u] },
    clean: false,
    outExtensions: () => ({ js: '.js' }),
    copy: ['manifest.json', 'styles.css'],
  },
  {
    entry: { 'azgaar-fmg-bridge': 'src/fmg-bridge/fmg-bridge.ts' },
    outDir: 'dist/bridge',
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    clean: false,
    outputOptions: { entryFileNames: '[name].js' },
  },
]);
