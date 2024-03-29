# AutoLoginFetchApp

[![npm version](https://badge.fury.io/js/gas-auto-login-fetch-app.svg)](https://badge.fury.io/js/gas-auto-login-fetch-app)
[![testings](https://github.com/nimzo6689/gas-AutoLoginFetchApp/actions/workflows/ci.yml/badge.svg)](https://github.com/nimzo6689/gas-AutoLoginFetchApp/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/nimzo6689/gas-AutoLoginFetchApp/graph/badge.svg?token=UDW6qCVPzR)](https://codecov.io/gh/nimzo6689/gas-AutoLoginFetchApp)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

UrlFetchApp with auto-login functionality for Google Apps Script.  
It is useful for scraping websites that require login and for automated operation of websites.

## How to use

### For Apps Script IDE

Script ID: `193oTq1hqBLv_A_4vJBAL1tFR6ACM2DoBzVUaIVGcHRpa4rk1-jpN4KR8`

Also if you might want to use Cheerio, you can try [cheeriogs](https://github.com/tani/cheeriogs).

```javascript
function main() {
  const client = new AutoLoginFetchApp.AutoLoginFetchApp('https://localhost/login.html', {
    username: 'test_username',
    password: 'test_password',
  });
  const response = client.fetch('https://localhost/path/to/target-page.html');
  const $ = Cheerio.load(response.getContentText());

  console.log(/Logout/.test($('html').text() ? 'Logged in successful.' : 'Failed to log in.'));
}
```

## Functions

### Re-use Cookies

The retrieved cookies are stored by default in the UserCache of the CacheService for 6 hours.  
Therefore, within that time, the communication required for login is skipped.

### Retry communication

If communication fails, it is retried up to 5 times by default.

### Sleep time

Wait 5 seconds by default from the last request to avoid making a request.  
This is a measure to avoid overloading the target site with scraping.

## Caution

The existing UrlFetchApp issue of not being able to setthe communication timeout (cannot be changed from 30 ~ 60 sec) is still present with this library.

https://issuetracker.google.com/issues/36761852?pli=1
