import path from 'path'
import fs from 'fs'
import _ from 'lodash'
import { TwitterHelper } from './twitter'
import GithubHelper from './github'
import {
    createTimeObj,
    getTime,
} from './util'


export class App {
  async init() {
    const users = await JSON.parse(fs.readFileSync(path.join(__dirname, '/../data/users-filtered.json')))
    const obj = {
      initDate: getTime().format('YYYY-MM-DD'),
      lastRun: null,
      lastUpdate: null,
      sinceId: null,
      tweets: [],
      users,
    }
    await this.redisClient.hmsetAsync('app', _.mapValues(obj, v => JSON.stringify(v)))
    return obj
  }

  async run() {
    try {
      const isActive = !!await this.redisClient.existsAsync('app')

      const data = await (isActive ?
                this.redisClient
                .hgetallAsync('app')
                .then(obj =>
                    _.mapValues(obj, v =>
                        JSON.parse(v))) : this.init()
            )

      data.time = _.chain(data)
                .pick(['initDate', 'lastRun', 'lastUpdate'])
                // eslint-disable-next-line no-confusing-arrow
                .mapValues(v => _.isNil(v) ? null : getTime(v))
                .thru(timeProps => createTimeObj(timeProps))
                .value()

      const twitterClient = new TwitterHelper(this.config.TWITTER_CONFIG, this.config.LIST_ID)
      const twitterData = await twitterClient.run(data)
      const newData = {}
      newData.sinceId = twitterData.sinceId
      newData.tweets = data.time.yesterdayDate ? [...twitterData.tweets[2]] : twitterData.tweets

      if (data.time.yesterdayDate) {
        data.tweets = [..._.flatten(twitterData.tweets.slice(0, -1))]
        await new GithubHelper(this.config.GITUB_TOKEN, this.config.GITHUB_CONFIG).run(data)
        newData.lastUpdate = getTime(data.time.todayDate, 'M-D-Y')
      }
      newData.lastRun = data.time.now
      await this.redisClient.hmsetAsync('app', _.mapValues(newData, v => JSON.stringify(v)))
    } catch (e) {
      return Promise.reject(e)
    }

    return true
  }

  constructor(config, redisClient) {
    this.config = config
    this.redisClient = redisClient
  }
}

export const appBuilder = (config, redisClient) => new App(config, redisClient)
