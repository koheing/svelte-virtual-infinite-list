import svelte from 'rollup-plugin-svelte'
import resolve from '@rollup/plugin-node-resolve'
import sveld from 'sveld'
import pkg from './package.json'

export default [
  {
    input: 'src/index.js',
    output: [
      { file: pkg.module, format: 'es' },
      { file: pkg.main, format: 'umd', name: 'svelte-virtual-infinite-list' },
    ],
    plugins: [
      svelte({ emitCss: false }),
      resolve(),
      sveld({
        markdown: true,
        json: true,
      }),
    ],
  },
  // tests
  {
    input: '__tests__/src/main.js',
    output: {
      file: '__tests__/public/bundle.js',
      format: 'iife'
    },
    plugins: [
      resolve(),
      svelte({ emitCss: false })
    ]
  }
]
