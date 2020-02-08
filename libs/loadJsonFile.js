var fs = require("fs");

function loadJsonFile(path, defaultVal, cb)
{
    fs.readFile(path, "utf8", function onread(err, data)
    {
        var json;
        
        try {
            json = JSON.parse(data);
        } catch (e) {}
        
        if (typeof json === "undefined") {
            json = defaultVal;
        }
        
        cb(json);
    });
}

function loadJsonFileSync(path, defaultVal)
{
    var json;
    
    try {
        json = JSON.parse(fs.readFileSync(path, "utf8"));
    } catch (e) {
        json = defaultVal;
    }
    
    return json;
}

loadJsonFile.sync = loadJsonFileSync;

module.exports = loadJsonFile;
