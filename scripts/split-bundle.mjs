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
/* eslint-disable no-process-exit */
import * as fs from 'fs';

const TARGET_COMMENT = '/* split-bundle.mjs split-bundle-file */';
const SOURCE_FILE = './dist/index.js';
const BUNDLE_FILE = './dist/bundle.js';
const MAIN_FILE = './dist/main.js';

(() => {
  try {
    const source = fs.readFileSync(SOURCE_FILE, 'utf8');
    const parts = source.split(TARGET_COMMENT);

    if (parts.length !== 2) {
      console.error(`Not found this comment: ${TARGET_COMMENT}`);
      process.exit(1);
    }

    fs.writeFileSync(BUNDLE_FILE, parts[0], 'utf8');
    // fs.writeFileSync(MAIN_FILE, parts[1], 'utf8');
    fs.unlinkSync(SOURCE_FILE);
    console.log(`The 2 files, ${SOURCE_FILE} and ${MAIN_FILE}, are created successfully.`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
