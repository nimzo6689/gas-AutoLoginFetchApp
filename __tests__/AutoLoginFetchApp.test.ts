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
import { captor, mock, MockProxy } from 'jest-mock-extended';
import * as tough from 'tough-cookie';
import AutoLoginFetchApp from '../src/client/common/AutoLoginFetchApp';

type UrlFetchApp = GoogleAppsScript.URL_Fetch.UrlFetchApp;
type HTTPResponse = GoogleAppsScript.URL_Fetch.HTTPResponse;
type Cache = GoogleAppsScript.Cache.Cache;

// ---- Constants ----

const loginUrl = 'https://localhost/login';
const mypageUrl = 'https://localhost/mypage';

const authOptions = {
  username: 'test_username',
  password: 'test_password',
};

const sessionIdCookie = 'session_id=xxxxx';
const cachedCookies =
  '{"version":"tough-cookie@4.1.3","storeType":"MemoryCookieStore","rejectPublicSuffixes":true,"enableLooseMode":false,"allowSpecialUseDomain":true,"prefixSecurity":"silent","cookies":[{"key":"session_id","value":"xxxxx","domain":"localhost","path":"/","hostOnly":true,"pathIsDefault":true,"creation":"2023-12-10T00:11:59.049Z","lastAccessed":"2023-12-10T00:11:59.053Z"}]}';

// ---- Mocking Factory Functions ----

function mockCache(cachedValue: string | null = null): jest.Mock<Cache> {
  const cache = mock<Cache>();
  cache.get.mockReturnValue(cachedValue);
  return jest.fn().mockReturnValue(cache);
}

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

function mockUrlFetchAppForEach(...response: HTTPResponse[]): MockProxy<UrlFetchApp> {
  const mockedApp = mock<UrlFetchApp>();
  response.forEach(mockedApp.fetch.mockReturnValueOnce);
  return mockedApp;
}

// ---- Action Utilities ----

function asyncTo(callback: () => HTTPResponse): Promise<HTTPResponse> {
  return new Promise((resolve, reject) => {
    try {
      const response = callback();
      resolve(response);
    } catch (error) {
      reject(error);
    }
  });
}

describe('AutoLoginFetchApp', () => {
  beforeAll(() => {
    Utilities = mock<GoogleAppsScript.Utilities.Utilities>();
    console = mock<Console>();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Default behavior', () => {
    it('fetch with empty cache', () => {
      // ---- Arrange ----
      CacheService.getUserCache = mockCache();

      const loginHtml = fs.readFileSync('./__tests__/resources/login_action_absolute.html', 'utf8');
      UrlFetchApp = mockUrlFetchAppForEach(
        mockResponse(200, {}, loginHtml),
        mockResponse(302, { 'Set-Cookie': sessionIdCookie }),
        mockResponse(200)
      );

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
      expect(CacheService.getUserCache().put).toHaveBeenLastCalledWith(
        `AutoLoginFetchApp.${loginUrl}`,
        argCaptor,
        21600
      );
      const cookie = tough.CookieJar.deserializeSync(argCaptor.value).getCookieStringSync(loginUrl);
      expect(cookie).toBe(sessionIdCookie);
    });

    it('Second run before cache expires', () => {
      // ---- Arrange ----
      CacheService.getUserCache = mockCache(cachedCookies);

      UrlFetchApp = mockUrlFetchAppForEach(mockResponse(200));

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
    it('maxRetryCount is 2', () => {
      // ---- Arrange ----
      CacheService.getUserCache = mockCache();

      const errorMessage = 'Request failed for `url` returned code 429';
      UrlFetchApp = mock<UrlFetchApp>(
        {},
        {
          fallbackMockImplementation: () => {
            throw new Error(errorMessage);
          },
        }
      );

      // ---- Act ----
      const client = new AutoLoginFetchApp(loginUrl, authOptions, {
        maxRetryCount: 2,
      });
      const response = asyncTo(() => client.fetch(mypageUrl));

      // ---- Assertion ----
      expect(response).rejects.toThrow(errorMessage);
      let nth = 0;
      expect(UrlFetchApp.fetch).toHaveBeenNthCalledWith(++nth, loginUrl, {});
      expect(UrlFetchApp.fetch).toHaveBeenNthCalledWith(++nth, loginUrl, {});
      expect(UrlFetchApp.fetch).toHaveBeenCalledTimes(nth);
    });

    it('leastIntervalMills is 3 seconds', () => {
      // ---- Arrange ----
      jest.spyOn(Date, 'now').mockReturnValue(new Date('Thu, 14 Dec 2023 18:00:00 GMT').getTime());

      CacheService.getUserCache = mockCache();

      const loginHtml = fs.readFileSync('./__tests__/resources/login_action_absolute.html', 'utf8');
      UrlFetchApp = mockUrlFetchAppForEach(
        mockResponse(200, {}, loginHtml),
        mockResponse(302, { 'Set-Cookie': sessionIdCookie }),
        mockResponse(200)
      );

      // ---- Act ----
      const client = new AutoLoginFetchApp(loginUrl, authOptions, {
        leastIntervalMills: 3000,
      });
      client.fetch(mypageUrl);

      // ---- Assertion ----
      let nth = 0;
      expect(Utilities.sleep).toHaveBeenNthCalledWith(++nth, 3000);
      expect(Utilities.sleep).toHaveBeenNthCalledWith(++nth, 3000);
      expect(Utilities.sleep).toHaveBeenCalledTimes(nth);
    });

    it('Logging is enable', () => {
      // ---- Arrange ----
      CacheService.getUserCache = mockCache();
      const loginHtml = fs.readFileSync('./__tests__/resources/login_action_absolute.html', 'utf8');
      UrlFetchApp = mockUrlFetchAppForEach(
        mockResponse(200, {}, loginHtml),
        mockResponse(302, { 'Set-Cookie': sessionIdCookie }),
        mockResponse(200)
      );

      // ---- Act ----
      const client = new AutoLoginFetchApp(loginUrl, authOptions, {
        logging: true,
      });
      client.fetch(mypageUrl);

      // ---- Assertion ----
      let nth = 0;
      expect(console.log).toHaveBeenNthCalledWith(++nth, `url: ${loginUrl}, params: {}`);
      expect(console.log).toHaveBeenNthCalledWith(++nth, `status: 200, headers: {}`);

      expect(console.log).toHaveBeenNthCalledWith(
        ++nth,
        `url: ${loginUrl}-request, params: {\"method\":\"post\",\"payload\":{\"username\":\"${authOptions.username}\",\"password\":\"${authOptions.password}\",\"submit\":\"login\"},\"followRedirects\":false}`
      );
      expect(console.log).toHaveBeenNthCalledWith(
        ++nth,
        `status: 302, headers: {\"Set-Cookie\":\"${sessionIdCookie}\"}`
      );

      expect(console.log).toHaveBeenNthCalledWith(
        ++nth,
        `url: ${mypageUrl}, params: {\"headers\":{\"Cookie\":\"${sessionIdCookie}\"}}`
      );
      expect(console.log).toHaveBeenNthCalledWith(++nth, `status: 200, headers: {}`);

      expect(console.log).toHaveBeenCalledTimes(nth);
    });
  });

  describe('Irregular website behavior', () => {
    it('returns multiple Cookies', () => {
      // ---- Arrange ----
      CacheService.getUserCache = mockCache();

      const loginHtml = fs.readFileSync('./__tests__/resources/login_action_absolute.html', 'utf8');
      const subSessionIdCookie = 'sub_session_id=yyyyy';
      UrlFetchApp = mockUrlFetchAppForEach(
        mockResponse(200, {}, loginHtml),
        mockResponse(302, { 'Set-Cookie': [sessionIdCookie, subSessionIdCookie] }),
        mockResponse(200)
      );

      // ---- Act ----
      const client = new AutoLoginFetchApp(loginUrl, authOptions);
      client.fetch(mypageUrl);

      // ---- Assertion ----
      expect(UrlFetchApp.fetch).toHaveBeenNthCalledWith(3, mypageUrl, {
        headers: {
          Cookie: `${sessionIdCookie}; ${subSessionIdCookie}`,
        },
      });

      const argCaptor = captor();
      expect(CacheService.getUserCache().put).toHaveBeenLastCalledWith(
        `AutoLoginFetchApp.${loginUrl}`,
        argCaptor,
        21600
      );
      const cookie = tough.CookieJar.deserializeSync(argCaptor.value).getCookieStringSync(loginUrl);
      expect(cookie).toBe(`${sessionIdCookie}; ${subSessionIdCookie}`);
    });

    it('returns short expiration cookies at Max-Age', () => {
      // ---- Arrange ----
      CacheService.getUserCache = mockCache();

      const loginHtml = fs.readFileSync('./__tests__/resources/login_action_absolute.html', 'utf8');
      const cookieExpiration = 3600;
      UrlFetchApp = mockUrlFetchAppForEach(
        mockResponse(200, {}, loginHtml),
        mockResponse(302, { 'Set-Cookie': `${sessionIdCookie}; Max-Age=${cookieExpiration}` }),
        mockResponse(200)
      );

      // ---- Act ----
      const client = new AutoLoginFetchApp(loginUrl, authOptions);
      client.fetch(mypageUrl);

      expect(UrlFetchApp.fetch).toHaveBeenNthCalledWith(3, mypageUrl, {
        headers: {
          Cookie: sessionIdCookie,
        },
      });

      const argCaptor = captor();
      expect(CacheService.getUserCache().put).toHaveBeenLastCalledWith(
        `AutoLoginFetchApp.${loginUrl}`,
        argCaptor,
        cookieExpiration
      );
      const cookie = tough.CookieJar.deserializeSync(argCaptor.value).getCookieStringSync(loginUrl);
      expect(cookie).toBe(sessionIdCookie);
    });

    it('returns short expiration cookies at Expires', () => {
      // ---- Arrange ----
      jest.spyOn(Date, 'now').mockReturnValue(new Date('Thu, 14 Dec 2023 18:00:00 GMT').getTime());

      CacheService.getUserCache = mockCache();

      const loginHtml = fs.readFileSync('./__tests__/resources/login_action_absolute.html', 'utf8');
      const cookieExpiration = 3600;
      UrlFetchApp = mockUrlFetchAppForEach(
        mockResponse(200, {}, loginHtml),
        mockResponse(302, { 'Set-Cookie': `${sessionIdCookie}; Expires=Thu, 14 Dec 2023 19:00:00 GMT` }),
        mockResponse(200)
      );

      // ---- Act ----
      const client = new AutoLoginFetchApp(loginUrl, authOptions);
      client.fetch(mypageUrl);

      expect(UrlFetchApp.fetch).toHaveBeenNthCalledWith(3, mypageUrl, {
        headers: {
          Cookie: sessionIdCookie,
        },
      });

      const argCaptor = captor();
      expect(CacheService.getUserCache().put).toHaveBeenLastCalledWith(
        `AutoLoginFetchApp.${loginUrl}`,
        argCaptor,
        cookieExpiration
      );
      const cookie = tough.CookieJar.deserializeSync(argCaptor.value).getCookieStringSync(loginUrl);
      expect(cookie).toBe(sessionIdCookie);
    });
  });

  it('actionUrl is relative path', () => {
    // ---- Arrange ----
    CacheService.getUserCache = mockCache();

    const loginHtml = fs.readFileSync('./__tests__/resources/login_action_relative.html', 'utf8');
    UrlFetchApp = mockUrlFetchAppForEach(
      mockResponse(200, {}, loginHtml),
      mockResponse(302, { 'Set-Cookie': sessionIdCookie }),
      mockResponse(200)
    );

    // ---- Act ----
    const client = new AutoLoginFetchApp(loginUrl, authOptions);
    client.fetch(mypageUrl);

    // ---- Assertion ----
    expect(UrlFetchApp.fetch).toHaveBeenNthCalledWith(2, `${loginUrl}-request`, {
      followRedirects: false,
      method: 'post',
      payload: {
        username: authOptions.username,
        password: authOptions.password,
        submit: 'login',
      },
    });
  });

  it('actionUrl is none', () => {
    // ---- Arrange ----
    CacheService.getUserCache = mockCache();

    const loginHtml = fs.readFileSync('./__tests__/resources/login_action_none.html', 'utf8');
    UrlFetchApp = mockUrlFetchAppForEach(
      mockResponse(200, {}, loginHtml),
      mockResponse(302, { 'Set-Cookie': sessionIdCookie }),
      mockResponse(200)
    );

    // ---- Act ----
    const client = new AutoLoginFetchApp(loginUrl, authOptions);
    client.fetch(mypageUrl);

    // ---- Assertion ----
    expect(UrlFetchApp.fetch).toHaveBeenNthCalledWith(2, loginUrl, {
      followRedirects: false,
      method: 'post',
      payload: {
        username: authOptions.username,
        password: authOptions.password,
        submit: 'login',
      },
    });
  });
});
