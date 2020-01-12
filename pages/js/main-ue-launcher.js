"use strict";

var fs = require("fs");
var os = require("os");
var p = require("path");
var spawn = require("child_process").spawn;
var SHARED = require(p.join(__dirname, "..", "shared", "functions"));
var electron = require("electron");
var ipc = electron.ipcRenderer;
var getProjects = SHARED.getProjects;

var unrealEnginePath = "/storage/UnrealEngine/Engine/Binaries/Linux/UE4Editor"; ///TODO: Get real path.
var lastEngineLaunched;
var lastProjectLaunched;
var lastProjectLaunchedTime;

var projects;
var vaultData;
var configData;

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
    
    projects = getProjects(configData.engines);
    
    projectsAreaEl.innerHTML = "";
    
    projects.forEach(function (project)
    {
        var container = document.createElement("div");
        var img = document.createElement("div");
        var version = document.createElement("span");
        var name = document.createElement("div");
        
        function launch()
        {
            launchEngine(undefined, project.projectPath);
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

function launchEngine(enginePath, project)
{
    var args;
    var curTime = Date.now();
    var child;
    
    //engine = engine || unrealEnginePath
    if (!enginePath) {
        if (lastEngineLaunched) {
            enginePath = lastEngineLaunched;
        } else if (configData && configData.engines && configData.engines[0]) {
            ///HACK to just use the first engine installed.
            enginePath = configData.engines[0].execPath;
        } else {
            console.error("No engine installed");
        }
    }
    
    if (!lastProjectLaunchedTime || curTime - lastProjectLaunchedTime > 5000 || lastProjectLaunched !== project || lastEngineLaunched !== engine) {
        lastProjectLaunched = project;
        lastProjectLaunchedTime = curTime;
        lastEngineLaunched = enginePath;
    
        if (project) {
            args = [project];
        }
        
        console.log("Launching " + enginePath + (args ? " " + args.join(" ") : ""));
        child = spawn(enginePath, args, {detached: true, encoding: "utf8"});
        
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
        console.error("Asset installation falied");
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

function createAddProjectMenuItems(assetData, assetContainerEl, assetImageEl)
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
    
    items.push(new ContextualItem({type: "seperator"}));
    
    /*
    items.push(new ContextualItem({
        label: "Download to Cache",
        onClick: function ()
        {
            addAssetToProject(assetData, {downloadOnly: true}, assetContainerEl, assetImageEl);
        }
    }));
    */
    items.push(new ContextualItem({type: "custom", markup: "<strong>Download to Cache</strong>"}));
    
    configData.engines.forEach(function (engine)
    {
        items.push(new ContextualItem({
            label: engine.version,
            onClick: function ()
            {
                addAssetToProject(assetData, {downloadOnly: true, version: engine.version}, assetContainerEl, assetImageEl);
            }
        }));
    });
    
    return items;
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
        if (data) {
            console.log("Updating vault data.");
            vaultData = JSON.parse(data);
            createVaultEls();
        }
    });
    
    vaultData = parseJson(ipc.sendSync("getVault"), []);
    
    createVaultEls();
    
    ipc.send("updateVault");
}

function asyncPrompt(message, cb)
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

function implementAddEngineButton()
{
    var addEngineEl = document.getElementById("addEngine");
    
    addEngineEl.onclick = function ()
    {
        asyncPrompt("Enter Unreal Engine directory path:", function (path)
        {
            if (path) {
                ipc.sendSync("addEngine", path);
                loadConfig();
                createEngineList();
                createProjectList();
            }
        });
    };
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
                launchEngine(engineData.execPath);
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

function registerShortcuts()
{
    window.addEventListener("keyup", function (e)
    {
        if (e.key === "F5") {
            location.reload();
        }
    }, true);
}

loadConfig();

createEngineList();

createProjectList();

createVaultList();

implementAddEngineButton();

prepareForAddingAssets();

registerShortcuts();
