"use strict";

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
            dir: path,
            projectPath: p.join(path, dir + ".uproject"),
            thumb: fs.existsSync(thumb) ? thumb : null,
        };
        projects.push(proj);
    });
    
    return projects;
}

module.exports = {
    getProjects: getProjects
};
