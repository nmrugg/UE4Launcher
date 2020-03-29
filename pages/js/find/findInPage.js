const Find = require('./find.js')
const { print, on, off, move } = require('./utils.js')

const INPUT_INTERVAL_THRESHOLD = 360

const findBox = 'findBox'
const findInput = 'findInput'
const findMatches = 'findMatches'
const findCase = 'findCase'
const findBack = 'findBack'
const findForward = 'findForward'
const findClose = 'findClose'
const hasOpened = 'hasOpened'
const matchCase = 'matchCase'

const documentKeydown = 'documentKeydown'
const inputFocus = 'inputFocus'
const inputBlur = 'inputBlur'
const inputEvent = 'inputEvent'
const compositionstart = 'compositionstart'
const compositionend = 'compositionend'
const caseMouseenter = 'caseMouseenter'
const caseMouseleave = 'caseMouseleave'
const caseClick = 'caseClick'
const backMouseenter = 'backMouseenter'
const backMouseleave = 'backMouseleave'
const backClick = 'backClick'
const forwardMouseenter = 'forwardMouseenter'
const forwardMouseleave = 'forwardMouseleave'
const forwardClick = 'forwardClick'
const closeMouseenter = 'closeMouseenter'
const closeMouseleave = 'closeMouseleave'
const closeClick = 'closeClick'
const events = 'events'

const inComposition = 'inComposition'
const action = 'action'
const lastText = 'lastText'
const inputCnt = 'inputCnt'
const initialized = 'initialized'
const config = 'config'

class FindInPage extends Find{
  constructor (webContents, options = {}) {
    super(webContents)
    this[findBox] = null
    this[findInput] = null
    this[findMatches] = null
    this[findCase] = null
    this[findBack] = null
    this[findForward] = null
    this[findClose] = null
    this[hasOpened] = false
    this[matchCase] = false
    this[inComposition] = false
    this[action] = ''
    this[lastText] = ''
    this[inputCnt] = 0
    this[initialized] = false
    this[config] = {}
    this[events] = []
    this.parentElement = options.parentElement ? options.parentElement : document.body
    this.duration = (typeof options.duration === 'number' && options.duration > 0) ? options.duration : 300
    this.options = options
    this.options.preload ? this.initialize() : ''
  }
  initialize () {
    if (this[initialized]) {
      print('[FindInPage] Has initialize.')
      return true
    }
    if (!this.initFind()) {
      print('[FindInPage] Failed to initialize.')
      return false
    }
    this[findBox] = creatElement('find-box')
    this[findInput] = creatElement('find-input', 'input')
    this[findMatches] = creatElement('find-matches')
    this[findCase] = creatElement('find-case')
    this[findBack] = creatElement('find-back')
    this[findForward] = creatElement('find-forward')
    this[findClose] = creatElement('find-close')
    getUserConfig.call(this, this.options)
    setBoxStyle.call(this)
    setInputStyle.call(this)
    setMatchesStyle.call(this)
    setCaseStyle.call(this)
    setBackStyle.call(this)
    setForwardStyle.call(this)
    setCloseStyle.call(this)
    lockNext.call(this)
    creatEventHandler.call(this)
    bindEvents.call(this)
    appendElement.call(this)
    onResult.call(this)
    move(this[findBox], (0 - this[findBox].offsetHeight - 10), this.duration)
    return this[initialized] = true
  }
  openFindWindow () {
    if (this[hasOpened]) {
      focusInput.call(this)
      return false
    }
    if (!this.initialize()) return false
    setTimeout(() => {  
      this[findBox].style['visibility'] = 'visible'
      lockNext.call(this)
      focusInput.call(this)
    }, 10)
    move(this[findBox], parseInt(this[config].offsetTop), this.duration)
      .then(() => {})
      .catch(err => { throw err })
    return this[hasOpened] = true
  }
  closeFindWindow () {
    if (!this[hasOpened]) return false
    this[findInput].value = ''
    this[action] = ''
    this[lastText] = ''
    this[findMatches].innerText = '0/0'
    this[hasOpened] = false
    lockNext.call(this)
    move(this[findBox], (0 - this[findBox].offsetHeight - 10), this.duration)
      .then(() => { this[findBox].style['visibility'] = 'hidden' })
      .catch(err => { throw err })
    return true
  }
  destroy () {
    this.destroyFind()
    unbindEvents.call(this)
    this.closeFindWindow()
    removeElement.call(this)
  }
}

function creatElement (className = '', tag = 'div') {
  const ele = document.createElement(tag)
  ele.classList.add(className)
  return ele
}
function getUserConfig (options) {
  this[config].offsetTop = typeof options.offsetTop === 'number' ? `${options.offsetTop}px` : '5px'
  this[config].offsetRight = typeof options.offsetRight === 'number' ? `${options.offsetRight}px` : '5px'
  this[config].boxBgColor = typeof options.boxBgColor === 'string' ? options.boxBgColor : '#fff'
  this[config].boxShadowColor = typeof options.boxShadowColor === 'string' ? options.boxShadowColor : '#909399'
  this[config].inputColor = typeof options.inputColor === 'string' ? options.inputColor : '#606266'
  this[config].inputBgColor = typeof options.inputBgColor === 'string' ? options.inputBgColor : '#f0f0f0'
  this[config].inputFocusColor = typeof options.inputFocusColor === 'string' ? options.inputFocusColor : '#c5ade0'
  this[config].textColor = typeof options.textColor === 'string' ? options.textColor : '#606266'
  this[config].textHoverBgColor = typeof options.textHoverBgColor === 'string' ? options.textHoverBgColor : '#eaeaea'
  this[config].caseSelectedColor = typeof options.caseSelectedColor === 'string' ? options.caseSelectedColor : '#c5ade0'
}
function setBoxStyle () {
  this[findBox].style.cssText = `position:fixed; top:-110%; z-index: 3001; max-height:48px; min-height:30px; 
    right:${this[config].offsetRight}; display:flex; align-items:center; box-sizing:border-box !important;
    padding:6px; visibility: hidden; background:${this[config].boxBgColor}; 
    box-shadow: 1px 1px 2px 0.5px ${this[config].boxShadowColor};`
}
function setInputStyle () {
  this[findInput].style.cssText = `width:168px; outline:0; border:1px solid ${this[config].inputBgColor}; 
    background:${this[config].inputBgColor}; margin-right:6px; border-radius:2px; color:${this[config].inputColor}`
}
function setMatchesStyle () {
  this[findMatches].innerText = '0/0'
  this[findMatches].style.cssText = `color:${this[config].textColor}; font-size:14px; display:flex; align-items:center; 
    justify-content:center; min-width:40px; max-width:64px; overflow:hidden; margin-right:4px;`
}
function setCaseStyle () {
  this[findCase].innerText = 'Aa'
  this[findCase].style.cssText = `font-size:14px; font-weight:700; cursor:pointer; -webkit-user-select:none; color:${this[config].textColor}; 
    padding:0px 2px; border-radius:2px; border:1px solid transparent; margin-right:4px; display:flex; align-items:center;`
}
function setBackStyle () {
  this[findBack].style.cssText = `cursor:pointer; -webkit-user-select:none; position: relative; height: 20px; width: 20px; border-radius:2px;
    overflow: hidden; display: inline-block; background:${this[config].boxBgColor}; border:0px solid ${this[config].boxBgColor};`

  let backLine = creatElement('find-back-line')
  backLine.style.cssText = `width:0; height:0; border:7px solid transparent; border-right-color:${this[config].textColor};
    position: absolute; top:3px; left:-1px;`
  this[findBack].appendChild(backLine)

  let backCover = creatElement('find-back-cover')
  backCover.style.cssText = `width:0; height:0; border:7px solid transparent; border-right-color:inherit;
    position: absolute; top:3px; left:2px; z-index:1001;`
  this[findBack].appendChild(backCover)
}
function setForwardStyle () {
  this[findForward].style.cssText = `cursor:pointer; -webkit-user-select:none; position: relative; height: 20px; width: 20px; border-radius:2px;
    overflow: hidden; display: inline-block; background:${this[config].boxBgColor}; border:0px solid ${this[config].boxBgColor};`

  let forwardLine = creatElement('find-forward-line')
  forwardLine.style.cssText = `width:0; height:0; border:7px solid transparent; border-left-color:${this[config].textColor};
    position: absolute; top:3px; left:6px;`
  this[findForward].appendChild(forwardLine)

  let forwardCover = creatElement('find-forward-cover')
  forwardCover.style.cssText = `width:0; height:0; border:7px solid transparent; border-left-color:inherit;
    position: absolute; top:3px; left:3px; z-index:1001;`
  this[findForward].appendChild(forwardCover)
}
function setCloseStyle () {
  this[findClose].style.cssText = `cursor:pointer; -webkit-user-select:none; position: relative; height: 20px; width: 20px;
    overflow: hidden; display: inline-block; background:${this[config].boxBgColor}; border-radius:2px;`

  let closeInner1 = creatElement('find-close-inner1')
  closeInner1.style.cssText = `width:14px; height:2px; background:${this[config].textColor}; transform:rotate(45deg);
    position: absolute; top:9px; left:3px;`
  this[findClose].appendChild(closeInner1)

  let closeInner2 = creatElement('find-close-inner2')
  closeInner2.style.cssText = `width:14px; height:2px; background:${this[config].textColor}; transform:rotate(-45deg);
  position: absolute; top:9px; left:3px;`
  this[findClose].appendChild(closeInner2)
}
function appendElement () {
  [this[findInput], this[findMatches], this[findCase], this[findBack], this[findForward], this[findClose]].forEach((item) => { 
    this[findBox].appendChild(item) 
  })
  this.parentElement.appendChild(this[findBox])
}
function removeElement () {
  this.parentElement.removeChild(this[findBox])
}
function creatEventHandler () {
  this[documentKeydown] = (function (e) {
    if (!this[hasOpened]) return
    onKeydown.call(this, e)
  }).bind(this)
  this[events].push({ ele: document, name: 'keydown', fn: this[documentKeydown] })

  this[inputFocus] = (function () {
    this[findInput].style.border = `1px solid ${this[config].inputFocusColor}`
  }).bind(this)
  this[events].push({ ele: this[findInput], name: 'focus', fn: this[inputFocus] })

  this[inputBlur] = (function () {
    this[findInput].style.border = `1px solid ${this[config].inputBgColor}`
  }).bind(this)
  this[events].push({ ele: this[findInput], name: 'blur', fn: this[inputBlur] })

  this[inputEvent] = (function () {
    updateCnt.call(this)
    isInputing.call(this)
      .then(res => {
        res ? '' : onInput.call(this)
      })
  }).bind(this)
  this[events].push({ ele: this[findInput], name: 'input', fn: this[inputEvent] })

  this[compositionstart] = (function () {
    print('compositionstart')
    this[inComposition] = true
  }).bind(this)
  this[events].push({ ele: this[findInput], name: 'compositionstart', fn: this[compositionstart] })

  this[compositionend] = (function () {
    print('compositionend')
    this[inComposition] = false
  }).bind(this)
  this[events].push({ ele: this[findInput], name: 'compositionend', fn: this[compositionend] })

  this[caseMouseenter] = (function () {
    this[findCase].style['background'] = this[config].textHoverBgColor
  }).bind(this)
  this[events].push({ ele: this[findCase], name: 'mouseenter', fn: this[caseMouseenter] })

  this[caseMouseleave] = (function () {
    this[findCase].style['background'] = this[config].boxBgColor
  }).bind(this)
  this[events].push({ ele: this[findCase], name: 'mouseleave', fn: this[caseMouseleave] })

  this[caseClick] = (function () {
    onCaseClick.call(this)
  }).bind(this)
  this[events].push({ ele: this[findCase], name: 'click', fn: this[caseClick] })

  this[backMouseenter] = (function () {
    this[findBack].style['background'] = this[config].textHoverBgColor
    this[findBack].style['border'] = `0px solid ${this[config].textHoverBgColor}`
  }).bind(this)
  this[events].push({ ele: this[findBack], name: 'mouseenter', fn: this[backMouseenter] })

  this[backMouseleave] = (function () {
    this[findBack].style['background'] = this[config].boxBgColor
    this[findBack].style['border'] = `0px solid ${this[config].boxBgColor}`
  }).bind(this)
  this[events].push({ ele: this[findBack], name: 'mouseleave', fn: this[backMouseleave] })

  this[backClick] = (function () {
    onBackClick.call(this)
  }).bind(this)
  this[events].push({ ele: this[findBack], name: 'click', fn: this[backClick] })

  this[forwardMouseenter] = (function () {
    this[findForward].style['background'] = this[config].textHoverBgColor
    this[findForward].style['border'] = `0px solid ${this[config].textHoverBgColor}`
  }).bind(this)
  this[events].push({ ele: this[findForward], name: 'mouseenter', fn: this[forwardMouseenter] })

  this[forwardMouseleave] = (function () {
    this[findForward].style['background'] = this[config].boxBgColor
    this[findForward].style['border'] = `0px solid ${this[config].boxBgColor}`
  }).bind(this)
  this[events].push({ ele: this[findForward], name: 'mouseleave', fn: this[forwardMouseleave] })

  this[forwardClick] = (function () {
    onForwardClick.call(this)
  }).bind(this)
  this[events].push({ ele: this[findForward], name: 'click', fn: this[forwardClick] })

  this[closeMouseenter] = (function () {
    this[findClose].style['background'] = this[config].textHoverBgColor
  }).bind(this)
  this[events].push({ ele: this[findClose], name: 'mouseenter', fn: this[closeMouseenter] })

  this[closeMouseleave] = (function () {
    this[findClose].style['background'] = this[config].boxBgColor
  }).bind(this)
  this[events].push({ ele: this[findClose], name: 'mouseleave', fn: this[closeMouseleave] })

  this[closeClick] = (function () {
    onCloseClick.call(this)
  }).bind(this)
  this[events].push({ ele: this[findClose], name: 'click', fn: this[closeClick] })
}

function bindEvents () {
  this[events].forEach((item) => {
    on(item.ele, item.name, item.fn)
  })
}
function unbindEvents () {
  this[events].forEach((item) => {
    off(item.ele, item.name, item.fn)
  })
}

function updateCnt () {
  if (this[inputCnt] >= 0xFFFFFFFE) {
    this[inputCnt] = 0
  }
  this[inputCnt]++
}

function isInputing () {
  return new Promise((resolve, reject) => {
    let currCnt = this[inputCnt]
    setTimeout(() => {
      currCnt !== this[inputCnt] ? resolve(true) : resolve(false)
    }, INPUT_INTERVAL_THRESHOLD)
  })
}

function focusInput (doBlur = false) {

  setTimeout(() => { 
    doBlur ? this[findInput].blur() : ''
    this[findInput].focus() 
  }, 50)
}

function wrapInput (inputEle, caseEle, timeout = 50) {
  inputEle.type = 'password'
  caseEle.style['visibility'] = 'hidden'

  setTimeout(() => {
    if (inputEle.type !== 'text') {
      print('[FindInPage] wrapInput timeout..')
      unwrapInput(inputEle, caseEle)
    }
  }, timeout)
}
function unwrapInput (inputEle, caseEle) {
  inputEle.type = 'text'
  caseEle.style['visibility'] = 'visible'
}

function onInput () {
  setTimeout(() => {
    if (this[inComposition]) return
    this[action] = 'input'
    let text = this[findInput].value
    if (text && text !== this[lastText]) {
      this[lastText] = text
      wrapInput(this[findInput], this[findCase], 100)
      this.startFind(text, true, this[matchCase])
    } else if (this[lastText] && text === '') {
      this.stopFind()
      this[findMatches].innerText = '0/0'
      lockNext.call(this)
      focusInput.call(this, true)
    }
  }, 50)
}

function onKeydown (e) {
  if (this[inComposition] || !e) return
  switch (e.code) {
    case 'Enter':
    case 'NumpadEnter':
      let text = this[findInput].value
      if (!text) return
      e.shiftKey ? findKeep.call(this, false) : findKeep.call(this, true)
      break
    case 'Escape':
      onCloseClick.call(this)
      break
    default: 
      break
  }
}

function findKeep (forward) {
  if (!this.isFinding()) return
  forward ? onForwardClick.call(this) : onBackClick.call(this)
}

function onCaseClick () {
  if (!this[matchCase]) {
    this[matchCase] = true
    this[findCase].style['border-color'] = this[config].caseSelectedColor
    wrapInput(this[findInput], this[findCase], 100)
    this.startFind(this[findInput].value, true, this[matchCase])
  } else {
    this[matchCase] = false
    this[findCase].style['border-color'] = 'transparent'
    wrapInput(this[findInput], this[findCase], 100)
    this.startFind(this[findInput].value, true, this[matchCase])
  }
}

function onBackClick () {
  this[action] = 'back'
  wrapInput(this[findInput], this[findCase], 100)
  this.findNext(false, this[matchCase])
}

function onForwardClick () {
  this[action] = 'forward'
  wrapInput(this[findInput], this[findCase], 100)
  this.findNext(true, this[matchCase])
}

function onCloseClick () {
  this.closeFindWindow() ? this.stopFind() : ''
}

function onResult () {
  this.on('result', (activeMatch, matches) => {
    unwrapInput(this[findInput], this[findCase])
    this[findMatches].innerText = `${activeMatch}/${matches}`
    matches > 0 ? unlockNext.call(this) : lockNext.call(this)
    this[action] === 'input' ? focusInput.call(this) : ''
  })
}

function lockNext () {
  this[findBack].style['opacity'] = 0.6
  this[findBack].style['pointer-events'] = 'none'
  this[findForward].style['opacity'] = 0.6
  this[findForward].style['pointer-events'] = 'none'
}

function unlockNext () {
  this[findBack].style['opacity'] = 1
  this[findBack].style['pointer-events'] = 'auto'
  this[findForward].style['opacity'] = 1
  this[findForward].style['pointer-events'] = 'auto'
}

module.exports = FindInPage
