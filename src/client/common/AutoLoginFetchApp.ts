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
import * as cookie from 'cookie';

type URLFetchRequestOptions = GoogleAppsScript.URL_Fetch.URLFetchRequestOptions;
type HTTPResponse = GoogleAppsScript.URL_Fetch.HTTPResponse;

type FormParameters = { [key: string]: string | number | boolean };

export interface CustomOptions {
  /**
   * If communication fails, it is retried up to 5 times by default.
   */
  maxRetryCount: number;
  /**
   * The retrieved cookies are stored by default in the UserCache of the CacheService for 6 hours.
   */
  cacheExpiration: number;
  /**
   * Wait 5 seconds by default from the last request to avoid making a request.
   * This is a measure to avoid overloading the target site with scraping.
   */
  leastIntervalMills: number;
  /**
   * Reuses cached cookies even if it has been expired.
   * When there are expired cookies, the default setting is `false` to trigger the login process.
   */
  reusesExpiredCookies: boolean;
  /**
   * Stores expired cookies.
   * When `true` is set, `reusesExpiredCookies` is automatically forced to `true`.
   * It is normally set to `false` to replicate the behavior of a standard browser.
   */
  storesExpiredCookies: boolean;
}

// We need to retain cookies for a combination of the user executing the Apps Script
// and the target site being logged in, so we will use UserCache.
// Never use ScriptCache and DocumentCache as they could potentially be exploited for session hijacking.
const Cache = CacheService.getUserCache();

export default class AutoLoginFetchApp {
  private readonly loginUrl: string;
  private readonly authOptions: FormParameters;

  // For customOptions
  private readonly maxRetryCount: number = 5;
  private readonly cacheExpiration: number = 21600;
  private readonly leastIntervalMills: number = 5000;
  private readonly reusesExpiredCookies: boolean = false;
  private readonly storesExpiredCookies: boolean = false;

  private readonly cookiesKey: string;
  private cookies?: { Expires?: string }[];
  private lastRequestTime: number;

  constructor(loginUrl: string, authOptions: FormParameters, customOptions?: Partial<CustomOptions>) {
    this.loginUrl = loginUrl;
    this.authOptions = authOptions;
    if (customOptions) {
      Object.assign(this, customOptions);
      this.reusesExpiredCookies ||= this.storesExpiredCookies;
    }

    // For CacheService, the maximum length of a key is 250 characters.
    this.cookiesKey = `AutoLoginFetchApp.${loginUrl}`.substring(0, 250);
    const cachedCookies = Cache.get(this.cookiesKey);
    if (cachedCookies && !this.reusesExpiredCookies) {
      this.cookies = JSON.parse(cachedCookies);
      const hasExpiredCookie = this.cookies?.some(it =>
        Object.entries(it).some(([key, value]) => key === 'Expires' && new Date(value) < new Date())
      );
      if (hasExpiredCookie) {
        // To retrive cookies when fetch() is called.
        this.cookies = undefined;
      }
    }
    // To skip the sleep process before sending the initial request.
    this.lastRequestTime = new Date().getTime() - this.leastIntervalMills;
  }

  public get customOptions(): CustomOptions {
    return Object.assign(
      {},
      this.maxRetryCount,
      this.cacheExpiration,
      this.leastIntervalMills,
      this.reusesExpiredCookies,
      this.storesExpiredCookies
    );
  }

  public clearCachedCookies() {
    Cache.remove(this.cookiesKey);
  }

  public fetch(url: string, params: URLFetchRequestOptions = {}, useCache: boolean = true): HTTPResponse {
    if (useCache && !this.cookies) {
      this.retrieveCookies();
    }

    if (this.cookies) {
      params.headers = params.headers || {};
      params.headers['Cookie'] = this.cookies
        .flatMap(it => Object.entries(it).map(([key, value]) => cookie.serialize(key, value)))
        .join('; ');
    }

    for (let i = 1; i <= this.maxRetryCount; i++) {
      try {
        console.log(`url: ${url}, params: ${JSON.stringify(params)}`);
        this.sleepIfNeeded();
        const response = UrlFetchApp.fetch(url, params);
        console.log(`status: ${response.getResponseCode()}, headers: ${JSON.stringify(response.getAllHeaders())}`);
        this.lastRequestTime = new Date().getTime();
        this.saveCookies(response.getAllHeaders());
        return response;
      } catch (err) {
        if (err !== null && typeof err === 'object' && 'getResponseCode' in err) {
          const httpResponse = err as GoogleAppsScript.URL_Fetch.HTTPResponse;
          console.warn(`Tried ${i} times. Reponse Status Code: ${httpResponse.getResponseCode()}.`);
          Utilities.sleep(1000 * 2 ** i);
          continue;
        }
        console.error(err);
      }
    }
    throw new Error('Occurred an unexpected error.');
  }

  // This is a measure to avoid overloading the target site with scraping.
  private sleepIfNeeded() {
    const interval = new Date().getTime() - this.lastRequestTime;
    if (interval < this.leastIntervalMills) {
      Utilities.sleep(this.leastIntervalMills - interval);
    }
  }

  private retrieveCookies() {
    const loginPage = this.fetch(this.loginUrl, undefined, false);
    const loginFormOptions = AutoLoginFetchApp.parseLoginForm(loginPage.getContentText());

    const req: URLFetchRequestOptions = {
      method: 'post',
      payload: { ...loginFormOptions, ...this.authOptions },
      // Logging in often results in an HTTP 302 redirect, which can cause unnecessary redirection.
      followRedirects: false,
    };

    const headers = this.fetch(this.loginUrl, req).getAllHeaders();
    if (!this.saveCookies(headers)) {
      throw new Error('Failed to retrive its Cookie.');
    }
  }

  private saveCookies(headers: { 'Set-Cookie'?: string }): boolean {
    if (headers['Set-Cookie']) {
      const respCookies: string[] = Array.isArray(headers['Set-Cookie'])
        ? headers['Set-Cookie']
        : [headers['Set-Cookie']];
      this.cookies = respCookies.map(it => cookie.parse(it));
      if (!this.storesExpiredCookies) {
        // Remove expired cookies.
        this.cookies = this.cookies.filter(it => !(it.Expires && new Date(it.Expires) < new Date()));
      }
      Cache.put(this.cookiesKey, JSON.stringify(this.cookies), this.cacheExpiration);
      return true;
    }
    return false;
  }

  private static parseLoginForm(htmlContent: string): FormParameters {
    const $ = cheerio.load(htmlContent);

    const submitCount = $('form input button[type="submit"]').length;
    const buttonCount = $('form input button[type="button"]').length;

    const formData: FormParameters = {};
    $('form input').each((_, element) => {
      const name = $(element).attr('name');
      if (!name) {
        return;
      }
      const value = $(element).val();
      const type = $(element).attr('type');

      // Skip if there are multiple buttons and the name attribute does not include "login".
      if (
        (type === 'submit' || type === 'button') &&
        submitCount + buttonCount !== 1 &&
        !name.toLowerCase().includes('login')
      ) {
        return;
      }

      formData[name] = value as string;
    });

    return formData;
  }
}
