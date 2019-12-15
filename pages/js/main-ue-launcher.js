"use strict";

var fs = require("fs");
var os = require("os");
var p = require("path");
var spawn = require("child_process").spawn;
var SHARED = require(p.join(__dirname, "..", "shared", "functions"));
var ipc = require("electron").ipcRenderer;
var getProjects = SHARED.getProjects;

var unrealEnginePath = "/storage/UnrealEngine/Engine/Binaries/Linux/UE4Editor"; ///TODO: Get real path.
var lastEngineLaunched;
var lastProjectLaunched;
var lastProjectLaunchedTime;

var vaultData;
var configData;

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
    var projects = getProjects();
    var defaultThumb = "imgs/default_game_thumbnail.png";
    
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
        version.textContent = "4.23"; ///TODO: Get actual verion number!
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
        
        spawn(enginePath, args);
    }
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
            img.style.backgroundImage = "url(\"" + (item.thumbnail) + "\")";
            
            title.className = "vault-item-title";
            title.textContent = item.title;
            
            container.appendChild(img);
            container.appendChild(title);
            vaultEl.appendChild(container);
        });
    }
    
    ipc.on("updateVault", function (event, data)
    {
        console.log(data)
        if (data) {
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
            }
        });
    };
}

function createEngineList()
{
    var containerEl;
    
    if (configData && configData.engines) {
        containerEl = document.getElementById("engines");
        
        containerEl.innerHtml = "";
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

loadConfig();

createEngineList();

createProjectList();

createVaultList();

implementAddEngineButton();

/*
///TEMP: Launch button
document.getElementById("temp423Launch").onclick = function ()
{
    launchEngine();
};
*/
