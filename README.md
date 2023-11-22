# AutoLoginFetchApp

UrlFetchApp with auto-login functionality for Google Apps Script.
It is useful for scraping websites that require login and for automated operation of websites.

## How to use

### For Apps Script IDE

Script ID: `193oTq1hqBLv_A_4vJBAL1tFR6ACM2DoBzVUaIVGcHRpa4rk1-jpN4KR8`

Also if you might want to use Cheerio, you can try [cheeriogs](https://github.com/tani/cheeriogs).

```javascript
function main() {
  const client = new AutoLoginFetchApp.AutoLoginFetchApp('https://localhost/login.html', {
    accountKey: 'username',
    accountValue: 'test_username',
    passwordKey: 'password',
    passwordValue: 'test_password',
  });
  const response = client.fetch('https://localhost/path/to/target-page.html');
  const $ = Cheerio.load(response.getContentText());

  console.log(/Logout/.test($('html').text());
}
```

### For local development with TypeScript

I recommend using Git's submodule to include it in your project.
It is also easier if you use this project itself as a template.

```bash
mkdir -p /path/to/your-project
cd /path/to/your-project

REPO_URL=https://github.com/nimzo6689/gas-AutoLoginFetchApp.git

git clone --depth=1 --no-commit-history $REPO_URL

rm -rf src/client/common
git submodule add -b main $REPO_URL/src/client/common src/client/common
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
