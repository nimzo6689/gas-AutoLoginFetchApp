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
import * as tough from 'tough-cookie';

type URLFetchRequestOptions = GoogleAppsScript.URL_Fetch.URLFetchRequestOptions;
type HttpMethod = GoogleAppsScript.URL_Fetch.HttpMethod;
type HTTPResponse = GoogleAppsScript.URL_Fetch.HTTPResponse;
type Cache = GoogleAppsScript.Cache.Cache;

type FormParameters = { [key: string]: string | number | boolean };

type Form = {
  action?: string;
  method?: HttpMethod;
  parameters: FormParameters;
};

export interface CustomOptions {
  /**
   * If communication fails, it is retried up to 5 times by default.
   */
  maxRetryCount: number;
  /**
   * Wait 5 seconds by default from the last request to avoid making a request.
   * This is a measure to avoid overloading the target site with scraping.
   */
  leastIntervalMills: number;
  /**
   * Specify the CSS selector for form element that is sent with the login request.
   * (default: 'form')
   */
  loginForm: string;
  /**
   * Specify the CSS selector for input elements that have parameters that are sent with the login request.
   * (default: 'form input')
   */
  loginFormInput: string;
  /**
   * Overwrites the default values of requestOptions.
   * The settings specified here can be further overwritten when calling the fetch method.
   */
  requestOptions: URLFetchRequestOptions;
  /**
   * Enable logging.
   * The request, response and logs in the event of an error will be output.
   */
  logging: boolean;
}

export default class AutoLoginFetchApp {
  private readonly loginUrl: string;
  private readonly authOptions: FormParameters;

  // For customOptions
  private readonly maxRetryCount: number = 5;
  private readonly leastIntervalMills: number = 5000;
  private readonly loginForm: string = 'form';
  private readonly loginFormInput: string = 'form input';
  private readonly requestOptions: URLFetchRequestOptions = {};
  private readonly logging: boolean = false;

  // We need to retain cookies for a combination of the user executing the Apps Script
  // and the target site being logged in, so we will use UserCache.
  // Never use ScriptCache and DocumentCache as they could potentially be exploited for session hijacking.
  private readonly cacheStore: Cache = CacheService.getUserCache();
  private readonly cookieJar: tough.CookieJar;
  // Normally, cookies are stored in UserCache based on the login URL.
  // When multiple users log in to the same login destination,
  // you can specify the user name or other information in the URL fragment
  // at the end of the loginUrl to store cookies individually in UserCache for each user.
  private readonly cookiesKey: string;
  private lastRequestTime: number;

  constructor(loginUrl: string, authOptions: FormParameters, customOptions?: Partial<CustomOptions>) {
    this.loginUrl = loginUrl;
    this.authOptions = authOptions;

    if (customOptions) {
      Object.assign(this, customOptions);
      this.loginFormInput = customOptions.loginFormInput ?? `${this.loginForm} input`;
    }

    // For CacheService, the maximum length of a key is 250 characters.
    this.cookiesKey = `AutoLoginFetchApp.${loginUrl}`.substring(0, 250);

    const cachedCookies = this.cacheStore.get(this.cookiesKey);
    if (cachedCookies) {
      this.cookieJar = tough.CookieJar.deserializeSync(JSON.parse(cachedCookies));
    } else {
      this.cookieJar = new tough.CookieJar();
    }
    // To skip the sleep process before sending the initial request.
    this.lastRequestTime = new Date().getTime() - this.leastIntervalMills;
  }

  public fetch(url: string, params: URLFetchRequestOptions = {}, shouldRetrieveCookie: boolean = true): HTTPResponse {
    let hasCachedCookies = !!this.cookieJar.getCookiesSync(url).length;
    if (shouldRetrieveCookie && !hasCachedCookies) {
      this.retrieveCookies();
      hasCachedCookies = !!this.cookieJar.getCookiesSync(url).length;
    }

    params = { ...params, ...this.requestOptions };

    if (hasCachedCookies) {
      params.headers = params.headers || {};
      params.headers['Cookie'] = this.cookieJar.getCookieStringSync(url);
    }

    let lastError: Error = new Error('Unexpected Error');
    for (let i = 1; i <= this.maxRetryCount; i++) {
      try {
        this.log(`url: ${url}, params: ${JSON.stringify(params)}`);
        this.sleepIfNeeded();
        const response = UrlFetchApp.fetch(url, params);
        this.lastRequestTime = new Date().getTime();
        this.log(`status: ${response.getResponseCode()}, headers: ${JSON.stringify(response.getAllHeaders())}`);

        this.saveCookies(response.getAllHeaders(), url);
        return response;
      } catch (error) {
        if (error instanceof Error) {
          this.log(`Tried ${i} times. Reponse Status Code: ${error.message}.`);
          lastError = error;
          Utilities.sleep(1000 * 2 ** i);
          continue;
        }
      }
    }
    throw lastError;
  }

  private log(message: string) {
    if (this.logging) {
      // eslint-disable-next-line no-console
      console.log(message);
    }
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
    const loginForm = this.parseLoginForm(loginPage.getContentText());

    const req: URLFetchRequestOptions = {
      method: loginForm.method ?? 'get',
      payload: { ...loginForm.parameters, ...this.authOptions },
      // Logging in often results in an HTTP 302 redirect, which can cause unnecessary redirection.
      followRedirects: false,
    };

    const loginActionUrl = this.resolveLoginActionUrl(loginForm.action);
    this.fetch(loginActionUrl, req, false);
  }

  private parseLoginForm(htmlContent: string): Form {
    const $ = cheerio.load(htmlContent);

    // For form element
    const action = $(this.loginForm).attr('action');
    const method = $(this.loginForm).attr('method')?.toLowerCase() as HttpMethod;

    // For input elements
    const parameters: FormParameters = {};
    $(this.loginFormInput).each((_, element) => {
      const name = $(element).attr('name');
      if (!name) {
        return;
      }
      const value = $(element).val();
      parameters[name] = value as string;
    });

    return { action, method, parameters };
  }

  private resolveLoginActionUrl(actionUrl: string | undefined): string {
    if (actionUrl?.startsWith('/')) {
      const originRegex = /^(https?:\/\/[^/]+)/;
      return `${this.loginUrl.match(originRegex)?.[1]}${actionUrl}`;
    }
    if (actionUrl) {
      const originAndParentPathRegex = /^(https?:\/\/[^?#]+\/)/;
      return `${this.loginUrl.match(originAndParentPathRegex)?.[1]}${actionUrl}`;
    }
    return this.loginUrl;
  }

  private saveCookies(headers: { 'Set-Cookie'?: string }, url: string) {
    if (headers['Set-Cookie']) {
      const respCookies: string[] = Array.isArray(headers['Set-Cookie'])
        ? headers['Set-Cookie']
        : [headers['Set-Cookie']];

      respCookies.map(it => this.cookieJar.setCookieSync(it, url));
      const cacheExpiration = this.getMinimumMaxAge(url);

      this.cacheStore.put(this.cookiesKey, JSON.stringify(this.cookieJar.serializeSync()), cacheExpiration);
    }
  }

  private getMinimumMaxAge(url: string): number {
    const maxCacheExpiration = 21600;

    const maxAgeList = this.cookieJar.getCookiesSync(url).map(it => {
      const now = Date.now();

      let maxAge: number = maxCacheExpiration;
      if (it.expires instanceof Date) {
        maxAge = Math.floor((it.expires.getTime() - now) / 1000);
      }
      if (typeof it.maxAge === 'number') {
        maxAge = Math.min(maxAge, it.maxAge);
      }
      return maxAge;
    });

    const minimumMaxAge = Math.min(...maxAgeList);
    return minimumMaxAge > maxCacheExpiration ? maxCacheExpiration : minimumMaxAge;
  }
}
