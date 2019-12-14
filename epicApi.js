"use strict";

var fs = require("fs");
var p = require("path");
var request = require("request");
var zlib = require("zlib");
var crypto = require("crypto");

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

function getItemManifest(itemBuildInfo, cb, useAuth)
{
    var opts = {
        uri: itemBuildInfo.items.MANIFEST.distribution + itemBuildInfo.items.MANIFEST.path + "?" + itemBuildInfo.items.MANIFEST.signature,
        headers: {
            Origin: "allar_ue4_marketplace_commandline",
            "User-Agent": "game=UELauncher, engine=UE4, build=allar_ue4_marketplace_commandline",
            Accept: "*/*",
        },
        qs: {
            label: "Live"
        },
    };
    
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
            
            getItemManifest(itemBuildInfo, cb, true);
        } else if (err || res.statusCode !== 200) {
            console.error(err);
            if (res) {
                console.error(res.statusCode);
            }
            console.error(body);
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
    var guid;
    var hash;
    var group;
    var filename;
    //Ref: https://download.epicgames.com/Builds/Rocket/Automated/MagicEffects411/CloudDir/ChunksV3/22/AAC7EF867364B218_CE3BE4D54E7B4ECE663C8EAC2D8929D6.chunk
    ///TODO: Use domain from manifest
    var chunkBaseURL = "http://download.epicgames.com/Builds/Rocket/Automated/" + manifest.AppNameString + "/CloudDir/ChunksV3/";
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
        });
    }
    return chunks;
}

function isHashCorrect(data, expectedHash)
{
    return crypto.createHash("sha1").update(data).digest("hex").toUpperCase() === expectedHash;
}

function downloadChunks(manifest, chunks, ondone, onerror, onprogress)
{
    var appId = manifest.AppNameString;
    var concurrent = 4;
    var len = chunks.length;
    var hasFinished = false;
    var j;
    var appBasePath = p.join(__dirname, "downloads", appId);
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
        
        if (i >= len) {
            return isAllDone();
        }
        
        chunk = chunks[i];
        
        if (chunk.downloadStatus) {
            return setImmediate(downloadChunk, ++i);
        }
        
        dir = p.join(chunksBasePath, chunk.group);
        
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
            return setImmediate(downloadChunk, ++i);
        }
        
        chunk.downloadStatus = downloading;
        
        try {
            fs.mkdirSync(dir);
        } catch (e) {}
        
        opts = {
            url: chunk.url,
            encoding: null, /// Download the file with binary encoding
        };
        
        console.log("Downloading " + (i + 1) + " of " + len + " " + chunk.url);
        
        // ///HACK: TEMP so that we don't have to redownload
        // var pathFake = p.join(dir, chunk.hash + "_" + chunk.filename);
        // fs.readFile(pathFake, null, function(err, body)
        request.get(opts, function(err, res, body)
        {
            // ///HACK: TEMP
            // var res = {statusCode: 200};
            
            var headerSize;
            var compressed;
            var data;
            
            function onWrite(err)
            {
                if (err) {
                    console.error(err);
                    ///TODO: Stop? Retry?
                    onerror(err);
                } else {
                    console.log("Downloaded " + (i + 1) + " (" + Math.round(((i + 1) / len) * 100) + "%)");
                    chunk.downloadStatus = downloaded;
                    downloadChunk(++i);
                }
            }
            
            if (err || res.statusCode >= 400) {
                console.error(err);
                ///TODO: Stop? Retry?
                onerror(err);
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
    
    try {
        fs.mkdirSync(p.join(__dirname, "downloads"));
    } catch (e) {}
    try {
        fs.mkdirSync(appBasePath);
    } catch (e) {}
    try {
        fs.mkdirSync(chunksBasePath);
    } catch (e) {}
    
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
    var chunkBasePath = p.join(__dirname, "downloads", manifest.AppNameString, "chunks");
    var extractedBasePath = p.join(__dirname, "downloads", manifest.AppNameString, "extracted");
    var fullFileList = manifest.FileManifestList;
    var filesCount = fullFileList.length;
    
    try {
        fs.mkdirSync(extractedBasePath);
    } catch (e) {}
    
    (function loop(i)
    {
        if (i >= filesCount) {
            return ondone();
        }
        
        var fileList = fullFileList[i]; /// Rename to chunkList?
        var fileSize = 0;
        var fileName = p.join(extractedBasePath, fileList.Filename);
        
        if (p.dirname(fileName) === "/storage/UE4Launcher/downloads/Brushify9af8943b537aV1/extracted/Content/Brushify/DistanceMeshes/Mountain_Generic_01") debugger;
        
        mkdirs(p.dirname(fileName), extractedBasePath);
        
        fileList.FileChunkParts.forEach(function (chunkPart)
        {
            fileSize += parseInt("0x" + chunkHashToReverseHexEncoding(chunkPart.Size));
        });
        
        console.log(fileList)
        console.log(fileSize)
        console.log(fileName)
        
        var buffer = Buffer.alloc(fileSize);
        var bufferOffset = 0;
        
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
        console.log(fileName)
        fs.writeFileSync(fileName, buffer);
        
        setImmediate(loop, i + 1);
        ///TODO: Progress
    }(0));
}


/*
var manifest = require("./etc/manifest-formated.json");
var chunks = buildItemChunkListFromManifest(manifest);
downloadChunks(manifest, chunks, function ondone()
{
    console.log("Downloaded chunks!")
    extractChunks(manifest, function ondone()
    {
        ///TODO: Delete chunks
        ///      Move files
        console.log("Extracted chunks!")
    }, function onerror(err)
    {
        console.error(err);
    }, function onprogress(percent)
    {
        console.log(Math.round(percent * 100) + "%");
    });
}, function onerror(err)
{
    console.error(err);
}, function onprogress(percent)
{
    console.log(Math.round(percent * 100) + "%");
});

return;
*/

login(null, null, function ondone()
{
    //var id = "9af8943b537a4bc0a0cb962bccb0d3cd"; /// Brushify.io
    //var id = "be35e1818bc0425bbe957b8f642dc43e"; /// Gideon
    var id = "d64e30482a3046318029240b276cbd72"; // "Free Fantasy Weapon Sample Pack"
    
    console.log("Getting asset info...");
    getAssetInfo(id, function (err, assetInfo)
    {
        var versions = getItemVersions(assetInfo);
        console.log("Getting build info...");
        getItemBuildInfo(id, versions[0].appId, function (err, itemBuildInfo)
        {
            console.log("Getting item manifest...");
            getItemManifest(itemBuildInfo, function (err, manifest)
            {
                ///TODO: It's important to store the manifest file on the hard drive because it seems to block you from downloading it multiple times.
                ///      Should store each step.
                var chunks = buildItemChunkListFromManifest(manifest);
                
                console.log("Downloading chunks...");
                downloadChunks(manifest, chunks, function ondone()
                {
                    console.log("Downloaded chunks!")
                    extractChunks(manifest, function ondone()
                    {
                        ///TODO: Delete chunks
                        ///      Move files
                        console.log("Extracted chunks!")
                    }, function onerror(err)
                    {
                        console.error(err);
                    }, function onprogress(percent)
                    {
                        console.log(Math.round(percent * 100) + "%");
                    });
                }, function onerror(err)
                {
                    console.error(err);
                }, function onprogress(percent)
                {
                    console.log(Math.round(percent * 100) + "%");
                });
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

