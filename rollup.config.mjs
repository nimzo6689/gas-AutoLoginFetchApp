/* eslint-disable node/no-unpublished-import */
/**
 * Copyright 2023 nimzo6689
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import typescript from 'rollup-plugin-typescript2';
import cleanup from 'rollup-plugin-cleanup';
import license from 'rollup-plugin-license';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { fileURLToPath } from 'url';

export default {
  input: ['gas/index.ts'],
  output: {
    file: 'dist_clasp/bundle.js',
    format: 'iife',
  },
  plugins: [
    cleanup({
      extensions: ['.ts'],
    }),
    license({
      banner: {
        content: {
          file: fileURLToPath(new URL('license-header.txt', import.meta.url)),
        },
      },
    }),
    nodeResolve({
      preferBuiltins: false,
    }),
    commonjs(),
    typescript(),
    json(),
  ],
  context: 'this',
};
