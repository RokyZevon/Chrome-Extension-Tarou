import type { Treasure } from 'api'
import type { BattleMemo } from 'myStorage'
import type { Exlb } from 'party'
import { load } from 'cheerio'
import dayjs from 'dayjs'
import { onMessage, sendMessage } from 'webext-bridge/background'
import { battleInfo, battleMemo, deckList, localNpcList, mySupportSummon, notificationItem, notificationSetting, obTabId, obWindowId, profile } from '~/logic/storage'

(() => {
  const MaxMemoLength = 50
  const { registerContextMenu, addMenuClickListener } = useContextMenu()
  const { checkUser, sendInfo } = useUser()

  onMessage('express', (res) => {
    try {
      unpack(res.data as string)
    }
    catch (error) {
      console.log(String(error))
    }
  })

  chrome.tabs.onUpdated.addListener(() => {
    console.log('wake up!')
  })

  chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === obTabId.value)
      chrome.windows.remove(obWindowId.value).catch(() => {})
  })

  chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === obWindowId.value) {
      obWindowId.value = 0
      battleInfo.value = {}
      deckList.value = []
    }
  })

  chrome.webRequest.onBeforeRequest.addListener((details) => {
    // 记录战斗id与副本名称
    if (/\/rest\/(?:raid|multiraid)\/start\.json/.test(details.url)) {
      checkUser(details.url)

      if (!details.requestBody?.raw) {
        console.log('details.requestBody==>', details.requestBody)
        return
      }
      const arrayBuffer = details.requestBody.raw[0].bytes!

      const decoder = new TextDecoder('utf-8')
      const uint8Array = new Uint8Array(arrayBuffer)
      const jsonString = decoder.decode(uint8Array)
      const requestBody: RequestBody = JSON.parse(jsonString)
      const battleId = String(requestBody.raid_id)
      const timestamp = Number(requestBody.time)
      const hitMemo = battleMemo.value.find(memo => memo.battleId === battleId)
      if (hitMemo)
        return
      console.log('gogogo')

      sendMessage('getRaidName', null, { context: 'content-script', tabId: details.tabId }).then((res) => {
        if (!res?.questName)
          return
        console.log('新增memo==>', { battleId, quest_name: res.questName, timestamp, date: dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss') })

        battleMemo.value.push({ battleId, questName: res.questName, timestamp, date: dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss') })

        if (battleMemo.value.length > MaxMemoLength)
          battleMemo.value.shift()
        console.log('memoList==>', battleMemo.value)
      }).catch((err) => {
        console.log(err)
      })
    }
  }, { urls: ['*://*.granbluefantasy.jp/*'] }, ['requestBody'])

  chrome.webRequest.onCompleted.addListener((details) => {
    // 记录掉落结果
    if (/\/result(?:multi)?\/content\/index/.test(details.url)) {
      checkUser(details.url)
      const battleId = details.url.match(/\d+/g)![0]
      const hitMemo = battleMemo.value.find(memo => memo.battleId === battleId)
      if (!hitMemo)
        return

      sendMessage('getBattleResult', null, { context: 'content-script', tabId: details.tabId }).then((res) => {
        if (!res?.domStr)
          return
        const treasureList: Treasure[] = getTreasureList(res.domStr)
        const dropInfo = {
          battleId: hitMemo.battleId,
          questName: hitMemo.questName,
          questImage: hitMemo.questImage,
          questType: hitMemo.questType,
          timestamp: hitMemo.timestamp,
          reward: treasureList,
        }

        console.log('sendDropInfo', dropInfo)
        sendInfo([dropInfo])
          .then(() => { cleanBattleMemo(battleId) })
          .catch((err) => { console.log(err.message) })
      }).catch((err) => {
        console.log(err)
      })
    }

    // 记录历史记录里的掉落结果
    if (/\/result(?:multi)?\/content\/detail/.test(details.url)) {
      checkUser(details.url)
      const battleId = details.url.match(/\d+/g)![0]

      sendMessage('getBattleHistoryResult', null, { context: 'content-script', tabId: details.tabId }).then((res) => {
        if (!res?.domStr)
          return

        const $ = load(res.domStr)
        const questName = $('.txt-enemy-name').text().trim()
        const finishTime = $('.txt-defeat-value').first().text()
        const questImage = imgSrcToQuestImage($('.img-defeat').attr('src'))
        const treasureList: Treasure[] = getTreasureList(res.domStr)

        const dropInfo = {
          battleId,
          questName,
          questImage,
          questType: '1',
          timestamp: formatFinishTime(finishTime),
          reward: treasureList,
        }

        console.log('sendDropInfo', dropInfo)
        sendInfo([dropInfo])
          .then(() => { cleanBattleMemo(battleId) })
          .catch((err) => { console.log(err.message) })
      }).catch((err) => {
        console.log(err)
      })
    }

    // 记录未结算战斗信息
    if (details.url.includes('/quest/unclaimed_reward')) {
      checkUser(details.url)
      sendMessage('getUnclaimedList', null, { context: 'content-script', tabId: details.tabId }).then((res) => {
        if (!res?.domStr)
          return

        const unclaimedList = getBattleList(res.domStr)

        unclaimedList.forEach((battle) => {
          const hitMemo = battleMemo.value.find(memo => memo.battleId === battle.battleId)
          if (hitMemo)
            return

          console.log('未记录过的战斗信息', battle)

          battleMemo.value.push({ ...battle })
        })

        while (battleMemo.value.length > MaxMemoLength)
          battleMemo.value.shift()

        console.log('memoList==>', battleMemo.value)
      }).catch((err) => {
        console.log(err)
      })
    }

    // 记录友招信息
    if (details.url.includes('/profile/content/index')) {
      const searchParams = new URLSearchParams(details.url)
      const myUid = searchParams.get('uid') || ''
      const match = details.url.match(/\/(\d+)\?/)!
      const currentUid = match[1]

      if (myUid !== currentUid)
        return

      sendMessage('getSupportSummon', null, { context: 'content-script', tabId: details.tabId }).then((res) => {
        if (!res?.domStr)
          return

        profile.value.uid = myUid

        const $ = load(res.domStr)
        profile.value.imgPc = String($(`.img-pc`).data().imageName)
        profile.value.name = String($(`.txt-user-name`).text())

        for (let i = 0; i < 7; i++) {
          for (let j = 0; j < 4; j++) {
            if (i !== 0 && j > 1)
              continue
            const target = $(`#js-fix-summon${i}${j}`)
            if (target.length) {
              const imgId = String(target.data().imageId)
              const name = $(`#js-fix-summon${i}${j}-name`).text()
              const infoClass = $(`#js-fix-summon${i}${j}-info`).attr('class')
              const rank = infoClass?.match(/bless-(.*?)-style/)
              mySupportSummon.value[`${i}${j}`] = { imgId, name, rank: rank ? rank[1] : '', necessary: mySupportSummon.value[`${i}${j}`]?.necessary ?? false }
            }
            else {
              mySupportSummon.value[`${i}${j}`] = { imgId: 'empty', name: '', rank: '', necessary: mySupportSummon.value[`${i}${j}`]?.necessary ?? false }
            }
          }
        }
      }).catch((err) => {
        console.log(err)
      })
    }

    // 记录角色信息
    if (details.url.includes('/npczenith/content/index')) {
      sendMessage('getNpczenith', null, { context: 'content-script', tabId: details.tabId }).then((res) => {
        if (!res?.domStr)
          return

        const $ = load(res.domStr)
        const paramId = Number($(`div.cnt-zenith.npc`).data()?.userNpcId)
        if (!paramId)
          return

        const hitNpc = localNpcList.value.find(n => n.paramId === paramId)
        if (!hitNpc)
          return

        const exlb: Exlb[] = []
        $('#prt-extra-lb-list').children('.prt-extra-lb-title').each((i, elem) => {
          const type = $(elem).text()
          const lb: Exlb = { type, bonuse: [] }
          exlb.push(lb)
          $(elem).next('.prt-extra-lb-info').children('.prt-bonus-detail').each((i, elem) => {
            if (!$(elem).hasClass('is-master')) {
              lb.bonuse.push({
                icon: $(elem).find('.prt-bonus-icon').attr('class')?.replace('prt-bonus-icon ', '') || '',
                name: $(elem).find('.txt-bonus-name').text().trim(),
                value: $(elem).find('.txt-current-bonus').text().trim(),
              })
            }
          })
        })
        hitNpc.exlb = exlb.filter(i => i.bonuse.length !== 0)
      }).catch((err) => {
        console.log(err)
      })
    }
  }, { urls: ['*://*.granbluefantasy.jp/*'] })

  function getBattleList(domStr: string) {
    const $ = load(domStr)
    const res: BattleMemo[] = []

    $('.lis-raid').each((i, elem) => {
      const questName = $(elem).find('.txt-raid-name')?.text()
      const finishTime = $(elem).find('.prt-finish-time')?.text()
      const questImage = imgSrcToQuestImage($(elem).find('.img-raid-thumbnail').attr('src'))
      res.push({
        battleId: String($(elem).data().raidId),
        questName: questName.trim(),
        questType: '1',
        questImage,
        timestamp: formatFinishTime(finishTime),
        date: dayjs(formatFinishTime(finishTime)).format('YYYY-MM-DD HH:mm:ss'),
      })
    })
    return res
  }

  function getTreasureList(domStr: string) {
    const $ = load(domStr)
    const res: Treasure[] = []

    $('.prt-item-list').children('.lis-treasure').each((i, elem) => {
      const isItem = $(elem).hasClass('btn-treasure-item')
      const isArtifact = $(elem).hasClass('btn-artifact')

      if (isItem) {
        const imgSrc = $(elem).find('.img-treasure-item').attr('src')
        const itemKey = imgSrcToKey(imgSrc)
        if (notificationItem.value.includes(itemKey))
          showNotifications(itemKey)

        const count = $(elem).find('.prt-article-count').text().split('x')[1]
        res.push({
          box: String($(elem).data().box),
          key: $(elem).data().key as string,
          count: count ? Number(count) : 1,
        })
      }

      if (isArtifact) {
        const imgSrc = $(elem).find('.img-artifact').attr('src')
        const itemKey = imgSrcToKey(imgSrc)
        if (notificationItem.value.includes(itemKey))
          showNotifications(itemKey)

        const artifact = $(elem).find('.img-artifact').attr('alt')
        const attr = $(elem).find('.ico-attr').attr('alt')
        const kind = $(elem).find('.ico-kind').attr('alt')
        res.push({
          box: 'artifact',
          key: `${artifact}-${attr}-${kind}`,
          count: 1,
        })
      }
    })

    return res
  }

  function cleanBattleMemo(battleId: string) {
    battleMemo.value = battleMemo.value.filter(memo => memo.battleId !== battleId && Date.now() - memo.timestamp < 14 * 24 * 60 * 60 * 1000)
  }

  function showNotifications(item: string) {
    if (!notificationSetting.value.targetItemDrop)
      return

    const length = Math.floor(Math.random() * 10) + 1
    let str = ''
    for (let i = 0; i < length; i++)
      str += 'e'

    createNotification({
      message: `G${str}t☆Daze!`,
      iconUrl: `https://prd-game-a1-granbluefantasy.akamaized.net/assets/img/sp/assets${item}`,
      sound: 'drop',
    })
  }

  chrome.runtime.onInstalled.addListener(() => {
    registerContextMenu()
  })

  addMenuClickListener()
})()

interface RequestBody {
  special_token: any
  raid_id: string
  action: string
  is_multi: boolean
  time: number
}
