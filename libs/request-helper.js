var request = require("request");

var fakeJar = {};

var debug = (process.env.LAUNCHER_LOG_REQUEST === "1");

request = request.defaults({followRedirect: false, followAllRedirects: false});

if (!request.options) {
    request.options = function (opts, cb)
    {
        opts.method = "options";
        request(opts, cb);
    };
}

if (debug) {
    request._get = request.get;
    request._post = request.post;
    request._options = request.options;
    request.get = function (opts, cb)
    {
        console.log("GET");
        console.log(opts);
        request._get(opts, cb);
    };
    request.post = function (opts, cb)
    {
        console.log("POST");
        console.log(opts);
        request._post(opts, cb);
    };
    request.options = function (opts, cb)
    {
        console.log("OPTIONS");
        console.log(opts);
        request._options(opts, cb);
    };
}



function setCookiesFromBrowser(cookies)
{
    cookies.forEach(function (cookie)
    {
        fakeJar[cookie.name] = cookie.value;
    });
}

function updateFakeJar(cookies)
{
    var cookiePair;
    var i;
    
    if (cookies) {
        for (i = 0; i < cookies.length; ++i) {
            cookiePair = cookies[i].split(";", 1)[0].split("=");
            fakeJar[cookiePair[0]] = cookiePair[1];
            
            if (cookiePair[1] === "invalid") {
                delete fakeJar[cookiePair[0]];
            }
        }
    }
}

function getWebCookieString()
{
    var cookieString = "";
    var key;
    
    for (key in fakeJar) {
        cookieString += key + "=" + fakeJar[key] + "; ";
    }
    
    return cookieString;
}

request._fakeJar = fakeJar;
request._setCookiesFromBrowser = setCookiesFromBrowser;
request._updateFakeJar = updateFakeJar;
request._getWebCookieString = getWebCookieString;

module.exports = request;
