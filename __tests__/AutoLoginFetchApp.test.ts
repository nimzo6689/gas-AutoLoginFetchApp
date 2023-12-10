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
import * as fs from 'node:fs';
import { captor, mock } from 'jest-mock-extended';
import * as tough from 'tough-cookie';
import AutoLoginFetchApp from '../src/client/common/AutoLoginFetchApp';

type UrlFetchApp = GoogleAppsScript.URL_Fetch.UrlFetchApp;
type HTTPResponse = GoogleAppsScript.URL_Fetch.HTTPResponse;
type Cache = GoogleAppsScript.Cache.Cache;

const loginUrl = 'https://localhost/login';
const mypageUrl = 'https://localhost/mypage';

const authOptions = {
  username: 'test_username',
  password: 'test_password',
};

const sessionIdCookie = 'session_id=xxxxx';

function mockResponse(
  responseCode: number,
  headers?: Record<string, string | string[]>,
  content?: string
): HTTPResponse {
  const mockedResponse = mock<HTTPResponse>();
  mockedResponse.getResponseCode.mockReturnValue(responseCode);
  mockedResponse.getAllHeaders.mockReturnValue(headers || {});
  mockedResponse.getContentText.mockReturnValue(content || '');
  return mockedResponse;
}

describe('AutoLoginFetchApp', () => {
  describe('Default behavior', () => {
    beforeAll(() => {
      Utilities.sleep = jest.fn(_ => {
        /* Do nothing. */
      });
    });

    it('fetch with empty cache', () => {
      // ---- Arrange ----
      // UserCache does not have any cookies.
      const cache = mock<Cache>();
      cache.get.mockReturnValue(null);
      CacheService.getUserCache = jest.fn().mockReturnValue(cache);

      const mockedApp = mock<UrlFetchApp>();
      const loginHtml = fs.readFileSync('./__tests__/resources/login.html', 'utf8');
      mockedApp.fetch.mockReturnValueOnce(mockResponse(200, {}, loginHtml));
      mockedApp.fetch.mockReturnValueOnce(mockResponse(302, { 'Set-Cookie': sessionIdCookie }));
      mockedApp.fetch.mockReturnValueOnce(mockResponse(200));
      UrlFetchApp = mockedApp;

      // ---- Act ----
      const client = new AutoLoginFetchApp(loginUrl, authOptions);
      const response = client.fetch(mypageUrl);

      // ---- Assertion ----
      expect(response.getResponseCode()).toBe(200);

      let nth = 0;
      expect(UrlFetchApp.fetch).toHaveBeenNthCalledWith(++nth, loginUrl, {});
      expect(UrlFetchApp.fetch).toHaveBeenNthCalledWith(++nth, `${loginUrl}-request`, {
        followRedirects: false,
        method: 'post',
        payload: {
          username: authOptions.username,
          password: authOptions.password,
          submit: 'login',
        },
      });
      expect(UrlFetchApp.fetch).toHaveBeenNthCalledWith(++nth, mypageUrl, {
        headers: {
          Cookie: sessionIdCookie,
        },
      });
      expect(UrlFetchApp.fetch).toHaveBeenCalledTimes(nth);

      const argCaptor = captor();
      expect(CacheService.getUserCache().put).toHaveBeenLastCalledWith(argCaptor, argCaptor, argCaptor);
      const [cacheExpiration, cachedValue, cookiesKey] = argCaptor.values;
      expect(cookiesKey).toBe(`AutoLoginFetchApp.${loginUrl}`);
      const cookie = tough.CookieJar.deserializeSync(cachedValue).getCookieStringSync(loginUrl);
      expect(cookie).toBe(sessionIdCookie);
      expect(cacheExpiration).toBe(21600);
    });

    it('Second run before cache expires', () => {
      // ---- Arrange ----
      // UserCache does not have any cookies.
      const cache = mock<Cache>();
      const cachedCookies =
        '{"version":"tough-cookie@4.1.3","storeType":"MemoryCookieStore","rejectPublicSuffixes":true,"enableLooseMode":false,"allowSpecialUseDomain":true,"prefixSecurity":"silent","cookies":[{"key":"session_id","value":"xxxxx","domain":"localhost","path":"/","hostOnly":true,"pathIsDefault":true,"creation":"2023-12-10T00:11:59.049Z","lastAccessed":"2023-12-10T00:11:59.053Z"}]}';
      cache.get.mockReturnValue(cachedCookies);
      CacheService.getUserCache = jest.fn().mockReturnValue(cache);

      const mockedApp = mock<UrlFetchApp>();
      const loginHtml = fs.readFileSync('./__tests__/resources/login.html', 'utf8');
      mockedApp.fetch.mockReturnValueOnce(mockResponse(200));
      UrlFetchApp = mockedApp;

      // ---- Act ----
      const client = new AutoLoginFetchApp(loginUrl, authOptions);
      const response = client.fetch(mypageUrl);

      // ---- Assertion ----
      expect(response.getResponseCode()).toBe(200);

      let nth = 0;
      expect(UrlFetchApp.fetch).toHaveBeenNthCalledWith(++nth, mypageUrl, {
        headers: {
          Cookie: sessionIdCookie,
        },
      });
      expect(UrlFetchApp.fetch).toHaveBeenCalledTimes(nth);

      expect(CacheService.getUserCache().put).not.toHaveBeenCalled();
    });
  });

  describe('CustomOptions behavior', () => {
    it('maxRetryCount = 2', () => {
      //TODO
    });

    it('leastIntervalMills = 0', () => {
      //TODO
    });

    it('loginForm = form[name="login"]', () => {
      //TODO
    });

    it('loginFormInput = input:not([name="btnClear"])', () => {
      //TODO
    });

    it('requestOptions = muteHttpExceptions:true', () => {
      //TODO
    });

    it('logger = console.log', () => {
      //TODO
    });
  });
});
