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
    } catch (e) {console.error(e)}
    
    return "";
}

function getProjects(engines)
{
    var baseDir = p.join(os.homedir(), "Documents", "Unreal Projects");
    var projectDirs = fs.readdirSync(baseDir);
    var projects = [];
    
    projectDirs.forEach(function (dir)
    {
        var path = p.join(baseDir, dir);
        var thumb = p.join(path, "Saved", "AutoScreenshot.png");
        var projectPath = p.join(path, dir + ".uproject");
        var proj = {
            name: dir,
            dir: path,
            projectPath: projectPath,
            thumb: fs.existsSync(thumb) ? thumb : null,
            version: getProjectVersionFromEnginePath(dir, path, engines),
        };
        projects.push(proj);
    });
    
    return projects;
}

module.exports = {
    getProjects: getProjects
};
