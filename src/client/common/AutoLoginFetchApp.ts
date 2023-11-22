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
import * as cheerio from 'cheerio';

type URLFetchRequestOptions = GoogleAppsScript.URL_Fetch.URLFetchRequestOptions;
type HTTPResponse = GoogleAppsScript.URL_Fetch.HTTPResponse;

const Cache = CacheService.getUserCache();

export interface AuthOption {
  accountKey: string;
  accountValue: string;
  passwordKey: string;
  passwordValue: string;
}

export default class AutoLoginFetchApp {
  private static readonly SESSION_KEY = '##__COOKIES__##';
  private static readonly COOKIES_NEED_TO_RETRIEVE = '##__NEED_TO_RETRIEVE__##';
  private readonly maxRetryCount: number = 5;

  private leastIntervalSec: number;
  private lastRequestTime: number;

  private loginUrl: string;
  private authOption: AuthOption;
  private cookies: string;

  constructor(loginUrl: string, authOption: AuthOption) {
    this.loginUrl = loginUrl;
    this.authOption = authOption;

    this.cookies = Cache.get(AutoLoginFetchApp.SESSION_KEY) || AutoLoginFetchApp.COOKIES_NEED_TO_RETRIEVE;

    this.leastIntervalSec = 5;
    this.lastRequestTime = new Date().getTime() - this.leastIntervalSec;
  }

  public fetch(url: string, params?: URLFetchRequestOptions, useCache: boolean = true): HTTPResponse {
    const interval = new Date().getTime() - this.lastRequestTime;
    if (interval < this.leastIntervalSec) {
      Utilities.sleep(1000 * this.leastIntervalSec - interval);
    }

    if (useCache && this.cookies === AutoLoginFetchApp.COOKIES_NEED_TO_RETRIEVE) {
      this.retrieveCookies();
    }

    if (!params) {
      params = {};
    }

    if (useCache) {
      params.headers = params.headers || {};
      params.headers['Cookie'] = this.cookies;
    }

    for (let i = 1; i <= this.maxRetryCount; i++) {
      try {
        console.log(`url: ${url}, params: ${JSON.stringify(params)}`);
        const response = UrlFetchApp.fetch(url, params);
        this.lastRequestTime = new Date().getTime();
        this.saveCookies(response.getAllHeaders());
        return response;
      } catch (err) {
        if (err !== null && typeof err === 'object' && 'getResponseCode' in err) {
          const httpResponse = err as GoogleAppsScript.URL_Fetch.HTTPResponse;
          console.warn(`Tried ${i} times. Reponse Status Code: ${httpResponse.getResponseCode()}.`);
          Utilities.sleep(1000 * 2 ** i + this.leastIntervalSec);
          continue;
        }
        console.error(err);
      }
    }
    throw new Error('Occurred an unexpected error.');
  }

  private retrieveCookies() {
    const loginPage = this.fetch(this.loginUrl, undefined, false);
    const loginFormParams = AutoLoginFetchApp.parseLoginForm(loginPage.getContentText());

    const authParams: { [key: string]: string } = {};
    authParams[this.authOption.accountKey] = this.authOption.accountValue;
    authParams[this.authOption.passwordKey] = this.authOption.passwordValue;

    const req: URLFetchRequestOptions = {
      method: 'post',
      payload: { ...loginFormParams, ...authParams },
      followRedirects: false,
    };

    const headers = this.fetch(this.loginUrl, req).getAllHeaders();
    if (!this.saveCookies(headers)) {
      throw new Error('Failed to retrive its Cookie.');
    }
  }

  private saveCookies(headers: { 'Set-Cookie'?: string }): boolean {
    if (headers['Set-Cookie']) {
      this.cookies = Array.isArray(headers['Set-Cookie']) ? headers['Set-Cookie'].join(';') : headers['Set-Cookie'];
      Cache.put(AutoLoginFetchApp.SESSION_KEY, this.cookies, 21600);
      return true;
    }
    return false;
  }

  private static parseLoginForm(htmlContent: string): { [key: string]: string } {
    const $ = cheerio.load(htmlContent);

    const formData: { [key: string]: string } = {};
    $('form input').each((_, element) => {
      const name = $(element).attr('name');
      if (!name) {
        return;
      }
      const value = $(element).val();
      const type = $(element).attr('type');

      if (type === 'submit' && !name.toLowerCase().includes('login')) {
        return;
      }

      formData[name] = value as string;
    });

    return formData;
  }
}
