const debug = false
const print = debug ? console.log.bind(console) : () => {}

const on = (() => {
  if (document && document.addEventListener) {
    return (element, event, handler) => {
      if (element && event && handler) {
        element.addEventListener(event, handler, false)
      }
    }
  } else if (document && document.attachEvent) {
    return (element, event, handler) => {
      if (element && event && handler) {
        element.attachEvent(`on${event}`, handler)
      }
    }
  } else {
    return () => {}
  }
})()

const off = (() => {
  if (document && document.removeEventListener) {
    return (element, event, handler) => {
      if (element && event && handler) {
        element.removeEventListener(event, handler, false)
      }
    }
  } else if (document && document.detachEvent) {
    return (element, event, handler) => {
      if (element && event && handler) {
        element.detachEvent(`on${event}`, handler)
      }
    }
  } else {
    return () => {}
  }
})()

const once = (element, event, fn) => {
  let listener = function () {
    if (typeof fn === 'function') {
      fn.apply(this, arguments)
    }
    off(element, event, listener)
  }
  on(element, event, listener)
}

window.requestAnimationFrame = window.requestAnimationFrame ||
                              window.webkitRequestAnimationFrame ||
                              window.mozRequestAnimationFrame ||
                              window.msRequestAnimationFrame ||
                              window.oRequestAnimationFrame ||
                              function (callback) {
                                return window.setTimeout(callback, 1000 / 60)
                              }

window.cancelAnimationFrame = window.cancelAnimationFrame ||
                              window.webkitCancelAnimationFrame ||
                              window.mozCancelAnimationFrame ||
                              window.msCancelAnimationFrame ||
                              window.oCancelAnimationFrame ||
                              function (id) {
                                window.clearTimeout(id)
                              }

const move = (element, end, duration = 300) => {
  return new Promise((resolve, reject) => {
    try {
      let winFrameId = null
      let stepTime = duration / (1000 / 60)
      let curr = parseInt(element.style.top)
      let stepDist = (end - curr) / stepTime
      let stepCnt = 0

      const step = function () {
        curr += stepDist
        stepCnt++
        if (stepCnt >= stepTime || (Math.abs(end - curr) <= (stepDist + 1))) {
          element.style.top = `${end}px`
          if (winFrameId) {
            window.cancelAnimationFrame(winFrameId)
            winFrameId = null
          }
          resolve()
        } else {
          element.style.top = `${curr}px`
          winFrameId = window.requestAnimationFrame(step)
        }
      }
      step()
    } catch (error) {
      reject(error)
    }
  })

  
}

module.exports = {
  print,
  on,
  off,
  once,
  move
}