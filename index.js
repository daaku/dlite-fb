var _ = require('underscore')
  , QS = require('dlite-qs')
  , jsonp = require('dlite-jsonp')
  , Cache = require('dlite-cache')
  , Event = require('dlite-event')

  , pingIframe
  , loginWindow
  , accessToken
  , clientId
  , defaultScope
  , channelUrl

Event(exports)

window._fb_recv = function(res) {
  res = QS.decode(res.substr(1))
  if (res.access_token) {
    accessToken = res.access_token
    Cache.put('accessToken', res.access_token, parseInt(res.expires_in, 10))
    exports.fire('login')
  }

  if (loginWindow) {
    try { loginWindow.close() } catch(e) {}
    loginWindow = null
  }

  if (pingIframe) {
    window.setTimeout(function() {
      pingIframe.parentNode.removeChild(pingIframe)
      pingIframe = null
    }, 0)
  }
}

function makeOAuthUrl(opts) {
  return 'https://www.facebook.com/dialog/oauth?' + QS.encode(_.extend({
    client_id: clientId,
    scope: defaultScope,
    response_type: 'token',
    redirect_uri: channelUrl
  }, opts))
}

function checkStored() {
  accessToken = Cache.get('accessToken')
  if (accessToken) return exports.fire('login')
  Cache.clear()
}

function ping() {
  pingIframe = document.createElement('iframe')
  pingIframe.src = makeOAuthUrl({ display: 'none' })
  pingIframe.className = 'hide-away'
  document.body.appendChild(pingIframe)
}

exports.login = function() {
  loginWindow = window.open(makeOAuthUrl({ display: 'touch' }))
}

exports.logout = function() {
  var iframe = document.createElement('iframe')
  iframe.src = 'https://www.facebook.com/logout.php?' + QS.encode({
    access_token: accessToken,
    next: channelUrl
  })
  iframe.className = 'hide-away'
  iframe.onload = function() {
    Cache.clear()
    window.location.reload()
  }
  document.body.appendChild(iframe)
}

exports.api = function() {
  var args = _.toArray(arguments)
    , path = args.shift()
    , next = args.shift()
    , method
    , params
    , cb

  while (next) {
    var type = typeof next
    if (type === 'string' && !method) {
      method = next.toLowerCase()
    } else if (type === 'function' && !cb) {
      cb = next
    } else if (type === 'object' && !params) {
      params = next
    } else {
      return console.error('Invalid argument passed to FB.api(): ' + next)
    }
    next = args.shift()
  }

  params = params || {}
  params.method = method

  var cacheKey = 'fb.api-' + path + QS.encode(params)
  if (!method) {
    var cached = Cache.get(cacheKey)
    if (cached) return cb(null, cached)
  }

  params.access_token = accessToken
  params.callback = '?'
  params.pretty = 0

  var url = 'https://graph.facebook.com/' + path + '?' + QS.encode(params)
  jsonp(url, function(res) {
    if (res.error) {
      console.error('fb.api', JSON.stringify(res))
      if (res.error.message.indexOf('Error validating access token') > -1)
        exports.logout()
      return cb(res)
    }
    if (!method) Cache.put(cacheKey, res)
    cb(null, res)
  })
}

exports.init = function(opts) {
  clientId = opts.id
  channelUrl = opts.channelUrl
  defaultScope = opts.scope

  checkStored()
  if (!accessToken) ping()
}
