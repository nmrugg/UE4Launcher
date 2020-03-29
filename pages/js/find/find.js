const EventEmitter = require('events')
const { print } = require('./utils.js')

const stopActions = ['clearSelection', 'keepSelection', 'activateSelection']
const wcs = 'webContents'
const opts = 'options'
const requestId = 'requestId'
const activeMatch = 'activeMatch'
const matches = 'matches'
const initd = 'initd'
const preText = 'preText'

class Find extends EventEmitter {
  constructor (webContents, options = {}) {
    super()
    this[wcs] = webContents
    this[opts] = options
    this[requestId] = null
    this[activeMatch] = 0
    this[matches] = 0
    this[initd] = false
    this[preText] = ''
  }
  initFind () {
    if (this[initd]) return false
    if (isWebContents.call(this)) {
      bindFound.call(this)
      return this[initd] = true
    } else {
      throw new Error('[Find] In need of a valid webContents !')
    }
  }
  destroyFind () {
    this[wcs] = null
    this[opts]  = null
    this[requestId] = null
    this[activeMatch] = 0
    this[matches] = 0
    this[initd] = false
    this[preText] = ''
  }
  isFinding () {
    return !!this[requestId]
  }
  startFind (text = '', forward = true, matchCase = false) {
    if (!text) return
    this[activeMatch] = 0
    this[matches] = 0
    this[preText] = text
    this[requestId] = this[wcs].findInPage(this[preText], {
      forward,
      matchCase 
    })
    print(`[Find] startFind text=${text} forward=${forward} matchCase=${matchCase}`)
  }
  findNext (forward, matchCase = false) {
    if (!this.isFinding()) throw new Error('Finding did not start yet !')
    this[requestId] = this[wcs].findInPage(this[preText], {
      forward,
      matchCase,
      findNext: true
    })
    print(`[Find] findNext text=${this[preText]} forward=${forward} matchCase=${matchCase}`)
  }
  stopFind (action) {
    stopActions.includes(action) ? '' : action = 'clearSelection'
    this[wcs].stopFindInPage(action)
    print(`[Find] stopFind action=${action}`)
  }
}
function isWebContents () {
  return (this[wcs] && 
    typeof this[wcs].findInPage === 'function' &&
    typeof this[wcs].stopFindInPage === 'function')
}
function bindFound () {
  this[wcs].on('found-in-page', (e, r) => {
    onFoundInPage.call(this, r)
  })
}
function onFoundInPage (result) {
  print('[Find] onFoundInPage, ', result)
  if (this[requestId] !== result.requestId) return
  typeof result.activeMatchOrdinal === 'number' ? this[activeMatch] = result.activeMatchOrdinal : ''
  typeof result.matches === 'number' ? this[matches] = result.matches : ''
  result.finalUpdate ? reportResult.call(this) : ''
}
function reportResult () {
  this.emit('result', this[activeMatch], this[matches])
  typeof this[opts].onResult === 'function' ? this[opts].onResult(this[activeMatch], this[matches]) : ''
}

module.exports = Find
