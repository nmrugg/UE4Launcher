"use strict";

var events = {};

function add(name, func, once, addToFront)
{
    var obj;
    
    if (!events[name]) {
        events[name] = [];
    }
    
    obj = {
        f: func,
        once: Boolean(once),
    };
    
    if (addToFront) {
        events[name].unshift(obj);
    } else {
        events[name].push(obj);
    }
}

function on(name, func, addToFront)
{
    add(name, func, false, addToFront);
}

function once(name, func, addToFront)
{
    add(name, func, true, addToFront);
}

function off(name, func)
{
    var i;
    var arr = events[name];
    
    if (arr) {
        /// Remove the newest function first.
        for (i = arr.length - 1; i >= 0; --i) {
            if (arr[i] === func) {
                arr.splice(i, 1);
                return true;
            }
        }
    }
    
    return false;
}

function emit(name, e)
{
    var i;
    var len;
    var func;
    var stop;
    var event = events[name];
    
    if (event) {
        if (!e || typeof e !== "object") {
            e = {};
        }
        
        e.stopPropagation = function ()
        {
            stop = true;
        };
        
        len = event.length;
        
        /// Call the oldest functions first, and make it easier to remove functions.
        for (i = 0; i < len; ++i) {
            func = event[i].f;
            
            /// Remove one-time events.
            if (event[i].once) {
                event[i].splice(i, 1);
                /// Because we shrunk the array, we need to move the index back one.
                --i;
            }
            
            try {
                func(e);
            } catch (err) {
                console.error(err);
            }
            
            /// Was e.stopPropagation() called?
            if (stop) {
                break;
            }
        }
    }
}

module.exports = {
    on: on,
    once: once,
    off: off,
    emit: emit,
};
