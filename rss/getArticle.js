const FeedParser = require('feedparser')
const requestStream = require('./request.js')
const sqlConnect = require('./sql/connect.js')
const sqlCmds = require('./sql/commands.js')
const storage = require('../util/storage.js')
const currentGuilds = storage.currentGuilds
const failedLinks = storage.failedLinks
const passesFilters = require('./translator/translate.js')

module.exports = function (guildId, rssName, passFiltersOnly, callback) {
  const rssList = currentGuilds.get(guildId).sources

  if (typeof failedLinks[rssList[rssName].link] === 'string') return callback({type: 'failedLink', content: 'Reached fail limit', feed: rssList[rssName]})

  const feedparser = new FeedParser()
  const currentFeed = []
  const cookies = (rssList[rssName].advanced && rssList[rssName].advanced.cookies) ? rssList[rssName].advanced.cookies : undefined

  requestStream(rssList[rssName].link, cookies, feedparser, function (err) {
    if (err) return callback({type: 'request', content: err, feed: rssList[rssName]})
  })

  feedparser.on('error', function (err) {
    feedparser.removeAllListeners('end')
    return callback({type: 'feedparser', content: err, feed: rssList[rssName]})
  })

  feedparser.on('readable', function () {
    let item

    while (item = this.read()) {
      currentFeed.push(item)
    }
  })

  feedparser.on('end', function () {
    if (currentFeed.length === 0) return callback({type: 'feedparser', content: 'No existing feeds', feed: rssList[rssName]})

    const con = sqlConnect(getArticle)

    function getArticle () {
      sqlCmds.selectTable(con, rssName, function (err, results) {
        if (err || results.size() === 0) {
          if (err) callback({type: 'database', content: err, feed: rssList[rssName]})
          if (results.size() === 0) callback(true, {type: 'deleted', content: `Nonexistent in database`, feed: rssList[rssName]})
          return sqlCmds.end(con, function (err) {
            if (err) throw err
          })
        }

        if (passFiltersOnly) {
          const filteredCurrentFeed = []

          for (var i in currentFeed) if (passesFilters(guildId, rssList, rssName, currentFeed[i], false)) filteredCurrentFeed.push(currentFeed[i])

          if (filteredCurrentFeed.length === 0) callback({type: 'feed', content: 'No articles that pass current filters.', feed: rssList[rssName]})
          else {
            const randFeedIndex = Math.floor(Math.random() * (filteredCurrentFeed.length - 1)) // Grab a random feed from array
            callback(false, filteredCurrentFeed[randFeedIndex])
          }
        } else {
          const randFeedIndex = Math.floor(Math.random() * (currentFeed.length - 1)) // Grab a random feed from array
          callback(false, currentFeed[randFeedIndex])
        }

        return sqlCmds.end(con, function (err) {
          if (err) throw err
        })
      })
    }
  })
}
