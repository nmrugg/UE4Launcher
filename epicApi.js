"use strict";

var request = require("request");

var fakeJar = {};
var epicOauth;
var epicSSO;
var debug = false;

request = request.defaults({followRedirect: false, followAllRedirects: false});

/// Debugging
request._get = request.get;
request._post = request.post;
request.get = function (opts, cb)
{
    if (debug) {
        console.log("GET");
        console.log(opts);
    }
    request._get(opts, cb);
};
request.post = function (opts, cb)
{
    if (debug) {
        console.log("POST");
        console.log(opts);
    }
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

var login = (function ()
{
    var totalSteps = 7;
    
    /// Step 1: Get form and cookies
    function getWebLoginForm(user, pass, ondone, onerror, onprogress)
    {
        var opts = {
            uri: "https://accounts.unrealengine.com/login/doLogin",
        };
        
        onprogress(0, "Getting form...", totalSteps);
        request.get(opts, function (err, res, body)
        {
            if (err) {
                onerror(err);
            } else {
                onprogress(1, "Got form", totalSteps);
                updateFakeJar(res.headers["set-cookie"]);
                
                webLogin(user, pass, ondone, onerror, onprogress);
            }
        });
    }
    
    /// Step 2: Log in
    function webLogin(user, pass, ondone, onerror, onprogress)
    {
        var opts = {
            url: "https://accounts.unrealengine.com/login/doLogin",
            form: {
                fromForm: "yes",
                authType: "",
                linkExtAuth: "",
                epic_username: user,
                password: pass,
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
        onprogress(1, "Logging in...", totalSteps)
        request.post(opts, function(err, res, body)
        {
            if (!err && res.statusCode === 400) { // login failure
                onerror("Failed to log in", res);
            } else if (!err && (res.statusCode == 302 || res.statusCode == 200)) { // success
                updateFakeJar(res.headers["set-cookie"]);
                onprogress(2, "Logged in", totalSteps)
                webAuthorize(ondone, onerror, onprogress);
            } else {
                onerror(err, "Failed to log in with status code: " + res.statusCode);
            }
        });
    }
    
    /// Step 3: authroize
    function webAuthorize(ondone, onerror, onprogress)
    {
        var opts = {
            uri: "https://www.epicgames.com/id/api/exchange",
            headers: {
                Cookie: getWebCookieString(),
                Origin: "allar_ue4_marketplace_commandline",
                //Host: "accounts.unrealengine.com",
            },
        };
        
        onprogress(2, "Authorizing...", totalSteps);
        
        request.get(opts, function(err, res, body)
        {
            var json;
            var code;
            
            if (!err && res.statusCode === 200) {
                updateFakeJar(res.headers["set-cookie"]);
                onprogress(3, "Authorized", totalSteps);
                //console.log(body)
                json = JSON.parse(body);
                //console.log(json)
                //var code = json.redirectURL.split('?code=')[1];
                code = json.code;
                webExchange(code, ondone, onerror, onprogress);
            } else {
                onerror(err, "Failed to authorize", res, body);
            }
        });
    }
    
    function webExchange(code, ondone, onerror, onprogress)
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
        
        onprogress(3, "Beginining Web Exchange...", totalSteps);
        
        request.get(opts, function(err, res, body)
        {
            if (!err && res.statusCode == 302) {
                updateFakeJar(res.headers["set-cookie"]);
                onprogress(4, "Web Exchange successful", totalSteps);
                oAuthViaPassword(code, ondone, onerror, onprogress);
            } else {
                onerror(err, "Web Exchange failed: " + JSON.stringify(res, "", "  "));
            }
        });
    }
    
    function oAuthViaPassword(code, ondone, onerror, onprogress)
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
        
        onprogress(4, "Getting OAuth token...", totalSteps);
        
        request.post(opts, function(err, res, body)
        {
            if (!err && res.statusCode == 200) {
                onprogress(5, "Got OAuth token", totalSteps);
                epicOauth = JSON.parse(body);
                oAuthExchange(ondone, onerror, onprogress);
            } else {
                onerror(err, "OAuth Via Password failed: " + JSON.stringify(res, "", "  "));
            }
        });
    }
    
    function oAuthExchange(ondone, onerror, onprogress)
    {
        var opts = {
            uri: "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/exchange",
            headers: {
                Authorization: "bearer " + epicOauth.access_token,
                Origin: "allar_ue4_marketplace_commandline"
            },
        };
        
        onprogress(5, "Getting OAuth exchange code...", totalSteps);
        
        request.get(opts, function(err, res, body)
        {
            var json;
            
            if (!err && res.statusCode == 200) {
                json = JSON.parse(body);
                epicOauth.code = json.code;
                
                onprogress(6, "Got OAuth exchange code", totalSteps);
                
                // Grab our SSO token
                if (epicSSO === undefined) {
                    getSSOWithOAuthCode(ondone, onerror, onprogress);
                } else {
                    onprogress(7, "Successfully authorized", totalSteps);
                    ondone();
                    /// Prevent the functions from being triggerd again.
                    ondone = onerror = onprogress = function () {};
                }
                // renew our token before it expires
                setTimeout(oAuthExchange, 250 * 1000).unref();
            } else {
                onerror(err, "OAuth renew failed: " + JSON.stringify(res, "", "  "))
            }
        });
    }
    
    /// This doesn't seem to do anything.
    ///TODO: Remove if not necessary.
    function getSSOWithOAuthCode(ondone, onerror, onprogress)
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
        
        onprogress(6, "Getting SSO code...", totalSteps);
        
        request.get(opts, function(err, res, body)
        {
            /// Should it do this?
            //updateFakeJar(res.headers["set-cookie"]);
            
            if (!err && res.statusCode == 302) {
                onprogress(7, "Successfully authorized", totalSteps);
                ondone();
                /// Prevent the functions from being triggerd again.
                ondone = onerror = onprogress = function () {};
            } else {
                //console.log(res)
                onerror(err, "Failed to authorize");
            }
        });
    }
    
    return function login(user, pass, ondone, onerror, onprogress)
    {
        ondone = ondone || function () {};
        onerror = onerror || function () {};
        onprogress = onprogress || function () {};
        /// TEMP
        var auth = require("./etc/auth.json");
        getWebLoginForm(auth.u, auth.p, ondone, onerror, onprogress);
    };
}());

function getAssetInfo(catalogItemId, cb)
{
    var opts = {
        uri: "https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/bulk/items",
        headers: {
            Authorization: "bearer " + epicOauth.access_token,
            Origin: "allar_ue4_marketplace_commandline",
            "User-Agent": "game=UELauncher, engine=UE4, build=allar_ue4_marketplace_commandline",
        },
        qs: {
            id: catalogItemId,
            country: "US",
            locale: "en-US",
        },
    };
    
    request.get(opts, function(err, res, body)
    {
        var assetInfo;
        
        if (err || res.statusCode !== 200) {
            console.error(err);
            cb(err || res);
        } else {
            assetInfo = JSON.parse(body);
            cb(null, assetInfo[catalogItemId]);
        }
    });
}

function getItemVersions(itemInfo)
{
    var versions = [];
    
    itemInfo.releaseInfo.forEach(function oneachRelease(releaseInfo)
    {
        if (releaseInfo.compatibleApps) {
            releaseInfo.compatibleApps.forEach(function oneachApp(compatibleApp)
            {
                var minorVersion = Number(compatibleApp.substr(5)); /// Cut off "UE_4."
                versions.push({
                    title: "4." + minorVersion,
                    appId: releaseInfo.appId,
                    version: compatibleApp,
                    minorVersion: minorVersion,
                });
            });
        }
    });
    // Sorts latest version first
    versions.sort(function reverseNumberSort(a, b)
    {
        return b.minorVersion - a.minorVersion;
    });
    return versions;
}

function getItemBuildInfo(catalogItemId, appId, cb)
{
    var opts = {
        // From launcher: https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/public/assets/Windows/cd2c274e32764e4b9bba09115e732fde/MagicEffects411?label=Live
        uri: "https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/public/assets/Windows/" + catalogItemId + "/" + appId,
        headers: {
            Authorization: "bearer " + epicOauth.access_token,
            Origin: "allar_ue4_marketplace_commandline",
            "User-Agent": "game=UELauncher, engine=UE4, build=allar_ue4_marketplace_commandline"
        },
        qs: {
            label: "Live"
        },
    };
    
    request.get(opts, function(err, res, body)
    {
        var itemBuildInfo;
        
        if (err || res.statusCode !== 200) {
            console.error(err);
            cb(err || res);
        } else {
            itemBuildInfo = JSON.parse(body);
            cb(null, itemBuildInfo);
        }
    });
}

function getItemManifest(itemBuildInfo, cb)
{
    var opts = {
        uri: itemBuildInfo.items.MANIFEST.distribution + itemBuildInfo.items.MANIFEST.path,
        headers: {
            Origin: "allar_ue4_marketplace_commandline",
            "User-Agent": "game=UELauncher, engine=UE4, build=allar_ue4_marketplace_commandline"
        },
        qs: {
            label: "Live"
        },
    };
    
    request.get(opts, function(err, res, body)
    {
        var manifest;
        
        if (err || res.statusCode !== 200) {
            console.error(err);
            cb(err || res);
        } else {
            manifest = JSON.parse(body);
            cb(null, manifest);
        }
    });
}

var hexChars = ["0", "1", "2", "3", "4", "5", "6", "7","8", "9", "A", "B", "C", "D", "E", "F"];

function byteToHex(b)
{
  return hexChars[(b >> 4) & 0x0f] + hexChars[b & 0x0f];
}

// Takes hash of 24-character decimal form (8 * 3char) and outputs 16-character hex in reverse byte order
function chunkHashToReverseHexEncoding(chunkHash)
{
    var outHex = "";
    var i;
    
    for (i = 0; i < 8; ++i) {
        outHex = byteToHex(parseInt(chunkHash.substring(i * 3, i * 3 + 3))) + outHex;
    }
    return outHex;
}

function buildItemChunkListFromManifest(manifest)
{
    // Build chunk URL list
    var chunks = [];
    var chunk;
    var hash;
    var group;
    var filename;
    //Ref: https://download.epicgames.com/Builds/Rocket/Automated/MagicEffects411/CloudDir/ChunksV3/22/AAC7EF867364B218_CE3BE4D54E7B4ECE663C8EAC2D8929D6.chunk
    ///TODO: Use domain from manifest
    var chunkBaseURL = "http://download.epicgames.com/Builds/Rocket/Automated/" + manifest.AppNameString + "/CloudDir/ChunksV3/";
    for (chunk in manifest.ChunkHashList) {
        hash = chunkHashToReverseHexEncoding(manifest.ChunkHashList[chunk]);
        ///I Think I can just do manifest.DataGroupList[chunk].substr(1);
        group = String(Number(manifest.DataGroupList[chunk]));
        if (group.length < 2) {
            group = "0" + group;
        }
        filename = chunk + ".chunk";
        chunks.push({
            guid: chunk,
            hash: hash,
            //sha: manifest.ChunkShaList[chunk],
            //fileSize: manifest.ChunkFilesizeList[chunk],
            url: chunkBaseURL + group + "/" + hash + "_" + filename,
            filename: filename,
        });
    }
    return chunks;
}
login(null, null, function ondone()
{
    var id = "9af8943b537a4bc0a0cb962bccb0d3cd"; /// Brushify.io
    
    console.log("Getting asset info...");
    getAssetInfo(id, function (err, assetInfo)
    {
        var versions = getItemVersions(assetInfo);
        console.log("Getting build info...");
        getItemBuildInfo(id, versions[0].appId, function (err, itemBuildInfo)
        {
            //console.log(manifest);
            console.log("Getting item manifest...");
            getItemManifest(itemBuildInfo, function (err, manifest)
            {
                //console.log(manifest);
            });
        });
    });
    
}, function onerror(err, message)
{
    console.error(message);
    console.error(err);
}, function progress(amount, message, total)
{
    console.log(message + " " + Math.round((amount / total) * 100) + "%");
});

