"use strict";

// Modules to control application life and create native browser window
var electron = require("electron");
var p = require("path");
var os = require("os");
var fs = require("fs");
var request = require("./libs/request-helper.js");
var loadJsonFile = require("./libs/loadJsonFile.js");
var app = electron.app;
var BrowserWindow = electron.BrowserWindow;
var Menu = electron.Menu;
var ipc = electron.ipcMain;
var loginWindow;
var isLoggedIn = false;
var cookies;
var offline = false;

var addAssetToProject;

var cacheDir = p.join(__dirname, "cache");
var vaultPath = p.join(cacheDir, "vault.json");
var configPath = p.join(__dirname, "config.json");
var assetJsonPath = p.join(cacheDir, "assets.json");

var vaultData;
var configData;
var assetsData;

function mkdirSync(dir)
{
    try {
        fs.mkdirSync(dir);
    } catch (e) {}
}

function loadConfig()
{
    configData = loadJsonFile.sync(configPath, {});
    
    if (!configData.engines) {
        configData.engines = [];
    }
}

function saveConfig(data)
{
    configData = data || configData;
    fs.writeFileSync(configPath, JSON.stringify(configData, "", "    "));
}



/*
var menuTemplate = [
    {
        label: "Window Manager",
        submenu: [
            { label: "create New" }
        ]
    },
    {
      label : "View",
            submenu : [
        { role : "reload" },
        { label : "custom reload" }
        ]
    }
];
*/

mkdirSync(cacheDir);

loadConfig();


app.on("browser-window-created",function(e,window) {
    window.setMenu(null);
});

// Keep a global reference of the window object, if you don"t, the window will
// be closed automatically when the JavaScript object is garbage collected.
var mainWindow;

/// Removes the top menu.
Menu.setApplicationMenu(null);


function getJson(url, options, cb)
{
    /// Make requireLogin optional.
    if (typeof options === "function") {
        cb = options;
        options = {};
    }
    if (typeof options.login === "undefined") {
        options.login = true;
    }
    
    downloadURL(url, options, function ondownload(err, data)
    {
        if (!err) {
            try {
                data = JSON.parse(data);
            } catch (e) {
                return cb(e);
            }
        }
        
        cb(err, data);
    });
}


function downloadURL(url, options, cb)
{
    var urlOpts;
    var retries = 0;
    var sendRequest;
    
    /// Make requireLogin optional.
    if (typeof requireLogin === "function") {
        cb = options;
        options = {};
    }
    
    if (options.login && !cookies) {
        return getCookies(function ()
        {
            downloadURL(url, options, cb);
        });
    }
    
    urlOpts = options.urlOpts || {
        url: url,
    };
    
    if (options.login) {
        if (!urlOpts.headers) {
            urlOpts.headers = {};
        }
        urlOpts.headers = {
            Cookie: request._getWebCookieString(),
        };
    }
    
    if (typeof urlOpts.timeout === "undefined") {
        urlOpts.timeout = 30000;
    }
    
    sendRequest = function ()
    {
        request.get(urlOpts, function(err, res, body)
        {
            ///TODO: Retry
            if (err || !res) {
                ++retries;
                console.error(err);
                if (retries < 4) {
                    console.log("Retrying download (" + retries + ")");
                    return setTimtout(sendRequest, 1000);
                }
            } else if (res.statusCode >= 300) {
                err = {code: res.statusCode};
            }
            cb(err, body);
        });
    };
    
    sendRequest();
}



function login(cb)
{
    var contents;
    var needsToRedirect;
    var redirectTimer;
    
    /// Another url
    /// https://www.unrealengine.com/id/login?redirectUrl=https%3A%2F%2Fwww.unrealengine.com%2Fmarketplace%2Fen-US%2Fstore&client_id=932e595bedb643d9ba56d3e1089a5c4b&noHostRedirect=true
    console.log("logging in")
    
    if (loginWindow) {
        try {
            loginWindow.close();
        } catch (e) {}
    }
    
    isLoggedIn = false;
    
    
    // Create the browser window.
    loginWindow = new BrowserWindow({
        width: 800,
        height: 800,
        /*
        webPreferences: {
            preload: p.join(__dirname, "preload.js")
        },
        */
        icon: p.join(__dirname, "ue-logo.png"),
        show: true, /// Use FALSE for graceful loading
        title: "Unreal Engine Launcher"
    });
    contents = loginWindow.webContents;
    
    // and load the index.html of the app.
    //loginWindow.loadFile("index.html")
    loginWindow.loadURL("https://www.unrealengine.com/login");
    /*
    loginWindow.removeMenu();
    
    loginWindow.setMenuBarVisibility(false);
    
    loginWindow.setMenu(null);
    */
    
    //let menu = Menu.buildFromTemplate([]);
    
    
    // Open the DevTools.
    // loginWindow.webContents.openDevTools()
    
    // Emitted when the window is closed.
    /*
    loginWindow.on("closed", function ()
    {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    });
    */
    
    /// Set the show to FALSE to use.
    /**
    loginWindow.once("ready-to-show", function ()
    {
        loginWindow.show()
    });
    */
    /*
    contents.on("will-navigate", function (e, url)
    {
        console.log("will-navigate");
        console.log(url);
        ///event.preventDefault();
    });
    contents.on("did-navigate", function (e, url, code, status)
    {
        console.log("did-navigate");
        console.log(url, code, status);
        ///event.preventDefault();
    });
    */
    function onLogin()
    {
        //contents.stop();
        console.log("Logged in");
        isLoggedIn = true;
        loginWindow.hide();
        ///loginWindow.close(); /// ???
        /// We need to let it load a little longer to set cookies, it seems.
        /*
        setTimeout(function ()
        {
            //contents.stop();
            loginWindow.close();
        }, 5000);
        */
        //app.quit();
        //if (!wantsCookies) {
            cb(null, loginWindow);
        //}
        
    }
    
    function redirectOnLogOut()
    {
        if (needsToRedirect) {
            needsToRedirect = false;
            loginWindow.loadURL("https://www.unrealengine.com/login");
            console.log("Redirecting to login.");
        }
    }
    
    function getCookies(cb)
    {
        electron.session.defaultSession.cookies.get({}).then(function onget(sessionCookies)
        {
            cb(null, sessionCookies);
        }).catch(function onerror(err)
        {
            cb(err);
        });
    }
    
    function hasLoginCookie(sessionCookies)
    {
        var i;
        
        for (i = sessionCookies.length - 1; i >= 0; --i) {
            if (sessionCookies[i] && sessionCookies[i].name && sessionCookies[i].name.toUpperCase() === "EPIC_SSO") {
                return true;
            }
        }
        
        return false;
    }
    
    function checkIfLoggedIn()
    {
        getCookies(function onget(err, sessionCookies)
        {
            if (!isLoggedIn) {
                if (err) {
                    console.error("Error getting cookies");
                    console.error(err);
                } else {
                    //console.log(sessionCookies);
                    if (hasLoginCookie(sessionCookies)) {
                        cookies = sessionCookies;
                        request._setCookiesFromBrowser(cookies);
                        onLogin();
                    }
                }
            }
        });
    }
    
    contents.on("did-frame-navigate", function (e, url, code, status, isMainFrame, frameProcessId, frameRoutingId)
    {
        console.log("did-frame-navigate", url)
        
        if (needsToRedirect) {
            redirectOnLogOut();
        //} else if (url === "https://www.unrealengine.com/" || /^https\:\/\/www\.unrealengine\.com\/.*\/feed$/.test(url)) {
        //    onLogin();
        } else if (!isLoggedIn) {
            checkIfLoggedIn();
        }
        //console.log("did-frame-navigate");
        //console.log(url, code, status, isMainFrame, frameProcessId, frameRoutingId);
        /// Went here after logging out.
        /// did-frame-navigate https://www.unrealengine.com/id/login?redirectUrl=https%3A%2F%2Fwww.unrealengine.com%2F&client_id=932e595bedb643d9ba56d3e1089a5c4b&noHostRedirect=true
    });
    contents.on("did-frame-finish-load", function (e, isMainFrame, frameProcessId, frameRoutingId)
    {
        console.log("did-frame-finish-load");
        if (!isLoggedIn) {
            checkIfLoggedIn();
        }
    });
    /*
    contents.on("did-navigate-in-page", function (e, url, isMainFrame, frameProcessId, frameRoutingId)
    {
        console.log("did-frame-navigate");
        console.log(url, isMainFrame, frameProcessId, frameRoutingId);
        ///event.preventDefault();
    });
    contents.on("page-title-updated", function (e, title, explicitSet)
    {
        console.log("page-title-updated");
        console.log(title, explicitSet)
    });
    */
    /// Quixel login
    /// https://www.epicgames.com/id/login?client_id=b9101103b8814baa9bb4e79e5eb107d0&response_type=code
    contents.on("page-title-updated", function (e, title, explicitSet)
    {
        console.log("page-title-updated", title, explicitSet)
        ///TODO: Make sure it goes to the right page when logging out
        ///page-title-updated Logging out... | Epic Games true
        if (typeof title === "string" && title.indexOf("Logging out") > -1) {
            console.log("Detected logout. Will redirect to log in.");
            /// Redirect to the login page.
            needsToRedirect = true;
            /// Sometimes it does not redirect.
            redirectTimer = setTimeout(redirectOnLogOut, 5000);
        }
    });
}

function getCookies(cb)
{
    if (!cookies) {
        login(function (err)
        {
            cb(cookies);
        });
    } else {
        setImmediate(cb, cookies);
    }
}

function sanitizeConfigWindowData()
{
    if (typeof configData.isMaximized !== "boolean") {
        configData.isMaximized = true;
    }
    if (typeof configData.width !== "number" || configData.width < 100) {
        configData.width = 1200;
    }
    if (typeof configData.height !== "number" || configData.height < 100) {
        configData.height = 1000;
    }
    if (typeof configData.x !== "number" || typeof configData.y !== "number") {
        configData.x = undefined;
        configData.y = undefined;
    }
}

function createMainWindow()
{
    sanitizeConfigWindowData();
    console.log(configData)
    
    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: configData.width, /// 1200
        height: configData.height, /// 1000
        x: configData.x,
        y: configData.y,
        fullscreenable: true,
        webPreferences: {
            //preload: p.join(__dirname, "preload.js")
            nodeIntegration: true,
            devTools: configData.devTools,
        },
        
        icon: p.join(__dirname, "ue-logo.png"),
        show: true, /// Use FALSE for graceful loading
        title: "Unreal Engine Launcher"
    });
    var contents = mainWindow.webContents;
    // and load the index.html of the app.
    mainWindow.loadFile("pages/unreal_engine.html");
    
    if (configData.devTools) {
        mainWindow.webContents.openDevTools()
    } else {
        /// Make it show up in the json file for easy editing.
        configData.devTools = false;
    }
    
    if (configData.isMaximized) {
        mainWindow.maximize();
    }
    
    function saveSizeAndPos()
    {
        var size = mainWindow.getSize();
        var pos = mainWindow.getPosition();
        configData.width = size[0];
        configData.height = size[1];
        configData.x = pos[0];
        configData.y = pos[1];
        saveConfig();
    }
    
    mainWindow.on("close", function ()
    {
        if (!configData.isMaximized) {
            saveSizeAndPos();
        }
        /// Make sure everything is closed.
        if (loginWindow) {
            try {
                loginWindow.close();
            } catch (e) {}
        }
    });
    
    mainWindow.on("maximize", function ()
    {
        configData.isMaximized = true;
        saveConfig();
    });
    
    mainWindow.on("unmaximize", function ()
    {
        configData.isMaximized = false;
        saveSizeAndPos();
    });
}

function isInVault(vault, el)
{
    var i;
    
    for (i = vault.length - 1; i >= 0; --i) {
        if (vault[i].catalogItemId === el.catalogItemId) {
            return true;
        }
    }
    
    return false;
}

function downloadVaultData(cb)
{
    var vault;
    var dlCount = 25;
    var dlTotal;
    var dlIndex;
    
    function done()
    {
        console.log("Done downloading vault");
        cb(vault);
    }
    
    if (vaultData && vaultData.length) {
        vault = vaultData;
        dlIndex = vaultData.length;
    } else {
        vault = [];
        dlIndex = 0
    }
    //debugger;
    (function loop()
    {
        var url;
        
        console.log(dlIndex);
        //debugger;
        if (dlTotal !== undefined && dlIndex >= dlTotal - 1) {
            return done();
        }
        
        url = "https://www.unrealengine.com/marketplace/api/assets/vault?start=" + dlIndex + "&count=" + dlCount;
        
        getJson(url, function (err, data)
        {
            var addedCount = 0;
            //debugger;
            console.log(data);
            if (err || !data || data.status !== "OK") {
                console.error("Cannot download vault page: " + url)
                if (data) {
                    console.error(data);
                }
                ///TODO: Try again?
            } else {
                dlTotal = data.data.paging.total;
                
                if (data.data && data.data.elements && data.data.elements.length) {
                    data.data.elements.forEach(function addIfNew(element)
                    {
                        ///NOTE: If you request beyond the total number in the vault, you will get back some of the last elements.
                        if (!isInVault(vault, element)) {
                            vault.push(element);
                            ++addedCount;
                        }
                    });
                    if (addedCount) {
                        dlIndex += addedCount;
                    } else {
                        return done();
                    }
                } else {
                    return done();
                }
                loop();
            }
            //console.log(data);
            //fs.writeFileSync(p.join(__dirname, "test.json"), JSON.stringify(data));
        });
    }());
}

function getVault()
{
    if (typeof vaultData === "undefined") {
        vaultData = loadJsonFile.sync(vaultPath, []);
    }
    
    return vaultData;
}
        
function updateVault(ignoreCache, cb)
{
    var shouldDownload;
    
    if (offline) {
        if (cb) {
            setImmediate(cb);
        }
    } else {
        shouldDownload = true;
        
        try {
            /// Only update the vault every 18 hours by default.
            if (!ignoreCache && fs.existsSync(vaultPath) && Date.now() - fs.statSync(vaultPath).mtime.valueOf() < 1000 * 60 * 60 * 18) {
                shouldDownload = false;
            }
        } catch (e) {}
        
        if (shouldDownload) {
            downloadVaultData(function (data)
            {
                if (data) {
                    vaultData = data;
                } else {
                    vaultData = [];
                }
                
                fs.writeFileSync(vaultPath, JSON.stringify(vaultData));
                
                if (cb) {
                    cb(vaultData);
                }
            });
        } else {
            setImmediate(cb);
        }
    }
}

function startup()
{
    loadAssetCache(function ()
    {
        createMainWindow();
    });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", startup);

/// Delete?
// Quit when all windows are closed.
app.on("window-all-closed", function ()
{
    app.quit();
    setTimeout(function ()
    {
        /// Make sure everything stops, even downloads.
        process.exit();
    }, 200).unref();
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.


/*
ipc.on("asynchronous-message", function (event, arg)
{
  console.log(arg) // prints "ping"
  event.reply("asynchronous-reply", "pong")
})

ipc.on("synchronous-message", function (event, arg)
{
  console.log(arg) // prints "ping"
  event.returnValue = "pong"
})
*/

function getEngineVersion(path)
{
    var data;
    var match;
    
    try {
        /// Check the last tag for the engine number.
        data = require("child_process").execSync("git describe --abbrev=0", {stdio: "pipe", cwd: path, encoding: "utf8"}).trim();
        match = data.match(/^(\d+\.\d+).*release$/);
        if (match) {
            return match[1];
        }
    } catch (e) {}
    
    try {
        /// Check BRANCH_NAME in UE4Defines.pri for the engine number.
        data = fs.readFileSync(p.join(path, "UE4Defines.pri"), "utf8");
        match = data.match(/BRANCH_NAME=".*?(\d+\.\d+)"/);
        if (match) {
            return match[1];
        }
    } catch (e) {}
}


function addEngine(path)
{
    var engineBasePath;
    var engineVersion;
    var execPath;
    
    /// Is this a link to the file?
    try {
        if (!fs.lstatSync(path).isDirectory()) {
            engineBasePath = p.join(path, "..", "..", "..", "..");
        }
        execPath = path;
    } catch (e) {}
    
    if (!engineBasePath) {
        /// Is it a link to the folder with the binary?
        try {
            if (fs.existsSync(p.join(path, "UE4Editor"))) {
                engineBasePath = p.join(path, "..", "..", "..");
                execPath = p.join(path, "UE4Editor");
            }
        } catch (e) {}
    }
    
    if (!engineBasePath) {
        /// Assume that it's the path to the root of the engine.
        engineBasePath = path;
        ///TODO: Support other platforms
        execPath = p.join(engineBasePath, "Engine", "Binaries", "Linux", "UE4Editor");
    }
    
    engineVersion = getEngineVersion(engineBasePath);
    
    if (engineVersion) {
        configData.engines.push({
            baseDir: engineBasePath,
            version: engineVersion,
            execPath: execPath,
        });
        saveConfig();
    }
}

function loadAssetCache(cb)
{
    loadJsonFile(assetJsonPath, {}, function onload(json)
    {
        assetsData = json;
        cb();
    });
}


ipc.on("getVault", function (e/*, arg*/)
{
    console.log("getting vault");
    
    e.returnValue = JSON.stringify(getVault());
});

ipc.on("updateVault", function (e, ignoreCache)
{
    console.log("updating vault");
    
    updateVault(ignoreCache, function (data)
    {
        e.reply("updateVault", data ? JSON.stringify(data) : "");
    });
});

ipc.on("getConfig", function (e, arg)
{
    e.returnValue = JSON.stringify(configData);
});
/*
ipc.on("saveConfig", function (e, arg)
{
    e.returnValue = JSON.stringify(getVault());
});
*/

ipc.on("getAssetsData", function (e, arg)
{
    e.returnValue = JSON.stringify(assetsData);
});

ipc.on("addEngine", function (e, path)
{
    /// Make sure it does not freeze.
    try {
        addEngine(path);
    } catch (e) {
        console.error(e);
    }
    /// If you do not set this, it will hang.
    e.returnValue = "";
});

ipc.on("addAssetToProject", function (e, data)
{
    var resId;
    
    console.log("Adding asset");
    
    data = JSON.parse(data);
    
    resId = {asset: data.assetData.catalogItemId, project: data.projectData.name};
    
    console.log(data);
    console.log(resId);
    
    addAssetToProject(data.assetData, data.projectData, function ondone()
    {
        console.log("Done with", resId);
        loadAssetCache(function ()
        {
            e.reply("addingAssetDone", JSON.stringify(resId));
        });
    }, function onerror(err)
    {
        e.reply("addingAssetErr", JSON.stringify({id: resId, err: err}));
    }, function onprogress(progress)
    {
        e.reply("addingAssetProgress", JSON.stringify({id: resId, progress: progress}));
    });
});

addAssetToProject = require("./libs/epicApi.js")(configData, getCookies);
