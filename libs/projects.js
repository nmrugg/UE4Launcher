"use strict";

var fs = require("fs");
var p = require("path");

function getProjectVersionFromEnginePath(name, projectPath, engines)
{
    var fileData;
    var i;
    var len;
    var searchPrefix;
    
    try {
        if (engines && engines.length) {
            if (fs.existsSync(p.join(projectPath, name + ".workspace"))) {
                fileData = fs.readFileSync(p.join(projectPath, name + ".workspace"), "utf8");
                searchPrefix = "<Include Path=\"";
            } else {
                ///TODO: Support other platforms
                fileData = fs.readFileSync(p.join(projectPath, "Saved", "Config", "Linux", "EditorPerProjectUserSettings.ini"), "utf8");
                searchPrefix = "Project=";
            }
            len = engines.length;
            for (i = 0; i < len; ++i) {
                if (fileData.indexOf(searchPrefix + engines[i].baseDir) > -1) {
                    return engines[i].version;
                }
            }
        }
    } catch (e) {console.error(e);}
    
    return "";
}

function findProjectFile(dir)
{
    var projectPath = p.join(dir, p.basename(dir) + ".uproject");
    
    if (!fs.existsSync(projectPath)) {
        fs.readdirSync(dir).some(function (file)
        {
            var ext = p.extname(file).toLowerCase();
            if (ext === ".uproject") {
                projectPath = projectPath = p.join(dir, file);
                return true;
            }
        });
    }
    
    return projectPath;
}

function getProjects(projectDirPaths, engines)
{
    var projectDirs;
    var projects = [];
    
    projectDirPaths.forEach(function (baseDir)
    {
        try {
            projectDirs = fs.readdirSync(baseDir);
        } catch (e) {
            projectDirs = [];
        }
        
        projectDirs.forEach(function (dir)
        {
            var path = p.join(baseDir, dir);
            var thumb;
            var proj;
            
            if (fs.statSync(path).isDirectory()) {
                thumb = p.join(path, "Saved", "AutoScreenshot.png");
                proj = {
                    name: dir,
                    dir: path,
                    projectPath: findProjectFile(path),
                    thumb: fs.existsSync(thumb) ? thumb : null,
                    version: getProjectVersionFromEnginePath(dir, path, engines),
                };
                projects.push(proj);
            }
        });
    });
    
    return projects;
}

function sortProjects(projects, type, desc)
{
    if (projects && Array.isArray(projects)) {
        if (!type || type === "caseInsensitive") {
            projects.sort(function (a, b)
            {
                return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            });
        } else if (type === "caseSensitive") {
            projects.sort(function (a, b)
            {
                return a.name.localeCompare(b.name);
            });
        }
        
        if (desc) {
            projects.reverse();
        }
    }
    
    return projects;
}

module.exports = {
    getProjects: getProjects,
    sortProjects: sortProjects,
};
