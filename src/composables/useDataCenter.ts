import type { Player } from 'myStorage'
import type { BuildLeaderAbility, BuildNpc } from 'party'
import type { BattleStartJson, GachaResult } from 'source'
import { load } from 'cheerio'
import dayjs from 'dayjs'
import { sendBossInfo } from '~/api'
import { battleInfo, battleMemo, battleRecord, evokerInfo, gachaRecord, jobAbilityList, legendticket, legendticket10, localNpcList, materialInfo, notificationSetting, obTabId, obWindowId, recoveryItemList, stone, xenoGauge } from '~/logic'

const MaxMemoLength = 50

export async function unpack(parcel: string) {
  if (typeof parcel !== 'string')
    return

  const { url, requestData, responseData } = JSON.parse(parcel) as { url: string, requestData?: string, responseData?: any }

  // Dashboard 抽卡数据
  if (url.includes('game.granbluefantasy.jp/gacha/list')) {
    stone.value = Number(responseData.stone_num)

    // 十连ticket id为 20010
    legendticket10.value = Number(
      responseData.legend.lineup
        .find((item: any) => item.text_btn_image === 'text_legend10')
        .legend_gacha_ticket_list.find((ticket: any) => Number(ticket.ticket_id) === 20010).ticket_num,
    )
    // 单抽ticket id为 20011
    legendticket.value = Number(
      responseData.legend.lineup
        .find((item: any) => item.text_btn_image === 'text_legend')
        .legend_gacha_ticket_list.find((ticket: any) => Number(ticket.ticket_id) === 20011).ticket_num,
    )
  }

  // Dashboard 抽卡记录
  if (url.includes('gacha/result//legend')) {
    const RawData: GachaResult = responseData

    let hit = gachaRecord.value.find(pool => pool.random_key === RawData.random_key)
    if (!hit) {
      hit = {
        random_key: RawData.random_key,
        service_start: RawData.ceiling.start,
        service_end: RawData.ceiling.end,
        count: 0,
        use_count: 0,
        ssrList: [],
      }
      gachaRecord.value.unshift(hit)
    }

    // 避免刷新结果重复计算
    if (hit.use_count === Number(RawData.ceiling.use_count))
      return
    hit.use_count = Number(RawData.ceiling.use_count)

    RawData.result.forEach((item) => {
      hit!.count++
      if (item.reward_rare_val === '4') {
        hit!.ssrList.push({
          id: item.reward_id,
          type: item.reward_type,
          is_new: item.is_new,
        })
      }
    })
  }

  // Dashboard 体力道具数据
  if (url.includes('/item/recovery_and_evolution_list_by_filter_mode')) {
    const itemList = responseData
    const firstList = itemList[0]

    const recoveryList = [
      { item_id: '1', prop: 'fullElixir', number: 0 },
      { item_id: '2', prop: 'halfElixir', number: 0 },
      { item_id: '3', prop: 'soulBalm', number: 0 },
      { item_id: '5', prop: 'soulBerry', number: 0 },
    ]
    const res: any = {}
    res.timeStamp = dayjs().valueOf()

    if (recoveryItemList.value.length > 0) {
      const lastData = recoveryItemList.value[0]
      if (dayjs().isSame(dayjs(lastData.timeStamp), 'day'))
        return
      recoveryList.forEach((item) => {
        const target = firstList.find((i: any) => String(i.item_id) === item.item_id)
        const targetNumber = Number(target?.number) || 0
        res[item.prop] = targetNumber
        res[`${item.prop}Diff`] = targetNumber - lastData[item.prop as 'fullElixir' | 'halfElixir' | 'soulBalm' | 'soulBerry']
      })
    }
    else {
      recoveryList.forEach((item) => {
        const target = firstList.find((i: any) => String(i.item_id) === item.item_id)
        res[item.prop] = Number(target?.number) || 0
        res[`${item.prop}Diff`] = 0
      })
    }
    recoveryItemList.value.unshift(res)
  }

  // Evoker 素材数据
  if (url.includes('/item/article_list_by_filter_mode')) {
    materialInfo.value = responseData
  }

  // Evoker 贤武数据
  if (url.includes('/weapon/list')) {
    const weaponList = responseData.list
    weaponList.forEach((weapon: any) => {
      const hitEvoker = evokerInfo.value.find(evoker => evoker.weaponId === Number(weapon.master.id))
      if (hitEvoker)
        hitEvoker.weaponLevel = Number(weapon.param.evolution) + 1
    })
  }

  // Evoker 塔罗数据
  if (url.includes('/summon/list')) {
    const summonList = responseData.list
    summonList.forEach((summon: any) => {
      const hitEvoker = evokerInfo.value.find(evoker => evoker.summonId === Number(summon.master.id))
      if (hitEvoker)
        hitEvoker.tarotLevel = Number(summon.param.evolution) + 2
    })
  }

  // Evoker 贤者数据
  if (url.includes('/npc/list')) {
    const npcList = responseData.list
    npcList.forEach((npc: any) => {
      const hitEvoker = evokerInfo.value.find(evoker => evoker.npcId === Number(npc.master.id))
      if (hitEvoker)
        hitEvoker.evokerLevel = Number(npc.param.evolution) + 1
    })
  }

  // Evoker 领域数据
  if (url.includes('/rest/npcevoker/evoker_list')) {
    const data = responseData.evoker
    const hitEvoker = evokerInfo.value.find(evoker => evoker.npcId === Number(data.param.npc_id))
    if (hitEvoker)
      hitEvoker.domainLevel = Number(data.param.evoker_lv)
  }

  // Evoker 贤者四技能数据 & Party 角色数据
  if (url.includes('/npc/npc')) {
    const npcDetail = responseData
    const hitEvoker = evokerInfo.value.find(evoker => evoker.npcId === Number(npcDetail.master.id))
    if (hitEvoker)
      hitEvoker.isAbility4Release = !!(npcDetail.ability[4] && npcDetail.ability[4].quest?.is_clear)

    // 记录角色信息
    const npcInfo: BuildNpc = {
      paramId: npcDetail.id,
      masterId: Number(npcDetail.master.id),
      imageId: '',
      isAugment: npcDetail.has_npcaugment_constant,
      arousalForm: npcDetail.npc_arousal_form,
      ability: [],
      artifact: [],
    }

    for (let i = 1; i <= 4; i++) {
      const currentAbility = npcDetail.ability[i]
      if (currentAbility) {
        npcInfo.ability.push({
          iconType: currentAbility.icon_type,
          fa: !!currentAbility.user_full_auto_setting_flag,
        })
      }

      const artifactSkillInfo = npcDetail.artifact[`skill${i}_info`]
      if (artifactSkillInfo) {
        npcInfo.artifact!.push({
          value: artifactSkillInfo.effect_value,
          icon: artifactSkillInfo.icon_image,
          level: artifactSkillInfo.level,
          name: artifactSkillInfo.name,
        })
      }
    }
    const hitIndex = localNpcList.value.findIndex(npc => npc.paramId === npcDetail.id)

    if (hitIndex === -1)
      localNpcList.value.push(npcInfo)
    else
      localNpcList.value[hitIndex] = { ...npcInfo, exlb: localNpcList.value[hitIndex].exlb }

    localNpcList.value = localNpcList.value.filter(n => !Object.hasOwn(n, 'id'))
  }

  // Evoker 获取沙盒4个六道boss进度条
  if (url.includes('/rest/replicard/stage')) {
    if ([6, 7, 8, 9].includes(Number(responseData.stage.stage_id))) {
      for (const division of Object.values(responseData.map.division_list)) {
        const hitQuest = (division as any).quest_list.find((quest: any) => xenoGauge.value.some(xeno => xeno.questId === quest.quest_id))
        if (hitQuest) {
          xenoGauge.value.find(xeno => xeno.questId === hitQuest.quest_id)!.gauge = hitQuest.xeno_sephira_gauge || 0
          break
        }
      }
    }
  }

  // Party 记录伤害计算设置
  if (url.includes('party/calculate_setting')) {
    const regex = /calculate_setting\/(\d+)\/(\d+)/
    const matches = url.match(regex)
    const priority = matches ? matches.slice(1).join('') : null
    if (priority)
      handleCalculateSetting({ priority, setting: responseData })
  }

  // Party 记录更改伤害计算设置
  if (url.includes('party/save_calculate_setting')) {
    const setting = JSON.parse(requestData!)
    handleCalculateSetting({ priority: String(setting.group_priority) + String(setting.priority), setting })
  }

  // Party 主角技能
  if (url.includes('/party/job_equipped')) {
    const jobInfo = responseData.job
    const job_param_id = jobInfo.param.id

    for (let i = 1; i <= 4; i++) {
      const actionAbility = jobInfo.ability[i]
      if (actionAbility) {
        const ab: BuildLeaderAbility = {
          jobParamId: i === 1 ? job_param_id : 0,
          actionId: String(actionAbility.action_id),
          iconId: actionAbility.class_name,
          name: actionAbility.name,
          iconType: actionAbility.action_icon.split('_')[1],
          fa: !!actionAbility.user_full_auto_setting_flag,
        }

        if (i === 1)
          jobAbilityList.value = jobAbilityList.value.filter(a => !(a.jobParamId === job_param_id && a.actionId !== ab.actionId))

        const hitIndex = jobAbilityList.value.findIndex(a => a.actionId === ab.actionId)
        if (hitIndex === -1)
          jobAbilityList.value.push(ab)
        else
          jobAbilityList.value[hitIndex] = ab
      }
    }
    jobAbilityList.value = jobAbilityList.value.filter(a => !Object.hasOwn(a, 'action_id'))
  }

  // Party 角色技能切换fa开关
  if (url.includes('/npc/full_auto_ability_setting')) {
    const faAbilitySetting = JSON.parse(requestData!)
    const hit = localNpcList.value.find(npc => npc.paramId === faAbilitySetting.user_npc_id)
    if (hit)
      hit.ability[faAbilitySetting.ability_num - 1].fa = !!faAbilitySetting.auto_execute_flag
  }

  //  Party 主角技能切换fa开关
  if (url.includes('/job/fullautosetting/pc_full_auto_setting')) {
    const faAbilitySetting = JSON.parse(requestData!)
    const hit = jobAbilityList.value.find(a => a.actionId === String(faAbilitySetting.ability_id))
    if (hit)
      hit.fa = !!faAbilitySetting.auto_execute_flag
  }

  // BattleLog 记录单次攻击日志
  if (/\/rest\/(?:raid|multiraid)\/normal_attack_result\.json/.test(url)) {
    handleAttackRusultJson('normal', responseData, JSON.parse(requestData!))
  }

  // BattleLog 记录使用召唤日志
  if (/\/rest\/(?:raid|multiraid)\/summon_result\.json/.test(url)) {
    handleAttackRusultJson('summon', responseData, JSON.parse(requestData!))
  }

  // BattleLog 记录使用FC日志
  if (/\/rest\/(?:raid|multiraid)\/fatal_chain_result\.json/.test(url)) {
    handleAttackRusultJson('fc', responseData, JSON.parse(requestData!))
  }

  // BattleLog 记录使用技能日志
  if (/\/rest\/(?:raid|multiraid)\/ability_result\.json/.test(url)) {
    handleAttackRusultJson('ability', responseData, JSON.parse(requestData!))
  }

  // BattleLog 记录使用蓝绿药日志
  if (/\/rest\/(?:raid|multiraid)\/temporary_item_result\.json/.test(url)) {
    handleAttackRusultJson('temporary', responseData, JSON.parse(requestData!))
  }

  // BattleLog 记录使用大红日志
  if (/\/rest\/(?:raid|multiraid)\/user_recovery\.json/.test(url)) {
    handleAttackRusultJson('recovery', responseData, JSON.parse(requestData!))
  }

  // Notification 战斗结果特殊事件提醒
  if (/\/result(?:multi)?\/content\/index\/\d+/.test(url)) {
    const result_data = responseData.option.result_data
    if (result_data.appearance?.is_quest && notificationSetting.value.appearanceQuest)
      createNotification({ message: 'Hell提醒', sound: 'hell' })

    if (result_data.replicard?.has_occurred_event && notificationSetting.value.replicardEvent) {
      createNotification({
        message: '沙盒宝箱提醒',
        iconUrl: 'https://prd-game-a1-granbluefantasy.akamaized.net/assets/img/sp/assets/enemy/s/4200151.png',
        sound: 'hell',
      })
    }

    if (result_data.advent_info?.is_over_limit && notificationSetting.value.isPointOverLimit)
      createNotification({ message: '四象点数已经超过上限!!!', sound: 'warning' })

    const display_list = responseData.display_list
    if (!display_list || !notificationSetting.value.itemGoal)
      return
    const itemList = Object.values(display_list)
    itemList.forEach((item: any) => {
      const current = Number(item.number)
      const goal = Number(item.registration_number)
      if (goal > 0 && goal <= current)
        createNotification({ message: `${item.name}达到目标数量`, sound: 'warning' })
    })
  }

  // BattleLog 记录副本start信息
  if (/\/rest\/(?:raid|multiraid)\/start\.json/.test(url)) {
    const battleId = String(responseData.raid_id)
    const timestamp = new Date().valueOf()
    const hitMemo = battleMemo.value.find(memo => memo.battleId === battleId)
    if (!hitMemo) {
      const questName = responseData.boss.param[0].monster

      const memo = { battleId, questName, timestamp, date: dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss') }
      battleMemo.value.push(memo)
      console.log('新增memo==>', memo)

      if (battleMemo.value.length > MaxMemoLength)
        battleMemo.value.shift()
      console.log('memoList==>', battleMemo.value)
    }

    if (!obWindowId.value)
      return

    battleInfo.value.inLobby = false

    const battleStartJson: BattleStartJson = responseData

    handleStartJson(battleStartJson)

    const matchName = battleStartJson.boss.param.reduce<string[]>((pre, cur) => {
      pre.push(cur.name.ja, cur.name.en)
      return pre
    }, [])
    const bossInfo = {
      battleId: String(battleStartJson.raid_id),
      userId: battleStartJson.user_id,
      questId: battleStartJson.quest_id,
      battleTotal: Number(battleStartJson.battle.total),
      battleCount: Number(battleStartJson.battle.count),
      matchName,
      boss: battleStartJson.boss.param.map(boss => ({
        id: boss.enemy_id,
        name: boss.name.ja,
        lv: boss.Lv,
        attr: boss.attr,
        cjs: boss.cjs,
        hp: Number(boss.hpmax),
      })),
    }
    console.log('sendBossInfo', bossInfo)
    sendBossInfo(bossInfo).catch((err) => { console.log(err.message) })
  }

  // Drop 记录未结算战斗信息
  if (url.includes('/quest/unclaimed_reward')) {
    for (const battle of responseData.list) {
      const hitMemo = battleMemo.value.find(memo => memo.battleId === String(battle.raid_id))
      if (hitMemo)
        continue

      const battleInfo = {
        battleId: String(battle.raid_id),
        questName: battle.chapter_name,
        questType: '1',
        timestamp: formatFinishTime(battle.finish_time),
        date: dayjs(formatFinishTime(battle.finish_time)).format('YYYY-MM-DD HH:mm:ss'),
      }

      console.log('未记录过的战斗信息', battleInfo)

      battleMemo.value.push({ ...battleInfo })
    }

    while (battleMemo.value.length > MaxMemoLength)
      battleMemo.value.shift()

    console.log('memoList==>', battleMemo.value)
  }

  // ===============详细面板打开时进行以下接口分析=====================
  // ===============详细面板打开时进行以下接口分析=====================
  // ===============详细面板打开时进行以下接口分析=====================
  // ===============详细面板打开时进行以下接口分析=====================
  // ===============详细面板打开时进行以下接口分析=====================
  // ===============详细面板打开时进行以下接口分析=====================
  // ===============详细面板打开时进行以下接口分析=====================
  // ===============详细面板打开时进行以下接口分析=====================

  if (!obWindowId.value)
    return

  // 判断是否开启debugger
  if (url.includes('/socket/uri')) {
    chrome.debugger.detach({ tabId: obTabId.value })
      .catch(error => console.log(error))
      .then(() => chrome.debugger.attach({ tabId: obTabId.value }, '1.2'))
      .then(() => chrome.debugger.sendCommand({ tabId: obTabId.value }, 'Network.enable'))
      .catch(error => console.log(error))
  }

  // Party 记录当前队伍信息
  if (url.includes('party/deck')) {
    handleDeckJson(responseData.deck)
  }

  // BattleLog 查询房间成员
  if (url.includes('/lobby/content/room_member')) {
    battleInfo.value.inLobby = true
    battleInfo.value.lobbyMemberList = []
    const htmlString = decodeURIComponent(responseData.data)
    const $ = load(htmlString)
    const memberEl = $('.prt-room-member').children()
    memberEl.each((i, elem) => {
      battleInfo.value.lobbyMemberList!.push({
        nickname: elem.attribs['data-nick-name'],
        userId: elem.attribs['data-user-id'],
        userRank: elem.attribs['data-user-rank'],
        jobIcon: $(elem).find('.img-job-icon').attr('src') ?? '',
        attributeClass: $(elem).find('.ico-attribute').attr('class') ?? '',
        is_dead: false,
      })
    })
  }

  // BattleLog 记录子技能日志
  if (/\/rest\/(?:raid|multiraid)\/get_select_if\.json/.test(url)) {
    const data = responseData
    const paylaod = JSON.parse(requestData!)
    const hit = battleRecord.value.find(record => record.raid_id === paylaod.raid_id)
    if (!hit)
      return
    const hitAbility = hit.abilityList.find(ability => ability.id === paylaod.ability_id)
    if (!hitAbility)
      return
    hitAbility.subAbility = Object.values(data.select_ability_info).map((item: any) => ({
      icon: item.image,
      id: item.action_id,
      index: item.index,
    }))
  }

  // BattleLog 记录切换guard日志
  if (/\/rest\/(?:raid|multiraid)\/guard_setting\.json/.test(url)) {
    const paylaod = JSON.parse(requestData!)
    handleGuardSettingJson({ raid_id: paylaod.raid_id, guard_status: responseData.guard_status })
  }

  // BattleLog 记录战斗结果
  if (url.includes('resultmulti/content/detail')) {
    const regex = /\/detail\/(\d+)\?/
    const match = regex.exec(url) as RegExpExecArray
    const raid_id = Number(match[1])
    const hit = battleRecord.value.find(record => record.raid_id === raid_id)
    if (!hit || !hit.hasResult) {
      const htmlString = decodeURIComponent(responseData.data)
      const $ = load(htmlString)
      const raidName = $('.txt-enemy-name').text()
      const finishTime = $('.txt-defeat-value').first().text()
      const endTimestamp = formatFinishTime(finishTime)
      const gainList: string[] = []

      $('.txt-gain-value').each((i, elem) => {
        gainList.push($(elem).text())
      })
      const damage = gainList[2]
      const turn = gainList[3]
      const time = gainList[4]

      const treasureList: { src: string, number: string, boxClass: string }[] = []

      $('.lis-treasure').each((i, elem) => {
        treasureList.push({
          src: $(elem).find('img').attr('src') || '',
          number: $(elem).find('.prt-article-count').text().split('x')[1],
          boxClass: $(elem).children().last().attr('class') || '',
        })
      })

      const memberList: any[] = responseData.option.member_list
      const player = memberList.reduce<Player[]>((pre, cur) => {
        pre.push({
          pid: cur.image_id.split('_')[0],
          image_id: `${cur.image_id.split('_')[0]}_01`,
          use_ability_count: Number(cur.use_ability_count),
          use_special_skill_count: Number(cur.use_special_skill_count),
          is_npc: cur.is_npc,
          is_dead: false,
          damage: {
            total: { comment: '总计', value: Number(cur.damage) },
            attack: { comment: '通常攻击&反击', value: Number(cur.normal_damage) },
            ability: { comment: '技能伤害', value: Number(cur.ability_damage) },
            special: { comment: '奥义伤害', value: Number(cur.special_damage) },
            other: { comment: '其他', value: Number(cur.other_damage) },
          },
          damageTaken: {
            total: { comment: '总计', value: 0 },
            attack: { comment: '通常攻击&反击', value: 0 },
            super: { comment: '特动', value: 0 },
            other: { comment: '其他', value: 0 },
          },
          condition: {
            buff: [],
            coating_value: 0,
          },
        })
        return pre
      }, [])
      if (!hit) {
        battleRecord.value.unshift({
          quest_id: '',
          raid_id,
          raid_name: raidName,
          turn: Number(turn),
          endTimestamp,
          startTimer: 0,
          endTimer: 0,
          formation: [0, 1, 2, 3],
          player,
          actionQueue: [],
          hasResult: true,
          damage,
          duration: time,
          treasureList,
          reserve: false,
          abilityList: [],
        })
        battleRecord.value.sort((a, b) => Number(b.raid_id) - Number(a.raid_id))

        if (battleRecord.value.length > 30) {
          const lastIndex = battleRecord.value.findLastIndex(record => !record.reserve)
          battleRecord.value.splice(lastIndex, 1)
        }
      }
      else {
        hit.endTimestamp = endTimestamp
        hit.player[0].image_id = player[0].image_id
        hit.hasResult = true
        hit.damage = damage
        hit.duration = time
        hit.treasureList = treasureList
      }
    }
  }
}
