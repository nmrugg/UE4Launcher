"use strict";

var fs = require("fs");
var p = require("path");
var spawn = require("child_process").spawn;
var events = require(p.join(__dirname, "..", "shared", "events.js"));
var electron = require("electron");
var ipc = electron.ipcRenderer;

var FindInPage = require('./js/find/index.js').FindInPage;

let findInPage = new FindInPage(require('@electron/remote').getCurrentWebContents(), {
  preload: true,
  offsetTop: 6,
  offsetRight: 10,
  boxBgColor: '#333',
  boxShadowColor: '#000',
  inputColor: '#aaa',
  inputBgColor: '#222',
  inputFocusColor: '#555',
  textColor: '#aaa',
  textHoverBgColor: '#555',
  caseSelectedColor: '#555',
  duration: 200
})

var unrealEnginePath = "/storage/UnrealEngine/Engine/Binaries/Linux/UE4Editor"; ///TODO: Get real path.
var lastEngineLaunched;
var lastProjectLaunched;
var lastProjectLaunchedTime;

var projects;
var vaultData;
var configData;
var assetsData;

var addingAssetsQueue = [];

function parseJson(str, defaultVal)
{
    var json;
    
    try {
        json = JSON.parse(str);
    } catch (e) {
        json = defaultVal;
    }
    
    return json;
}


function createProjectList()
{
    var projectsAreaEl = document.getElementById("projects");
    var defaultThumb = "imgs/default_game_thumbnail.png";
    
    projects = parseJson(ipc.sendSync("getProjects"), []);
    
    projectsAreaEl.innerHTML = "";
    
    projects.forEach(function (project)
    {
        var container = document.createElement("div");
        var img = document.createElement("div");
        var version = document.createElement("span");
        var name = document.createElement("div");
        
        function launch()
        {
            launchEngine(getEngine(project.version), project.projectPath);
        }
        
        container.className = "project-container";
        //img.src = project.thumb || defaultThumb;
        img.style.backgroundImage = "url(\"" + (project.thumb || defaultThumb) + "\")";
        img.className = "project-img-box";
        version.textContent = project.version;
        version.className = "project-version";
        name.textContent = project.name;
        name.className = "project-name";
        
        //container.appendChild(img);
        img.appendChild(version);
        container.appendChild(img);
        container.appendChild(name);
        
        img.onclick = launch;
        name.onclick = launch;
        
        projectsAreaEl.appendChild(container);
    });
}

function getEngine(version)
{
    var i;
    var len = configData.engines.length;
    
    for (i = 0; i < len; ++i) {
        if (configData.engines[i].version === version) {
            return configData.engines[i];
        }
    }
}

function launchEngine(engine, project)
{
    var args = [];
    var curTime = Date.now();
    var child;
    
    //engine = engine || unrealEnginePath
    if (!engine) {
        if (lastEngineLaunched) {
            engine = lastEngineLaunched;
        } else if (configData && configData.engines && configData.engines[0]) {
            ///HACK to just use the first engine installed.
            engine = configData.engines[0];
        } else {
            error("No engine installed");
        }
    }
    
    if (!lastProjectLaunchedTime || curTime - lastProjectLaunchedTime > 5000 || lastProjectLaunched !== project || lastEngineLaunched !== engine) {
        lastProjectLaunched = project;
        lastProjectLaunchedTime = curTime;
        lastEngineLaunched = engine;
        
        ///NOTE: The project path should be before the other args.
        if (project) {
            args = args.concat(project);
        }
        
        if (engine.args) {
            args = args.concat(engine.args);
        }
        
        console.log("Launching " + engine.execPath + (args ? " " + args.join(" ") : ""));
        child = spawn(engine.execPath, args, {detached: true, encoding: "utf8"});
        
        child.stdout.on("data", function (data)
        {
            if (typeof data !== "string") {
                data = data.toString();
            }
            console.log(data);
        });
        
        child.stderr.on("data", function (data)
        {
            if (typeof data !== "string") {
                data = data.toString();
            }
            console.info(data);
        });
        
        child.on("error", function (err)
        {
            console.error(err);
        });
    }
}

function addAssetToProject(assetData, projectData, assetContainerEl, assetImageEl)
{
    assetContainerEl.classList.add("installing-asset");
    assetImageEl.textContent = "Preparing...";
    
    addingAssetsQueue.push({
        assetData: assetData,
        projectData: projectData,
        assetContainerEl: assetContainerEl,
        assetImageEl: assetImageEl,
    });
    
    if (addingAssetsQueue.length === 1) {
        ipc.send("addAssetToProject", JSON.stringify({
            assetData: assetData,
            projectData: projectData,
        }));
    }
}

function prepareForAddingAssets()
{
    function processQueue()
    {
        if (addingAssetsQueue.length) {
            ipc.send("addAssetToProject", JSON.stringify({
                assetData: addingAssetsQueue[0].assetData,
                projectData: addingAssetsQueue[0].projectData,
            }));
        }
    }
    
    function onfinish()
    {
        addingAssetsQueue[0].assetImageEl.textContent = "";
        addingAssetsQueue[0].assetContainerEl.classList.remove("installing-asset");
        addingAssetsQueue.pop();
        processQueue();
        loadAssetsData();
    }
    
    ipc.on("addingAssetDone", function (event, data)
    {
        data = parseJson(data);
        console.log("Asset finished installing");
        console.log(data);
        onfinish();
    });
    
    ipc.on("addingAssetErr", function (event, data)
    {
        data = parseJson(data);
        error("Asset installation falied. " + JSON.stringify(data));
        console.error(data);
        
        onfinish();
    });
    
    ipc.on("addingAssetProgress", function (event, data)
    {
        var str = "";
        
        data = parseJson(data);
        console.log(data);
        
        if (data.progress.type === "downloading") {
            str = "Downloading...";
        } else if (data.progress.type === "extracting") {
            str = "Extracting...";
        } else if (data.progress.type === "copying") {
            str = "Copying...";
        }
        
        if (data.progress.percent) {
            str += (data.progress.percent * 100).toFixed(2) + "%";
        }
        
        addingAssetsQueue[0].assetImageEl.textContent = str;
    });
}

function hasDownloaded(assetData, version)
{
    var id = assetData.catalogItemId;
    var keys;
    var i;
    
    if (assetsData[id]) {
        keys = Object.keys(assetsData[id]);
        for (i = keys.length - 1; i >= 0; --i) {
            if (assetsData[id][keys[i]].engineVersion === version && assetsData[id][keys[i]].downloaded) {
                return true;
            }
        }
    }
    return false;
}

function createAddProjectMenuItems(assetData, assetContainerEl, assetImageEl, isLocal)
{
    var items = [
        new ContextualItem({type: "custom", markup: "<strong>Add to Project</strong>"})
    ];
    
    projects.forEach(function (projectData)
    {
        items.push(new ContextualItem({
            label: projectData.name,
            onClick: function ()
            {
                addAssetToProject(assetData, projectData, assetContainerEl, assetImageEl);
            }
        }));
    });
    
    if (!isLocal) {
        items.push(new ContextualItem({type: "seperator"}));
        
        items.push(new ContextualItem({type: "custom", markup: "<strong>Download to Cache</strong>"}));
        
        configData.engines.forEach(function (engine)
        {
            items.push(new ContextualItem({
                /// Add a checkmark to versions that are already downloaded.
                label: engine.version + (hasDownloaded(assetData, engine.version) ? " \u2714" : ""),
                onClick: function ()
                {
                    addAssetToProject(assetData, {downloadOnly: true, version: engine.version}, assetContainerEl, assetImageEl);
                }
            }));
        });
        
        items.push(new ContextualItem({
            label: "Other",
            onClick: function ()
            {
                simpleAsyncPrompt("Enter Engine Version to Download", function (version)
                {
                    if (version) {
                        if (version[0] === ".") {
                            version = "4" + version;
                        } else if (version.substr(0, 2) !== "4.") {
                            version = "4." + version;
                        }
                        addAssetToProject(assetData, {downloadOnly: true, version: version}, assetContainerEl, assetImageEl);
                    }
                });
            }
        }));
    } else {
        ///TODO: Be able to delete/hide things from the vault.
        items.push(new ContextualItem({type: "seperator"}));
        items.push(new ContextualItem({
            /// Add a checkmark to versions that are already downloaded.
            label: "Delete",
            onClick: function ()
            {
                deleteLocalAsset(assetData);
            }
        }));
    }
    
    return items;
}

function updateVault(ignoreCache)
{
    events.emit("updatingVault");
    ipc.send("updateVault", ignoreCache ? "1" : "0");
}


function error(message, buttonText, options, cb)
{
    console.error(message);
    options = options || {};
    options.error = true;
    pb.alert(cb || function () {}, message, buttonText || "OK", options);
}

function alert(message, buttonText, options, cb)
{
    pb.alert(cb || function () {}, message, buttonText || "OK", options);
}

function createLocalAssetList()
{
    var containerEl = document.getElementById("localAssets");
    
    function listLocalAssets()
    {
        var localAssets = parseJson(ipc.sendSync("getLocalAssets"), []);
        
        containerEl.innerHTML = "";
        
        localAssets.forEach(function (item)
        {
            var container = document.createElement("div");
            var img = document.createElement("div");
            var title = document.createElement("div");
            
            container.className = "vault-item";
            img.className = "vault-item-image";
            if (item.thumbnail) {
                img.style.backgroundImage = "url(\"" + (item.thumbnail) + "\")";
            } else {
                img.style.backgroundImage = "url(\"imgs/unknown.png\")";
            }
            
            title.className = "vault-item-title";
            title.textContent = item.title;
            
            container.appendChild(img);
            container.appendChild(title);
            containerEl.appendChild(container);
            
            item.isLocal = true;
            
            function showAddToProjectMenu(e)
            {
                e.preventDefault();
                new Contextual({
                    isSticky: false,
                    width: '250px',
                    items: createAddProjectMenuItems(item, container, img, true),
                });
            };
            
            container.onclick = showAddToProjectMenu;
            container.oncontextmenu = showAddToProjectMenu;
        });
    }
    
    ipc.on("localAssetsModified", function (event, err)
    {
        if (err) {
           error(err);
        }
        
        createLocalAssetList();
    });
    
    listLocalAssets();
}

function createVaultList()
{
    function createVaultEls()
    {
        var vaultEl = document.getElementById("vault");
        
        vaultEl.innerHTML = "";
        
        vaultData.forEach(function (item)
        {
            var container = document.createElement("div");
            var img = document.createElement("div");
            var title = document.createElement("div");
            
            container.className = "vault-item";
            img.className = "vault-item-image";
            img.style.backgroundImage = "url(\"" + (item.thumbnail) + "\")"; ///TODO: Storage image cache
            
            title.className = "vault-item-title";
            title.textContent = item.title;
            
            container.appendChild(img);
            container.appendChild(title);
            vaultEl.appendChild(container);
            
            function showAddToProjectMenu(e)
            {
                ///TODO: Don't show if already downloading.
                e.preventDefault();
                new Contextual({
                    isSticky: false,
                    width: '250px',
                    items: createAddProjectMenuItems(item, container, img),
                });
            };
            
            container.onclick = showAddToProjectMenu;
            container.oncontextmenu = showAddToProjectMenu;
        });
    }
    
    ipc.on("updateVault", function (event, data)
    {
        events.emit("doneUpdatingVault");
        if (data) {
            console.log("Updating vault data.");
            vaultData = JSON.parse(data);
            createVaultEls();
        }
    });
    
    vaultData = parseJson(ipc.sendSync("getVault"), []);
    
    createVaultEls();
    
    updateVault();
}

function simpleAsyncPrompt(message, cb)
{
    pb.prompt(
        cb,
        message,
        "input", /// Can also use "textarea"
        "", /// Default
        "Submit", /// Submit text
        "Cancel", /// Cancel text
        {} /// Additional options
    );
}

function manualEngineInstallPrompt()
{
    simpleAsyncPrompt("Enter Unreal Engine directory path:", function (path)
    {
        var err;
        if (path) {
            ///TODO: Make this async.
            err = ipc.sendSync("addEngine", path);
            console.log(err)
            if (err) {
                error(err);
            } else {
                loadConfig();
                createEngineList();
                createProjectList();
            }
        }
    });
}

function installNew()
{
    ///TODO
}

function implementAddEngineButton()
{
    var addEngineEl = document.getElementById("addEngine");
    
    function installMenu(e)
    {
        e.preventDefault();
        new Contextual({
            isSticky: true,
            width: '250px',
            items: [
                new ContextualItem({
                    label: "Install New Engine",
                    onClick: installNew,
                }),
                new ContextualItem({
                    label: "Add Manually Installed",
                    onClick: manualEngineInstallPrompt,
                })
            ]
        });
    };
    
    ///TODO: Be able to download and install an engine automatically.
    ///addEngineEl.onclick = installMenu;
    addEngineEl.onclick = manualEngineInstallPrompt;
}


function deleteLocalAsset(assetData)
{
    pb.confirm(function (confirmed)
    {
        if (confirmed) {
            ipc.send("delLocalAsset", assetData.path);
        }
    }, "Are you sure you want to delete \u201c" + assetData.title + "\u201d?");
}

function implementAddLocalAssetButton()
{
    document.getElementById("addAsset").onclick = function ()
    {
        simpleAsyncPrompt("Enter asset path:", function (path)
        {
            if (path) {
                ipc.send("addLocalAsset", path);
                ///TODO: Make the local assets listen for updates
                /*
                loadConfig();
                createLocalAssetList();
                */
            }
        });
    };
}

function implementConfigProjectsButton()
{
    var configButton = document.getElementById("configProjects");
    
    configProjects.onclick = function ()
    {
        var currentDirs = configData.projectDirPaths.join("\n");
        
        pb.prompt(
            function onUpdate(paths)
            {
                if (paths && paths !== currentDirs) {
                    ipc.sendSync("updateProjectDirs", paths);
                    loadConfig();
                    createProjectList();
                }
            },
            "Enter project directory paths (one per line):",
            "textarea", /// Can also use "textarea"
            currentDirs, /// Default
            "Submit", /// Submit text
            "Cancel", /// Cancel text
            {} /// Additional options
        );
    }
}


function implementRefreshVaultButton()
{
    var refreshButton = document.getElementById("vaultRefresh");
    
    refreshButton.onclick = function ()
    {
        updateVault(true);
    }
    
    events.on("updatingVault", function ()
    {
        refreshButton.classList.add("spin");
    });
    
    events.on("doneUpdatingVault", function ()
    {
        refreshButton.classList.remove("spin");
    });
}

function createEngineList()
{
    var containerEl;
    
    if (configData && configData.engines) {
        containerEl = document.getElementById("engines");
        
        containerEl.innerHTML = "";
        configData.engines.forEach(function createEngineEl(engineData)
        {
            var engineEl = document.createElement("div");
            var versionEl = document.createElement("span");
            var launchEl = document.createElement("a");
            
            engineEl.className = "ue4-engine";
            versionEl.className = "engine-version";
            versionEl.textContent = engineData.version;
            launchEl.className = "engine-launch";
            launchEl.textContent = "Launch";
            launchEl.onclick = function launch()
            {
                launchEngine(engineData);
            };
            
            engineEl.appendChild(versionEl);
            engineEl.appendChild(launchEl);
            containerEl.appendChild(engineEl);
        });
    }
}

function loadConfig()
{
    configData = parseJson(ipc.sendSync("getConfig"));
}

function loadAssetsData()
{
    assetsData = parseJson(ipc.sendSync("getAssetsData"));
}

function registerShortcuts()
{
    window.addEventListener("keyup", function (e)
    {
        if (e.key === "F5") {
            location.reload();
        } else if (e.key === "f" && e.ctrlKey) {
            findInPage.openFindWindow();
            /// Try to make sure that the input is in focus.
            findInPage.inputFocus();
            setTimeout(function focusInput()
            {
                findInPage.inputFocus();
            }, 50);
        }
    }, true);
}

implementRefreshVaultButton();

implementConfigProjectsButton();

loadConfig();

loadAssetsData();

createEngineList();

createProjectList();

createVaultList();

createLocalAssetList();

implementAddEngineButton();

prepareForAddingAssets();

registerShortcuts();

implementAddLocalAssetButton();
