"use strict";

var fs = require("fs");
var os = require("os");
var p = require("path");

function getProjects()
{
    var baseDir = p.join(os.homedir(), "Documents", "Unreal Projects");
    var projectDirs = fs.readdirSync(baseDir);
    var projects = [];
    
    projectDirs.forEach(function (dir)
    {
        var path = p.join(baseDir, dir);
        var thumb = p.join(path, "Saved", "AutoScreenshot.png");
        var proj = {
            name: dir,
            path: path,
            thumb: fs.existsSync(thumb) ? thumb : null,
        };
        projects.push(proj);
    });
    
    return projects;
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
        
        container.className = "project-container";
        //img.src = project.thumb || defaultThumb;
        img.style.backgroundImage = "url(\"" + (project.thumb || defaultThumb) + "\")";
        img.className = "project-img-box";
        console.log("url(" + (project.thumb || defaultThumb) + ")")
        console.log(version.style.backgroundImage)
        version.textContent = "4.23"; ///TODO: Get actual verion number!
        version.className = "project-version";
        name.textContent = project.name;
        name.className = "project-name";
        
        //container.appendChild(img);
        img.appendChild(version);
        container.appendChild(img);
        container.appendChild(name);
        
        projectsAreaEl.appendChild(container);
    });
}
//console.log(getProjects());

createProjectList();
