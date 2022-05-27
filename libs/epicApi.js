"use strict";

/**
 * Much of this code is derived from or inspired by these open source projects:
 * https://github.com/Allar/ue4-mp-downloader
 * https://github.com/neutrino-steak/UE4LinuxLauncher
 */

var fs = require("fs");
var p = require("path");
var request = require("./request-helper.js");
var zlib = require("zlib");
var crypto = require("crypto");
var loadJsonFile = require("./loadJsonFile.js");

var epicOauth;
var epicSSO;

var config;
var loginIfNecessary;
var logout;

var cacheDir = p.join(__dirname, "..", "cache");
var assetJsonPath = p.join(cacheDir, "assets.json");

var assetsData;

var hexChars = "0123456789ABCDEF";

function mkdirSync(dir)
{
    try {
        fs.mkdirSync(dir);
    } catch (e) {}
}

var login = (function ()
{
    var totalSteps = 5;
    
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
                request._updateFakeJar(res.headers["set-cookie"]);
                
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
                Cookie: request._getWebCookieString(),
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
                request._updateFakeJar(res.headers["set-cookie"]);
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
            uri: "https://www.epicgames.com/id/api/authenticate",
            headers: {
                Cookie: request._getWebCookieString(),
                //Origin: "allar_ue4_marketplace_commandline",
                Origin: "https://www.epicgames.com",
                //Host: "accounts.unrealengine.com",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) EpicGamesLauncher/10.18.1-13954725+++Portal+Release-Live UnrealEngine/4.23.0-13954725+++Portal+Release-Live Chrome/59.0.3071.15 Safari/537.36",
                Referer: "https://www.epicgames.com/id/login/welcome",
                "X-Epic-Event-Action": "login",
                "X-Epic-Event-Category": "login",
                "X-Epic-Strategy-Flags": "guardianEmailVerifyEnabled=false;guardianEmbeddedDocusignEnabled=true;guardianKwsFlowEnabled=false;minorPreRegisterEnabled=false",
                "X-Requested-With": "XMLHttpRequest",
                "X-XSRF-TOKEN": request._fakeJar["XSRF-TOKEN"],
            },
        };
        
        onprogress(2, "Authenticating...", totalSteps);
        
        request.get(opts, function(err, res, body)
        {
            if (!err && res.statusCode === 200) {
                request._updateFakeJar(res.headers["set-cookie"]);
                /// Unnecessary?
                renewCSRF(ondone, onerror, onprogress, function ()
                {
                    generateExchange(ondone, onerror, onprogress);
                });
            } else {
                console.log(res.headers)
                console.log("---")
                console.log(body)
                console.log("~~~")
                console.log(err)
                console.error("GETTING CSRF failed");
                onerror(err, "GETTING CSRF  failed", res, body);
            }
        });
    }
    
    function renewCSRF(ondone, onerror, onprogress, cb)
    {
        var opts = {
            uri: "https://www.epicgames.com/id/api/csrf",
            headers: {
                Cookie: request._getWebCookieString(),
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) EpicGamesLauncher/10.18.1-13954725+++Portal+Release-Live UnrealEngine/4.23.0-13954725+++Portal+Release-Live Chrome/59.0.3071.15 Safari/537.36",
                Referer: "https://www.epicgames.com/id/login/welcome",
                "X-Epic-Event-Action": "login",
                "X-Epic-Event-Category": "login",
                "X-Epic-Strategy-Flags": "guardianEmailVerifyEnabled=false;guardianEmbeddedDocusignEnabled=true;guardianKwsFlowEnabled=false;minorPreRegisterEnabled=false",
                "X-Requested-With": "XMLHttpRequest",
                "X-XSRF-TOKEN": request._fakeJar["XSRF-TOKEN"],
            },
        };
        
        onprogress(3, "Renewing CSRF...", totalSteps);
        
        request.get(opts, function(err, res, body)
        {
            if (!err && res.statusCode < 300) {
                request._updateFakeJar(res.headers["set-cookie"]);
                cb(ondone, onerror, onprogress);
            } else {
                console.log(res.headers)
                console.log("---")
                console.log(body)
                console.log("~~~")
                console.log(err)
                console.error("GETTING CSRF failed");
                onerror(err, "GETTING CSRF  failed", res, body);
            }
        });
    }
    
    function generateExchange(ondone, onerror, onprogress)
    {    
        var opts = {
            uri: "https://www.epicgames.com/id/api/exchange/generate",
            headers: {
                Cookie: request._getWebCookieString(),
                Origin: "https://www.epicgames.com",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) EpicGamesLauncher/10.18.1-13954725+++Portal+Release-Live UnrealEngine/4.23.0-13954725+++Portal+Release-Live Chrome/59.0.3071.15 Safari/537.36",
                Referer: "https://www.epicgames.com/id/login/welcome",
                "X-Epic-Event-Action": "login",
                "X-Epic-Event-Category": "login",
                "X-Epic-Strategy-Flags": "guardianEmailVerifyEnabled=false;guardianEmbeddedDocusignEnabled=true;guardianKwsFlowEnabled=false;minorPreRegisterEnabled=false",
                "X-Requested-With": "XMLHttpRequest",
                "X-XSRF-TOKEN": request._fakeJar["XSRF-TOKEN"],
            },
        };
        
        onprogress(4, "Generating Exchange...", totalSteps);
        
        request.post(opts, function(err, res, body)
        {
            var json;
            if (!err && res.statusCode === 200) {
                request._updateFakeJar(res.headers["set-cookie"]);
                try {
                    json = JSON.parse(body);
                    console.log(json)
                    console.log(json.code)
                    initOAuth(json.code, ondone, onerror, onprogress);
                } catch (e) {
                    console.error(err);
                }
            } else {
                console.log(res.headers)
                console.log("---")
                console.log(body)
                console.log("~~~")
                console.log(err)
                console.error("GETTING CSRF failed");
                onerror(err, "GETTING CSRF  failed", res, body);
            }
        });
    }
    
    function initOAuth(code, ondone, onerror, onprogress)
    {
        var opts = {
            uri: "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token",
            form: {
                grant_type: "exchange_code",
                exchange_code: code,
                token_type: "eg1",
            },
            headers: {
                /// Is this ID neccessary? What about each part?
                "X-Epic-Correlation-ID": "UE4-" + request._fakeJar.EPIC_DEVICE + "-E5E6229A474CBD0CD937F2A211029A98-BA82B58E4F388B14AD8D2694E9FB47B2",
                "User-Agent": "UELauncher/10.18.1-13954725+++Portal+Release-Live Windows/10.0.10240.1.256.64bit",
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: "basic MzRhMDJjZjhmNDQxNGUyOWIxNTkyMTg3NmRhMzZmOWE6ZGFhZmJjY2M3Mzc3NDUwMzlkZmZlNTNkOTRmYzc2Y2Y=",
            },
        };
        
        onprogress(5, "Initiating OAuth...", totalSteps);
        
        request.post(opts, function(err, res, body)
        {
            var json;
            if (!err && res.statusCode === 200) {
                request._updateFakeJar(res.headers["set-cookie"]);
                try {
                    console.log(body)
                    epicOauth = JSON.parse(body);
                    console.log(epicOauth)
                    ondone();
                } catch (e) {
                    console.error(err);
                }
            } else {
                console.log(res.headers)
                console.log("---")
                console.log(body)
                console.log("~~~")
                console.log(err)
                console.error("GETTING CSRF failed");
                onerror(err, "GETTING CSRF  failed", res, body);
            }
        });
    }
    
    webAuthorize.withUsernameAndPass = function login(user, pass, ondone, onerror, onprogress)
    {
        ondone = ondone || function () {};
        onerror = onerror || function () {};
        onprogress = onprogress || function () {};
        /// TEMP
        var auth = require("../etc/auth.json");
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
                /// Cache expires after 1 week
                if (Date.now() - fs.statSync(path).mtime.valueOf() < 1000 * 60 * 60 * 24 * 7) {
                    json = JSON.parse(data);
                }
            } catch (e) {}
        }
        
        if (err || !json) {
            authenticateIfNecessary(function ondone()
            {
                downloadAssetInfo(catalogItemId, function (err, assetInfo)
                {
                    if (!err && assetInfo) {
                        mkdirSync(basePath);
                        fs.writeFileSync(path, JSON.stringify(assetInfo));
                    }
                    cb(err, assetInfo);
                });
            }, function onerr(err)
            {
                try {
                    json = JSON.parse(data);
                    cb(null, json, true);
                } catch (e) {
                    cb(err);
                }
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

function getItemBuildInfo(catalogItemId, appId, skipCache, cb)
{
    var basePath = p.join(cacheDir, "buildInfo");
    var path = p.join(basePath, catalogItemId + "_" + appId + ".json");
    
    fs.readFile(path, "utf8", function onread(err, data)
    {
        var json;
        
        if (!err && data) {
            try {
                /// itemBuildInfo comes with expires data, but we can fall back to checking the last modified time.
                if (skipCache || /*(json.expires && (new Date(json.expires)).valueOf() < Date.now()) ||*/
                    Date.now() - fs.statSync(path).mtime.valueOf() > 1000 * 60 * 60 * 24 * 7) {0
                    json = JSON.parse(data);
                }
            } catch (e) {}
        }
        
        if (err || !json) {
            authenticateIfNecessary(function ()
            {
                downloadItemBuildInfo(catalogItemId, appId, function (err, itemBuildInfo)
                {
                    if (!err && itemBuildInfo) {
                        mkdirSync(basePath);
                        fs.writeFileSync(path, JSON.stringify(itemBuildInfo));
                    }
                    cb(err, itemBuildInfo, skipCache);
                });
            }, function onerr(err)
            {
                try {
                    json = JSON.parse(data);
                    cb(null, json, true);
                } catch (e) {
                    cb(err);
                }
            });
        } else {
            ///TEMP
            console.log("Using cached itemBuildInfo");
            cb(null, json, skipCache);
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

function getItemManifest(catalogItemId, appId, itemBuildInfo, useAuth, skipCache, cb)
{
    var basePath = p.join(cacheDir, "manifests");
    var path = p.join(basePath, catalogItemId + "_" + appId + ".json");
    
    fs.readFile(path, "utf8", function onread(err, data)
    {
        var json;
        
        if (!err && data) {
            try {
                ///TODO: Check if in offline mode.
                /// Cache expires after 1 week
                if (skipCache || Date.now() - fs.statSync(path).mtime.valueOf() < 1000 * 60 * 60 * 24 * 7) {
                    json = JSON.parse(data);
                }
            } catch (e) {}
        }
        
        if (err || !json) {
            authenticateIfNecessary(function ()
            {
                downloadItemManifest(itemBuildInfo, -1, useAuth, function (err, manifest)
                {
                    if (!err && manifest) {
                        mkdirSync(basePath);
                        fs.writeFileSync(path, JSON.stringify(manifest));
                    }
                    cb(err, manifest, skipCache);
                });
            }, function onerr(err)
            {
                try {
                    json = JSON.parse(data);
                    cb(null, json, true);
                } catch (e) {
                    cb(err);
                }
            });
        } else {
            ///TEMP
            console.log("Using cached manifest");
            cb(null, json, skipCache);
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
            //Host: "www.unrealengine.com",
        },
    };
    
    if (!distributionName) {
        console.error("No more distrubition hosts to try for manifest.");
        return cb(new Error("No more distrubition hosts to try for manifest."));
    }
    
    if (useAuth) {
        opts.headers.Authorization = "bearer " + epicOauth.access_token;
        opts.headers.Cookie = request._getWebCookieString();
    }
    
    request.get(opts, function(err, res, body)
    {
        var manifest;
        
        //if ((err || res.statusCode !== 200) && !useAuth) {
        if (!useAuth && res && res.statusCode === 501) {
            ///TEMP
            console.log("Using auth");
            console.error(body);
            
            downloadItemManifest(itemBuildInfo, hostNum, true, cb);
        } else if (err || !res || res.statusCode !== 200) {
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

function buildItemChunkList(itemBuildInfo, manifest)
{
    // Build chunk URL list
    var chunks = [];
    var guid;
    var hash;
    var group;
    var filename;
    var chunkBaseURL = itemBuildInfo.items.CHUNKS.path.substr(0, itemBuildInfo.items.CHUNKS.path.indexOf("/CloudDir")) + "/CloudDir/ChunksV3/";
    
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

function downloadChunks(id, itemBuildInfo, manifest, chunks, ondone, onerror, onprogress)
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
            
            assetsData[id][appId].downloaded = true;
            saveAssetsData(ondone);
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
                    /// Downloaded chunk.
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
    
    /// Has it already been downloaded?
    if (assetsData[id][appId].downloaded) {
        return setImmediate(ondone);
    }
    
    
    mkdirSync(p.join(cacheDir, "assets"));
    mkdirSync(appBasePath);
    mkdirSync(chunksBasePath);
    
    for (j = 0; j < concurrent; ++j) {
        downloadChunk(j);
    }
}


function deleteDir(path, cb)
{
    var i;
    var dirs;
    var curPath;
    fs.readdir(path, function onread(err, paths)
    {
        var len = 0;
        
        if (paths) {
            len = paths.length;
        }
        
        (function loop(i)
        {
            var curPath;
            
            function next()
            {
                setImmediate(loop, i + 1);
            }
            
            if (i === len) {
                return fs.rmdir(path, cb);
            }
            
            curPath = p.join(path, paths[i]);
            
            fs.lstat(curPath, function (err, stats)
            {
                if (stats && stats.isDirectory()) {
                    deleteDir(curPath, next);
                } else {
                    fs.unlink(curPath, next);
                }
            });
        }(0));
    });
}

function mkdirs(dir, relBase, cb)
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
        (function loop(i)
        {
            if (i === len) {
                return cb();
            }
            
            path = p.join(path, parts.shift());
            
            fs.mkdir(path, function onmkdir()
            {
                setImmediate(loop, i + 1);
            });
        }(0));
    } else {
        cb();
    }
}

function extractChunks(id, manifest, ondone, onerror, onprogress)
{
    var appId = manifest.AppNameString;
    var chunkBasePath = p.join(cacheDir, "assets", appId, "chunks");
    var extractedBasePath = p.join(cacheDir, "assets", appId, "extracted");
    var fullFileList = manifest.FileManifestList;
    var filesCount = fullFileList.length;
    
    function onExtractionComplete()
    {
        console.log("Deleting chunks after extraction");
        ///TODO: Delete chunks as they are not needed (but a chunk can be used more than once).
        deleteDir(chunkBasePath, function ondel()
        {
            assetsData[id][appId].extracted = true;
            saveAssetsData(ondone);
        });
    }
    
    if (assetsData[id][appId].extracted) {
        return setImmediate(ondone);
    }
    
    fs.mkdir(extractedBasePath, function ()
    {
        (function loop(i)
        {
            var fileList;
            var fileName;
            var writeOffset = 0;
            
            if (i >= filesCount) {
                return onExtractionComplete();
            }
            
            fileList = fullFileList[i]; /// Rename to chunkList?
            fileName = p.join(extractedBasePath, fileList.Filename);
            
            mkdirs(p.dirname(fileName), extractedBasePath, function extractChunk()
            {
                fs.open(fileName, "w", function onopen(err, outFile)
                {
                    var chunkPartsLen = fileList.FileChunkParts.length;
                    
                    (function loopFileChunkParts(chunkCount)
                    {
                        if (chunkCount === chunkPartsLen) {
                            ++i;
                            onprogress(i / filesCount);
                            return fs.close(outFile, function onclose()
                            {
                                setImmediate(loop, i);
                            });
                        }
                        
                        var chunkPart = fileList.FileChunkParts[chunkCount];
                        var guid = chunkPart.Guid;
                        var offset = parseInt("0x" + chunkHashToReverseHexEncoding(chunkPart.Offset));
                        var size   = parseInt("0x" + chunkHashToReverseHexEncoding(chunkPart.Size));
                        var hash = chunkHashToReverseHexEncoding(manifest.ChunkHashList[guid]);
                        var group = String(Number(manifest.DataGroupList[guid]));
                        var chunkPath;
                        var chunkFile;
                        var buffer = Buffer.alloc(size);
                        
                        if (group.length < 2) {
                            group = "0" + group;
                        }
                        
                        chunkPath = p.join(chunkBasePath, group, hash + "_" + guid + ".chunk");
                        
                        ///TODO: Error handling
                        fs.open(chunkPath, "r", function (err, chunkFile)
                        {
                            fs.read(chunkFile, buffer, 0, size, offset, function onread()
                            {
                                fs.close(chunkFile, function onclose()
                                {
                                    fs.write(outFile, buffer, 0, size, writeOffset, function onwrite()
                                    {
                                        writeOffset += size;
                                        setImmediate(loopFileChunkParts, chunkCount + 1);
                                    });
                                });
                            });
                        });
                        
                        ///TODO: Delete a chunk when it is no longer necessary.
                        ///NOTE: One chunk may be used for many files.
                        
                        ///TODO: One file might have many, many chunks, so the progress should (at least sometimes) update with each chunk. It would be better to update based on chunks rather than files, somehow.
                    }(0));
                });
            });
        }(0));
    });
}


function authenticateIfNecessary(ondone, onerror, onprogress)
{
    if (epicOauth) {
        setImmediate(ondone);
    } else {
        loginIfNecessary(function ()
        {
            //request._setCookiesFromBrowser(cookies);
            login(ondone, onerror || function onerror(err, message)
            {
                console.error(message);
                console.error(err);
                onerror(err);
            }, onprogress || function progress(amount, message, total)
            {
                console.log(message + " " + Math.round((amount / total) * 100) + "%");
            });
        });
    }
}

function isDir(path, cb)
{
    fs.lstat(path, function onstat(err, stats)
    {
        if (err) {
            cb(err);
        } else {
            cb(null, stats.isDirectory());
        }
    });
}

function moveToProject(extractedBasePath, projectBaseDir, ondone, onerror)
{
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
                
                isDir(fullFromPath, function onIsDir(err, isDirectory)
                {
                    if (err) {
                        return onerror(err);
                    }
                    if (isDirectory) {
                        console.log("Creating " + fullToPath);
                        fs.mkdir(fullToPath, function onMkDir()
                        {
                            ///NOTE: The dirs might already exist, so it should ignore most errors.
                            ///  {errno: -17, code: 'EEXIST'}
                            copyDir(fullFromPath, fullToPath, next);
                        });
                    } else {
                        console.log("Copying " + fullToPath)
                        fs.copyFile(fullFromPath, fullToPath, function oncopy(err)
                        {
                            if (err) {
                                ///TODO: Error handling
                                //return onerror(err);
                                console.log(err);
                            }
                            next();
                        });
                    }
                });
            }(0));
        });
    }
    
    copyDir(extractedBasePath, projectBaseDir, ondone);
}

function loadAssetCache(cb)
{
    loadJsonFile(assetJsonPath, {}, function onload(json)
    {
        assetsData = json;
        cb();
    });
}

function saveAssetsData(cb)
{
    fs.writeFile(assetJsonPath, JSON.stringify(assetsData), function onwrite()
    {
        cb();
    });
}

/// Make sure cacheDir exists.
mkdirSync(cacheDir);

function addAssetToProject(assetInfo, projectData, ondone, onerror, onprogress)
{
    var id = assetInfo.catalogItemId;
    var projectVersion = projectData.version;
    var projectBaseDir = projectData.dir;
    
    loadAssetCache(function ()
    {
        console.log("Getting asset info...");
        getAssetInfo(id, function (err, assetInfo, skipCache)
        {
            var versions;
            
            if (err) {
                console.error(err);
                return onerror(err);
            }
            versions = getItemVersions(assetInfo);
            var version = null;

            // If the right version is not found, ideally we need to let the user decide.
            // While there is no dialog for that, we'll just take the first available version.
            // Maybe choose the latest version using semver.
            if (!versions[projectVersion]) {
                version = versions[Object.getOwnPropertyNames(versions)[0]];
                console.warn("Version " + projectVersion + " is not avaiable. Available versions: " + Object.getOwnPropertyNames(versions).join(", ") + ". Will use " + version.version);
            }
            else {
                version = versions[projectVersion];
            }
            ///TODO: Skip getting build info if already extracted?
            console.log("Getting build info...");
            getItemBuildInfo(id, version.appId, skipCache, function (err, itemBuildInfo, skipCache)
            {
                console.log(skipCache);
                if (err) {
                    console.error(err);
                    return onerror(err);
                }
                ///TODO: Skip getting manifest if already extracted?
                console.log("Getting item manifest...");
                getItemManifest(id, version.appId, itemBuildInfo, false, skipCache, function (err, manifest)
                {
                    var chunks;
                    var appId;
                    
                    if (err) {
                        console.error(err);
                        return onerror(err);
                    }
                    
                    appId = manifest.AppNameString;
                    chunks = buildItemChunkList(itemBuildInfo, manifest);
                    
                    /// Make sure that the assetsData exists.
                    if (!assetsData[id]) {
                        assetsData[id] = {};
                    }
                    if (!assetsData[id][appId]) {
                        assetsData[id][appId] = {};
                    }
                    
                    assetsData[id][appId].engineVersion = projectVersion;
                    
                    ///TODO: Skip downloading chunks if already extracted!
                    console.log("Downloading chunks...");
                    downloadChunks(id, itemBuildInfo, manifest, chunks, function ()
                    {
                        console.log("Downloaded chunks!");
                        
                        extractChunks(id, manifest, function ()
                        {
                            ///TODO: Delete chunks
                            ///      Move files
                            console.log("Extracted chunks!");
                            
                            /// Is there no project associated to the download?
                            if (!projectBaseDir) {
                                return ondone();
                            }
                            
                            onprogress({type: "copying"});
                            
                            moveToProject(p.join(cacheDir, "assets", manifest.AppNameString, "extracted"), projectBaseDir, ondone, function (err)
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
    });
}


module.exports = function init(_config, _loginIfNecessary, _logout)
{
    config = _config;
    loginIfNecessary = _loginIfNecessary;
    logout = _logout;
    
    return {
        addAssetToProject: addAssetToProject,
        moveToProject: moveToProject,
    };
};

/// Was this called directly?
if (require.main === module) {
    
}
