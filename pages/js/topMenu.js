"use strict";

var main = document.getElementById("main");

var learnTab = document.getElementById("learnTab");
var libraryTab = document.getElementById("libraryTab");

var libraryPane = document.getElementById("libraryPane");
var urlPane = document.getElementById("urlPane");

var iframe;

function watchIframeSize(e)
{
    if (iframe) {
        console.log(window.innerHeight, iframe.offsetTop, window.innerHeight - iframe.offsetTop)
        iframe.style.height = (window.innerHeight - iframe.offsetTop) + "px";
        iframe.style.width = (window.innerWidth - iframe.offsetLeft) + "px";
    }
}

function addIframe()
{
    main.classList.add("noScroll");
    iframe = document.createElement("iframe");
    iframe.src = "https://launcher-website-prod07.ol.epicgames.com/ue/learn/";
    window.addEventListener("resize", watchIframeSize);
    urlPane.appendChild(iframe);
    watchIframeSize();
}

function clearURLPane()
{
    main.classList.remove("noScroll");
    if (iframe) {
        try {
            iframe.parentNode.removeChild(iframe);
        } catch (e) {}
        iframe = undefined;
    }
    urlPane.innerHTML = "";
    window.removeEventListener("resize", watchIframeSize);
}

function implementLibraryTab()
{
    libraryTab.onclick = function click()
    {
        libraryTab.classList.add("selected");
        learnTab.classList.remove("selected");
        urlPane.classList.add("hiddenPane");
        libraryPane.classList.remove("hiddenPane");
        clearURLPane();
    };
}


function implementLearnTab()
{
    learnTab.onclick = function click()
    {
        learnTab.classList.add("selected");
        libraryTab.classList.remove("selected");
        libraryPane.classList.add("hiddenPane");
        urlPane.classList.remove("hiddenPane");
        addIframe();
    };
}


implementLibraryTab();

implementLearnTab();

