"use strict";

/**
 * Much of this code is derived from or inspired by these open source projects:
 * https://github.com/Allar/ue4-mp-downloader
 * https://github.com/neutrino-steak/UE4LinuxLauncher
 */

var fs = require("fs");
var p = require("path");
var request = require("request");
var zlib = require("zlib");
var crypto = require("crypto");

var fakeJar = {};
var epicOauth;
var epicSSO;
var debug = false;

var config;
var getCookies;

var cacheDir = p.join(__dirname, "cache");

var hexChars = "0123456789ABCDEF";

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


function mkdirSync(dir)
{
    try {
        fs.mkdirSync(dir);
    } catch (e) {}
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
                Cookie: getWebCookieString(),
                Origin: "allar_ue4_marketplace_commandline" ,
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
            console.log(body);
            console.log(res.headers)
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
        
        if (onprogress) {
            onprogress(5, "Getting OAuth exchange code...", totalSteps);
        }
        
        request.get(opts, function(err, res, body)
        {
            var json;
            
            if (!err && res.statusCode == 200) {
                json = JSON.parse(body);
                epicOauth.code = json.code;
                
                if (onprogress) {
                    onprogress(6, "Got OAuth exchange code", totalSteps);
                }
                
                // Grab our SSO token
                if (epicSSO === undefined) {
                    getSSOWithOAuthCode(ondone, onerror, onprogress);
                } else {
                    if (onprogress) {
                        onprogress(7, "Successfully authorized", totalSteps);
                    }
                    if (ondone) {
                        ondone();
                    }
                    /// Prevent the functions from being triggerd again.
                    ondone = onerror = onprogress = function () {};
                }
                // renew our token before it expires
                setTimeout(oAuthExchange, 250 * 1000).unref();
            } else {
                if (onerror) {
                    onerror(err, "OAuth renew failed: " + JSON.stringify(res, "", "  "))
                } else {
                    console.error(err, "OAuth renew failed: " + JSON.stringify(res, "", "  "));
                }
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
        
        if (onprogress) {
            onprogress(6, "Getting SSO code...", totalSteps);
        }
        
        request.get(opts, function(err, res, body)
        {
            /// Should it do this?
            //updateFakeJar(res.headers["set-cookie"]);
            
            if (!err && res.statusCode == 302) {
                if (onprogress) {
                    onprogress(7, "Successfully authorized", totalSteps);
                }
                if (ondone) {
                    ondone();
                }
                /// Prevent the functions from being triggerd again.
                ondone = onerror = onprogress = function () {};
            } else {
                if (onerror) {
                    onerror(err, "Failed to authorize");
                } else {
                    console.error(err, "Failed to authorize");
                }
            }
        });
    }
    
    webAuthorize.withUsernameAndPass = function login(user, pass, ondone, onerror, onprogress)
    {
        ondone = ondone || function () {};
        onerror = onerror || function () {};
        onprogress = onprogress || function () {};
        /// TEMP
        var auth = require("./etc/auth.json");
        getWebLoginForm(auth.u, auth.p, ondone, onerror, onprogress);
    };
    
    return webAuthorize;
}());


function getAssetInfo(catalogItemId, cb)
{
    var basePath = p.join(cacheDir, "assetInfo");
    var path = p.join(basePath, catalogItemId + ".json");
    
    fs.readFile(path, "utf8", function onread(err, data)
    {
        var json;
        
        if (!err && data) {
            try {
                ///TODO: Check if in offline mode.
                /// Cache expires after 12 hours
                if (Date.now() - fs.statSync(path).mtime.valueOf() < 1000 * 60 * 60 * 12) {
                    json = JSON.parse(data);
                }
            } catch (e) {}
        }
        
        if (err || !json) {
            authenticateIfNecessary(null, null, function ()
            {
                downloadAssetInfo(catalogItemId, function (err, assetInfo)
                {
                    if (!err && assetInfo) {
                        mkdirSync(basePath);
                        fs.writeFileSync(path, JSON.stringify(assetInfo));
                    }
                    cb(err, assetInfo);
                });
            });
        } else {
            ///TEMP
            console.log("Using cached assetInfo");
            cb(null, json);
        }
    });
}

function downloadAssetInfo(catalogItemId, cb)
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
    var versions = {};
    
    itemInfo.releaseInfo.forEach(function oneachRelease(releaseInfo)
    {
        if (releaseInfo.compatibleApps) {
            releaseInfo.compatibleApps.forEach(function oneachApp(compatibleApp)
            {
                var minorVersion = Number(compatibleApp.substr(3)); /// Cut off "UE_4."
                versions[minorVersion] = {
                    appId: releaseInfo.appId,
                    version: compatibleApp,
                    minorVersion: minorVersion,
                };
            });
        }
    });
    /*
    // Sorts latest version first
    versions.sort(function reverseNumberSort(a, b)
    {
        return b.minorVersion - a.minorVersion;
    });
    */
    return versions;
}

function getItemBuildInfo(catalogItemId, appId, cb)
{
    var basePath = p.join(cacheDir, "buildInfo");
    var path = p.join(basePath, catalogItemId + "_" + appId + ".json");
    
    fs.readFile(path, "utf8", function onread(err, data)
    {
        var json;
        
        if (!err && data) {
            try {
                ///TODO: Check if in offline mode.
                json = JSON.parse(data);
                
                /// itemBuildInfo comes with expires data, but we can fall back to checking the last modified time.
                if (/*(json.expires && (new Date(json.expires)).valueOf() < Date.now()) ||*/
                    Date.now() - fs.statSync(path).mtime.valueOf() > 1000 * 60 * 60 * 12) {
                    json = undefined;
                }
            } catch (e) {}
        }
        
        if (err || !json) {
            authenticateIfNecessary(null, null, function ()
            {
                downloadItemBuildInfo(catalogItemId, appId, function (err, itemBuildInfo)
                {
                    if (!err && itemBuildInfo) {
                        mkdirSync(basePath);
                        fs.writeFileSync(path, JSON.stringify(itemBuildInfo));
                    }
                    cb(err, itemBuildInfo);
                });
            });
        } else {
            ///TEMP
            console.log("Using cached itemBuildInfo");
            cb(null, json);
        }
    });
}

function downloadItemBuildInfo(catalogItemId, appId, cb)
{
    var opts = {
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

function getItemManifest(itemBuildInfo, useAuth, cb)
{
    var basePath = p.join(cacheDir, "manifests");
    var path = p.join(basePath, itemBuildInfo.assetId + ".json");
    
    fs.readFile(path, "utf8", function onread(err, data)
    {
        var json;
        
        if (!err && data) {
            try {
                ///TODO: Check if in offline mode.
                /// Cache expires after 12 hours
                if (Date.now() - fs.statSync(path).mtime.valueOf() < 1000 * 60 * 60 * 12) {
                    json = JSON.parse(data);
                }
            } catch (e) {}
        }
        
        if (err || !json) {
            authenticateIfNecessary(null, null, function ()
            {
                downloadItemManifest(itemBuildInfo, -1, useAuth, function (err, itemBuildInfo)
                {
                    if (!err && itemBuildInfo) {
                        mkdirSync(basePath);
                        fs.writeFileSync(path, JSON.stringify(itemBuildInfo));
                    }
                    cb(err, itemBuildInfo);
                });
            });
        } else {
            ///TEMP
            console.log("Using cached manifest");
            cb(null, json);
        }
    });
}

function selectDistributionHost(itemBuildInfo, hostNum)
{
    var distributionName;
    
    if (hostNum < 0) {
        distributionName = itemBuildInfo.items.MANIFEST.distribution;
    } else if (itemBuildInfo.items.MANIFEST.additionalDistributions && hostNum < itemBuildInfo.items.MANIFEST.additionalDistributions.length) {
        distributionName = itemBuildInfo.items.MANIFEST.additionalDistributions[hostNum];
    }
    
    if (distributionName && distributionName.slice(-1) !== "/") {
        distributionName += "/";
    }
    
    return distributionName;
}

function downloadItemManifest(itemBuildInfo, hostNum, useAuth, cb)
{
    var distributionName = selectDistributionHost(itemBuildInfo, hostNum);
    var opts = {
        uri: distributionName + itemBuildInfo.items.MANIFEST.path + "?" + itemBuildInfo.items.MANIFEST.signature,
        headers: {
            Origin: "allar_ue4_marketplace_commandline",
            "User-Agent": "game=UELauncher, engine=UE4, build=allar_ue4_marketplace_commandline",
            Accept: "*/*",
        },
        qs: {
            label: "Live"
        },
    };
    
    if (!distributionName) {
        console.error("No more distrubition hosts to try for manifest.");
        return cb(new Error("No more distrubition hosts to try for manifest."));
    }
    
    if (useAuth) {
        opts.headers.Authorization = "bearer " + epicOauth.access_token;
        opts.headers.Cookie = getWebCookieString();
    }
    
    request.get(opts, function(err, res, body)
    {
        var manifest;
        
        if ((err || res.statusCode !== 200) && !useAuth) {
            ///TEMP
            console.log("Using auth");
            console.error(body);
            
            downloadItemManifest(itemBuildInfo, hostNum, true, cb);
        } else if (err || res.statusCode !== 200) {
            console.error(err);
            if (res) {
                console.error(res.statusCode);
            }
            console.error(opts);
            console.error(body);
            downloadItemManifest(itemBuildInfo, ++hostNum, useAuth, cb);
        } else {
            manifest = JSON.parse(body);
            cb(null, manifest);
        }
    });
}


function byteToHex(b)
{
  return hexChars[(b >> 4) & 0x0f] + hexChars[b & 0x0f];
}

/// Takes hash of 24-character decimal form (8 * 3char) and outputs 16-character hex in reverse byte order
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
    var guid;
    var hash;
    var group;
    var filename;
    var chunkBaseURL = "Builds/Rocket/Automated/" + manifest.AppNameString + "/CloudDir/ChunksV3/";
    for (guid in manifest.ChunkHashList) {
        hash = chunkHashToReverseHexEncoding(manifest.ChunkHashList[guid]);
        ///I Think I can just do manifest.DataGroupList[guid].substr(1);
        group = String(Number(manifest.DataGroupList[guid]));
        if (group.length < 2) {
            group = "0" + group;
        }
        filename = guid + ".chunk";
        chunks.push({
            guid: guid,
            hash: hash,
            group: group,
            //sha: manifest.ChunkShaList[guid],
            //fileSize: manifest.ChunkFilesizeList[guid],
            url: chunkBaseURL + group + "/" + hash + "_" + filename,
            filename: filename,
            hostNum: -1,
        });
    }
    return chunks;
}

function isHashCorrect(data, expectedHash)
{
    return crypto.createHash("sha1").update(data).digest("hex").toUpperCase() === expectedHash;
}

function downloadChunks(itemBuildInfo, manifest, chunks, ondone, onerror, onprogress)
{
    var appId = manifest.AppNameString;
    var concurrent = 4;
    var downloadCount = 0;
    var len = chunks.length;
    var hasFinished = false;
    var j;
    var appBasePath = p.join(cacheDir, "assets", appId);
    var chunksBasePath = p.join(appBasePath, "chunks");
    var downloading = 1;
    var downloaded = 2;
    
    function isAllDone()
    {
        var i;
        if (!hasFinished) {
            for (i = 0; i < len; ++i) {
                if (chunks[i].downloadStatus !== downloaded) {
                    return false;
                }
            }
            
            /// Make sure it won't get triggered twice.
            hasFinished = true;
            /// Done!
            ondone();
        }
    }
    
    function downloadChunk(i)
    {
        var chunk;
        var dir;
        var path;
        var opts;
        var distributionName;
        
        if (i >= len) {
            return isAllDone();
        }
        
        chunk = chunks[i];
        
        if (chunk.downloadStatus) {
            return setImmediate(downloadChunk, ++i);
        }
        
        dir = p.join(chunksBasePath, chunk.group);
        
        ///TODO: Simply use the filename (guid) and use the first two letters of it for the subdir.
        //path = p.join(dir, chunk.hash + "_" + chunk.filename + "X");
        path = p.join(dir, chunk.hash + "_" + chunk.filename);
        
        if (fs.existsSync(path)) {
            chunk.downloadStatus = downloaded;
            /*
            ///TEMP:
            if (!isHashCorrect(fs.readFileSync(path), manifest.ChunkShaList[chunk.guid])) {
                console.log("Bad hash");
                console.log(chunk);
                process.exit();
            }
            */
            downloadCount++;
            return setImmediate(downloadChunk, ++i);
        }
        
        chunk.downloadStatus = downloading;
        
        mkdirSync(dir);
        
        distributionName = selectDistributionHost(itemBuildInfo, chunk.hostNum);
        
        if (!distributionName) {
            console.error("No more distrubition hosts to try for chunk.");
            return onerror(new Error("No more distrubition hosts to try for chunk."));
        }
        
        opts = {
            url: distributionName + chunk.url,
            timeout: 30000,
            encoding: null, /// Download the file with binary encoding
        };
        
        if (debug) {
            console.log("Downloading " + (i + 1) + " of " + len + " " + opts.url);
        }
        console.log("Downloading " + (i + 1) + " of " + len + " " + opts.url);
        
        chunk.hostNum++;
        
        request.get(opts, function(err, res, body)
        {
            var headerSize;
            var compressed;
            var data;
            
            function onWrite(err)
            {
                if (err) {
                    console.error(err);
                    console.error(opts);
                    ///TODO: Stop? Retry?
                    onerror(err);
                } else {
                    if (debug) {
                        console.log("Downloaded " + (i + 1) + " (" + Math.round(((i + 1) / len) * 100) + "%)");
                    }
                    downloadCount++;
                    onprogress(downloadCount / len);
                    chunk.downloadStatus = downloaded;
                    downloadChunk(++i);
                }
            }
            
            if (err || res.statusCode >= 400) {
                console.error(err || res.statusCode);
                console.error(opts);
                /// Try another distribution host.
                //onerror(err);
                chunk.downloadStatus = undefined;
                return downloadChunk(i);
            } else {
                
                headerSize = body[8];
                compressed = (body[40] === 1);
                
                if (compressed) {
                    zlib.unzip(body.slice(headerSize), function onUnzip(err, unzipped)
                    {
                        if (!isHashCorrect(unzipped, manifest.ChunkShaList[chunk.guid])) {
                            console.error("Unzipped hash is wrong. Trying again...");
                            chunk.downloadStatus = undefined;
                            return downloadChunk(i);
                        }
                        
                        fs.writeFile(path, unzipped, onWrite);
                    });
                } else {
                    data = body.slice(headerSize);
                    if (!isHashCorrect(data, manifest.ChunkShaList[chunk.guid])) {
                        console.error("Hash is wrong. Trying again...");
                        chunk.downloadStatus = undefined;
                        return downloadChunk(i);
                    }
                    fs.writeFile(path, data, onWrite);
                }
            }
        });
    }
    
    mkdirSync(p.join(cacheDir, "assets"));
    mkdirSync(appBasePath);
    mkdirSync(chunksBasePath);
    
    for (j = 0; j < concurrent; ++j) {
        downloadChunk(j);
    }
}

function deleteDir(path)
{
    var i;
    var dirs;
    var curPath;
    
    if (fs.existsSync(path)) {
        dirs = fs.readdirSync(path);
        for (i = dirs.length - 1; i>= 0; --i) {
            curPath = p.join(path, dirs[i]);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteDir(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        }
        fs.rmdirSync(path);
    }
}

function mkdirs(dir, relBase)
{
    var pathToCreate = p.relative(relBase, dir);
    var parts;
    var path;
    var len;
    var i;    
    
    if (pathToCreate) {
        parts = pathToCreate.split(p.sep);
        len = parts.length;
        path = relBase;
        for (i = 0; i < len; ++i) {
            try {
                path = p.join(path, parts.shift());
                fs.mkdirSync(path);
            } catch (e) {}
        }
    }
}

function extractChunks(manifest, ondone, onerror, onprogress)
{
    var chunkBasePath = p.join(cacheDir, "assets", manifest.AppNameString, "chunks");
    var extractedBasePath = p.join(cacheDir, "assets", manifest.AppNameString, "extracted");
    var fullFileList = manifest.FileManifestList;
    var filesCount = fullFileList.length;
    
    mkdirSync(extractedBasePath);
    
    (function loop(i)
    {
        var fileList;
        var fileSize;
        var fileName;
        var buffer;
        var bufferOffset;
        
        if (i >= filesCount) {
            return ondone();
        }
        
        fileList = fullFileList[i]; /// Rename to chunkList?
        fileSize = 0;
        fileName = p.join(extractedBasePath, fileList.Filename);
        
        mkdirs(p.dirname(fileName), extractedBasePath);
        
        fileList.FileChunkParts.forEach(function (chunkPart)
        {
            fileSize += parseInt("0x" + chunkHashToReverseHexEncoding(chunkPart.Size));
        });
        
        buffer = Buffer.alloc(fileSize);
        bufferOffset = 0;
        
        // Start reading chunk data and assembling it into a buffer
        fileList.FileChunkParts.forEach(function (chunkPart)
        {
            var guid = chunkPart.Guid;
            var offset = parseInt("0x" + chunkHashToReverseHexEncoding(chunkPart.Offset));
            var size   = parseInt("0x" + chunkHashToReverseHexEncoding(chunkPart.Size));
            var hash = chunkHashToReverseHexEncoding(manifest.ChunkHashList[guid]);
            var group = String(Number(manifest.DataGroupList[guid]));
            var chunkPath;
            var file;
            
            if (group.length < 2) {
                group = "0" + group;
            }
            
            chunkPath = p.join(chunkBasePath, group, hash + "_" + guid + ".chunk");
            
            file = fs.openSync(chunkPath, "r");
            
            fs.readSync(file, buffer, bufferOffset, size, offset);
            fs.closeSync(file);
            bufferOffset += size;
        });
        
        // Write out the assembled buffer
        //console.log(fileName)
        fs.writeFileSync(fileName, buffer);
        
        ///TODO: Delete a chunk when it is no longer necessary.
        ///NOTE: One chunk may be used for many files.
        
        onprogress((i + 1) / filesCount);
        
        setImmediate(loop, i + 1);
        ///TODO: Progress
    }(0));
}


function authenticateIfNecessary(user, pass, ondone, onerror, onprogress)
{
    if (epicOauth) {
        setImmediate(ondone);
    } else {
        getCookies(function (cookies)
        {
            setCookiesFromBrowser(cookies);
            login(ondone, onerror || function onerror(err, message)
            {
                console.error(message);
                console.error(err);
            }, onprogress || function progress(amount, message, total)
            {
                console.log(message + " " + Math.round((amount / total) * 100) + "%");
            });
        });
    }
}

function moveToProject(appNameString, projectBaseDir, ondone, onerror)
{
    var extractedBasePath = p.join(cacheDir, "assets", appNameString, "extracted");
    
    function copyDir(fromDir, toDir, cb)
    {
        fs.readdir(fromDir, function onread(err, files)
        {
            var len;
            
            if (err) {
                return onerror(err);
            }
            
            len = files.length;
            
            (function loop(i)
            {
                var fullFromPath;
                var fullToPath;
                
                function next()
                {
                    setImmediate(loop, i + 1);
                }
                
                if (i >= len) {
                    return setImmediate(cb);
                }
                
                fullFromPath = p.join(fromDir, files[i]);
                fullToPath = p.join(toDir, files[i]);
                
                ///TODO: Error handling
                if (fs.lstatSync(fullFromPath).isDirectory()) {
                    ///TODO: Error handling
                    //console.log(fullToPath);
                    mkdirSync(fullToPath);
                    setImmediate(copyDir, fullFromPath, fullToPath, next);
                } else {
                    //console.log("file:", fullToPath);
                    fs.copyFile(fullFromPath, fullToPath, function oncopy(err)
                    {
                        if (err) {
                            return onerror(err);
                        }
                        next();
                    });
                }
            }(0));
        });
    }
    
    copyDir(extractedBasePath, projectBaseDir, ondone);
}

/// Make sure cacheDir exists.
mkdirSync(cacheDir);

function addAssetToProject(assetData, projectData, ondone, onerror, onprogress)
{
    var id = assetData.catalogItemId;
    var projectVersion = projectData.version;
    var projectBaseDir = projectData.dir;
    
    console.log("Getting asset info...");
    getAssetInfo(id, function (err, assetInfo)
    {
        var versions = getItemVersions(assetInfo);
        
        if (!versions[projectVersion]) {
            return onerror("Version " + projectVersion + " is not avaiable.");
        }
        ///TODO: Skip getting build info if already extracted?
        console.log("Getting build info...");
        getItemBuildInfo(id, versions[projectVersion].appId, function (err, itemBuildInfo)
        {
            ///TODO: Skip getting manifest if already extracted?
            console.log("Getting item manifest...");
            getItemManifest(itemBuildInfo, true, function (err, manifest)
            {
                var chunks;
                
                if (err) {
                    console.error(err);
                    return onerror(err);
                }
                chunks = buildItemChunkListFromManifest(manifest);
                
                ///TODO: Skip downloading chunks if already extracted!
                console.log("Downloading chunks...");
                downloadChunks(itemBuildInfo, manifest, chunks, function ()
                {
                    console.log("Downloaded chunks!")
                    extractChunks(manifest, function ()
                    {
                        ///TODO: Delete chunks
                        ///      Move files
                        console.log("Extracted chunks!")
                        onprogress({type: "copying"});
                        moveToProject(manifest.AppNameString, projectBaseDir, ondone, function (err)
                        {
                            console.error(err);
                            onerror(err);
                        });
                    }, function (err)
                    {
                        console.error(err);
                        onerror(err);
                    }, function (percent)
                    {
                        //console.log(Math.round(percent * 100) + "%");
                        onprogress({type: "extracting", percent: percent});
                    });
                }, function (err)
                {
                    console.error(err);
                    onerror(err);
                }, function (percent)
                {
                    //console.log(Math.round(percent * 100) + "%");
                    onprogress({type: "downloading", percent: percent});
                });
            });
        });
    });
}


module.exports = function init(_config, _getCookies)
{
    config = _config;
    getCookies = _getCookies;
    
    return addAssetToProject;
};
