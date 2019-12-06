"use strict";

var request = require("request");

var fakeJar = {};
var epicOauth;
var epicSSO;

request = request.defaults({followRedirect: false, followAllRedirects: false});

/// Debugging
request._get = request.get;
request._post = request.post;
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


function updateFakeJar(cookies)
{
    var cookiePair;
    var i;
    
    for (i = 0; i < cookies.length; ++i) {
        cookiePair = cookies[i].split(";", 1)[0].split("=");
        fakeJar[cookiePair[0]] = cookiePair[1];
        
        if (cookiePair[1] === "invalid") {
            delete fakeJar[cookiePair[0]];
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

/// Step 1: Get form and cookies
function getWebLoginForm()
{
    var opts = {
        uri: "https://accounts.unrealengine.com/login/doLogin",
    };
    
    console.log("Getting form...")
    request.get(opts, function (err, res, body)
    {
        console.log("Got form.");
        updateFakeJar(res.headers["set-cookie"]);
        
        ///TEMP
        var auth = require("./etc/auth.json");
        webLogin(auth.u, auth.p);
    });
}

/// Step 2: Log in
function webLogin(username, password)
{
    var opts = {
        url: "https://accounts.unrealengine.com/login/doLogin",
        form: {
            fromForm: "yes",
            authType: "",
            linkExtAuth: "",
            epic_username: username,
            password: password,
            rememberMe: "YES"
        },
        headers: {
          Cookie: getWebCookieString(), Origin: "allar_ue4_marketplace_commandline" ,
          "Accept-Language": "en-US,en;q=0.8",
          Host: "accounts.unrealengine.com",
          "X-XSRF-TOKEN": fakeJar["XSRF-TOKEN"],
        }
    };
   
    //process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0; /// Needed?
    console.log("Logging in...")
    request.post(opts, function(err, res, body)
    {
        if (err) {
            console.error(err)
        }
        
        if (res.statusCode === 400) { // login failure
            console.error("Failed to log in");
            console.error(res);
        } else if (res.statusCode == 302 || res.statusCode == 200) { // success
            updateFakeJar(res.headers["set-cookie"]);
            console.log("Logged in.")
            webAuthorize();
        } else {
            console.error("Failed with status code: " + res.statusCode);
        }
    });
}

/// Step 3: authroize
function webAuthorize()
{
    var opts = {
        uri: "https://www.epicgames.com/id/api/exchange",
        headers: {
            Cookie: getWebCookieString(),
            Origin: "allar_ue4_marketplace_commandline",
            //Host: "accounts.unrealengine.com",
        },
    };
    
    console.log("Authorizing...");
    
    request.get(opts, function(err, res, body)
    {
        var json;
        var code;
        
        if (err) {
            console.error(err);
        }
        
        updateFakeJar(res.headers["set-cookie"]);
        
        if (res.statusCode === 200) {
            console.log("Authorized.");
            //console.log(body)
            json = JSON.parse(body);
            console.log(json)
            //var code = json.redirectURL.split('?code=')[1];
            code = json.code;
            webExchange(code);
        } else {
            console.error("Failed to authorize");
            console.error(res);
            console.error(body);
        }
    });
}

function webExchange(code)
{
    var opts = {
        uri: "https://www.unrealengine.com/exchange",
        headers: {
            Cookie: getWebCookieString(),
            //"Origin": "allar_ue4_marketplace_commandline",
            //"Accept-Language": "en-US,en;q=0.8",
            //host: "accounts.unrealengine.com",
        },
        qs: {
            code: code
        },
    };
    
    console.log("Beginining Web Exchange...");
    
    request.get(opts, function(err, res, body)
    {
        if (err) {
            console.error(err);
        }
        
        /// Save cookies.
        updateFakeJar(res.headers["set-cookie"]);
        
        if (res.statusCode == 302) {
            console.log("Web Exchange successful.");
            oAuthViaPassword(code);
        } else if (res.statusCode === 404) {
            console.log("Web Exchange failed, but trying to continue anyway.");
            //oAuthViaPassword(code);
            //console.log(body);
            process.exit();
        } else {
            console.error("Web Exchange failed: " + JSON.stringify(res, "", "  "));
        }
    });
}

function oAuthViaPassword(code)
{    
    var opts = {
        uri: "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token",
        headers: {
            Authorization: "basic MzRhMDJjZjhmNDQxNGUyOWIxNTkyMTg3NmRhMzZmOWE6ZGFhZmJjY2M3Mzc3NDUwMzlkZmZlNTNkOTRmYzc2Y2Y=",
            Origin: "allar_ue4_marketplace_commandline"
        },
        form: {
            grant_type: "exchange_code",
            exchange_code: code,
            token_type: "eg1",
            includePerms: false
        },
    };
    
    console.log("Getting OAuth token...");
    
    request.post(opts, function(err, res, body)
    {
        if (err) {
            console.error(err);
        }
        
        if (res.statusCode == 200) {
            console.log("Got OAuth token.");
            epicOauth = JSON.parse(body);
            oAuthExchange();
        } else {
            console.error("OAuth Via Password failed: " + JSON.stringify(res, "", "  "));
        }
    });
}

function oAuthExchange()
{
    var opts = {
        uri: "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/exchange",
        headers: {
            Authorization: "bearer " + epicOauth.access_token,
            Origin: "allar_ue4_marketplace_commandline"
        },
    };
    
    console.log("Getting OAuth exchange code...");
    
    request.get(opts, function(err, res, body)
    {
        var json;
        
        if (err) {
            console.error(err);
        }
        
        if (res.statusCode == 200) {
            json = JSON.parse(body);
            epicOauth.code = json.code;
            
            console.log("Got OAuth exchange code.");
            
            // Grab our SSO token
            if (epicSSO === undefined) {
                getSSOWithOAuthCode();
            }
            // renew our token before it expires
            setTimeout(oAuthExchange, 250 * 1000).unref();
        } else {
            console.error("OAuth renew failed: " + JSON.stringify(res, "", "  "))
        }
    });
}

/// This doesn't seem to do anything.
///TODO: Remove if not necessary.
function getSSOWithOAuthCode()
{
    var opts = {
        uri: "https://accountportal-website-prod07.ol.epicgames.com/exchange?",
        headers: {
            Authorization: "bearer " +  epicOauth.access_token,
            Origin: "allar_ue4_marketplace_commandline"
        },
        qs: {
            exchangeCode: epicOauth.code,
            state: "/getSsoStatus",
        }
    };
    
    console.log("Getting SSO code...");
    
    request.get(opts, function(err, res, body)
    {
        if (err) {
            console.error(err);
        }
        
        //updateFakeJar(res.headers["set-cookie"]);
        
        if (res.statusCode == 302) {
            console.log("Successfully Authorized!");
        } else {
            //console.log(res)
            console.error("Failed to authorize");
        }
    });
}


getWebLoginForm();
