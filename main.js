"use strict";

// Modules to control application life and create native browser window
var electron = require("electron");
var p = require("path");
var app = electron.app;
var BrowserWindow = electron.BrowserWindow;
var Menu = electron.Menu;
var ipc = electron.ipcMain;

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

app.on('browser-window-created',function(e,window) {
    window.setMenu(null);
});

// Keep a global reference of the window object, if you don"t, the window will
// be closed automatically when the JavaScript object is garbage collected.
var mainWindow;

/// Removes the top menu.
Menu.setApplicationMenu(null);

/*
function getJson(url, cb)
{
    var downloadWindow = new BrowserWindow({
        width: 800,
        height: 800,
        show: true, /// Use FALSE for graceful loading
        title: "Unreal Engine Launcher"
    });
    var contents = downloadWindow.webContents;
    
    downloadWindow.loadURL(url).then(function ()
    {
        console.log("LOADED");
        //console.log(contents.getAllWebContents());
        contents.savePage("/tmp/electrontest.json", "HTMLOnly").then(function ()
        {
            console.log("saved /tmp/electrontest.json");
        }).catch(function (err)
        {
            console.error(err);
        });
    });
}
*/


function getJSON(url, options, cb)
{
    /// Make options optional.
    if (typeof options === "function") {
        cb = options;
        options = {};
    } else {
        options = options || {};
    }
    
    options.tmp = true;
    
    downloadURL(url, options, function ondownload(err, data)
    {
        if (!err) {
            try {
                data = JSON.parse(data);
            } catch (e) {
                return cb(true);
            }
        }
        
        cb(err, data);
    });
}


function downloadURL(url, options, cb)
{
    var downloadWindow;
    var contents;
    
    /// Make options optional.
    if (typeof options === "function") {
        cb = options;
        options = {};
    } else {
        options = options || {};
    }
    
    if (options.window) {
        downloadWindow = options.window;
    } else {
        downloadWindow = new BrowserWindow({show: false});
    }
    contents = downloadWindow.webContents;
    
    if (options.tmp) {
        if (!options.path) {
            /// Create a temporary filename.
            options.path = p.join(require("os").tmpdir(), "tmp-ue4-launcher-dl-" + Math.random() + "-" + Math.random());
        }
    }
    console.log(options)
    contents.session.on('will-download', (event, item, webContents) => {
        // Set the save path, making Electron not to prompt a save dialog.
        if (options.path) {
            item.setSavePath(options.path);
        }
    
        item.on('updated', (event, state) => {
            if (state === 'interrupted') {
                //console.log('Download is interrupted but can be resumed')
                if (options.onInterrupt) {
                    options.onInterrupt(item);
                }
            } else if (state === 'progressing') {
                if (item.isPaused()) {
                    //console.log('Download is paused')
                    if (options.onPause) {
                        options.onPause(item);
                    }
                } else {
                    //console.log(`Received bytes: ${item.getReceivedBytes()}` + " of " + item.getTotalBytes() + " " + (100 * (item.getReceivedBytes() / item.getTotalBytes())) + "%")
                    if (options.onProgress) {
                        options.onProgress(item.getReceivedBytes(), item.getTotalBytes(), item);
                    }
                }
            }
        })
        item.once('done', (event, state) => {
            var success = state === 'completed';
            var filePath = item.getSavePath();
            
            if ((options.tmp || options.returnFile) && success) {
                cb(!success, require("fs").readFileSync(filePath, "utf8"));
            } else {
                cb(!success);
            }
            
            if (options.tmp) {
                try {
                    fs.unlink(filePath, function () {});
                } catch (e) {}
            }
            /*
            if (state === 'completed') {
                console.log('Download successfully /tmp/test.json')
            } else {
                console.log(`Download failed: ${state}`)
            }
            */
        });
        
        if (options.onStart) {
            options.onStart(item);
        }
    });
    contents.downloadURL(url);
}



function login(cb) {
    // Create the browser window.
    var loginWindow = new BrowserWindow({
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
    var contents = loginWindow.webContents;
    var isLoggedIn = false;
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
        /// We need to let it load a little longer to set cookies, it seems.
        /*
        setTimeout(function ()
        {
            //contents.stop();
            loginWindow.close();
        }, 5000);
        */
        //app.quit();
        cb(false, loginWindow);
        
    }
    contents.on("did-frame-navigate", function (e, url, code, status, isMainFrame, frameProcessId, frameRoutingId)
    {
        if (url === "https://www.unrealengine.com/" || /^https\:\/\/www\.unrealengine\.com\/.*\/feed$/.test(url)) {
            onLogin();
        }
        //console.log("did-frame-navigate");
        //console.log(url, code, status, isMainFrame, frameProcessId, frameRoutingId);
    });
    contents.on("did-frame-finish-load", function (e, isMainFrame, frameProcessId, frameRoutingId)
    {
        console.log("did-frame-finish-load");
        if (isLoggedIn) {
            //loginWindow.close();
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
}

function createMainWindow()
{
    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        fullscreenable: true,
        webPreferences: {
            //preload: p.join(__dirname, "preload.js")
            nodeIntegration: true,
            devTools: true,
        },
        
        icon: p.join(__dirname, "ue-logo.png"),
        show: true, /// Use FALSE for graceful loading
        title: "Unreal Engine Launcher"
    });
    var contents = mainWindow.webContents;
    var isLoggedIn = false;
    // and load the index.html of the app.
    mainWindow.loadFile("pages/unreal_engine.html");
    
    mainWindow.webContents.openDevTools()
    mainWindow.maximize();
}

function startup()
{
    createMainWindow();
    /*
    login(function ()
    {
        createMainWindow();
    });
    */
    //getJson("file:///storage/UE4Launcher/package.json");
    //downloadURL("file:///storage/UE4Launcher/package.json");
    //downloadURL("https://cdn1.epicgames.com/ue/product/Screenshot/AssetDemo-1920x1080-e2a5e4c8b0dad08bcb8d8df7495d9ab4.jpg");
    //createMainWindow();
    /*
    getJSON("file:///storage/UE4Launcher/package.json", function (err, data)
    {
        console.log(err);
        console.log(data);
    });
    */
    /*
    login(function (err, loginWindow)
    {
        getJSON("https://www.unrealengine.com/marketplace/api/assets/vault?start=0&count=25", {window: loginWindow}, function (err, data)
        {
            console.error(err);
            console.log(data);
        });
    });
    */
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", startup);

/// Delete?
// Quit when all windows are closed.
app.on("window-all-closed", function () {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== "darwin") {
        app.quit();
    }
})

app.on("activate", function () {
    // On macOS it"s common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        createWindow();
    }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.


/*
ipc.on('asynchronous-message', (event, arg) => {
  console.log(arg) // prints "ping"
  event.reply('asynchronous-reply', 'pong')
})

ipc.on('synchronous-message', (event, arg) => {
  console.log(arg) // prints "ping"
  event.returnValue = 'pong'
})
*/
