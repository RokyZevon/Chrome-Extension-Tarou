<script setup lang="ts">
import type { Deck } from 'party'
import { cloneDeep } from 'lodash-es'
import Summon from './Summon.vue'
import Weapon from './Weapon.vue'

interface Result {
  iconImg: string
  diff: -1 | 0 | 1
  value1: {
    str: string
    value: number
    isMax: boolean
  }
  value2: {
    str: string
    value: number
    isMax: boolean
  }
}

const props = defineProps<{ lastDeck?: Deck }>()

const deck1 = ref<Deck>()
const deck2 = ref<Deck>()
const isLock = ref(false)
const regex = /-?\d+(\.\d+)?/g

watch(() => props.lastDeck, (data) => {
  if (isLock.value)
    deck2.value = data
  else
    deck1.value = data
}, { immediate: true })

function toggleLock() {
  if (!isLock.value) {
    if (!deck1.value) {
      ElMessage.warning('请先设定队伍1')
    }
    else {
      deck1.value = cloneDeep(deck1.value)
      isLock.value = !isLock.value
    }
  }
  else {
    deck2.value = cloneDeep(deck2.value)
    isLock.value = !isLock.value
  }
}

const compareResult = computed<Result[]>(() => {
  if (!deck1.value || !deck2.value)
    return []
  const list: Result[] = deck1.value.effects.map(v => ({
    iconImg: v.iconImg,
    value1: {
      str: v.value,
      value: Number(String(v.value).match(regex)![0]),
      isMax: v.isMax,
    },
    value2: {
      str: String(v.value).replace(regex, '0'),
      value: 0,
      isMax: false,
    },
    diff: 0,
  }))
  deck2.value.effects.forEach((v) => {
    const hit = list.find(item => item.iconImg === v.iconImg)
    if (hit) {
      hit.value2 = {
        str: v.value,
        value: Number(String(v.value).match(regex)![0]),
        isMax: v.isMax,
      }
    }
    else {
      list.push({
        iconImg: v.iconImg,
        value1: {
          str: String(v.value).replace(regex, '0'),
          value: 0,
          isMax: false,
        },
        value2: {
          str: v.value,
          value: Number(String(v.value).match(regex)![0]),
          isMax: v.isMax,
        },
        diff: 0,
      })
    }
  })

  return list.map(item => ({ ...item, diff: item.value1.value < item.value2.value ? 1 : item.value1.value > item.value2.value ? -1 : 0 }))
})

function dataSort(data: Result[]) {
  return data.sort((a, b) => {
    const diffOrder = { '1': 0, '-1': 1, '0': 2 }
    if (diffOrder[a.diff] < diffOrder[b.diff])
      return -1
    if (diffOrder[a.diff] > diffOrder[b.diff])
      return 1

    const aIconPrefix = Number.parseInt(a.iconImg.substring(0, 2))
    const bIconPrefix = Number.parseInt(b.iconImg.substring(0, 2))

    return aIconPrefix - bIconPrefix
  })
}

const showDamage = computed(() => {
  if (!deck1.value || !deck2.value)
    return
  const assumed_normal_damage_diff = deck1.value.leader.normalDamage - deck2.value.leader.normalDamage
  const assumed_advantage_damage_diff = deck1.value.leader.advantageDamage - deck2.value.leader.advantageDamage

  return {
    assumed_normal_damage: {
      base: deck1.value.leader.normalDamage.toLocaleString(),
      diff: Math.abs(assumed_normal_damage_diff).toLocaleString(),
      mark: assumed_normal_damage_diff > 0 ? -1 : 1,
    },
    assumed_advantage_damage: {
      base: deck1.value.leader.advantageDamage.toLocaleString(),
      diff: Math.abs(assumed_advantage_damage_diff).toLocaleString(),
      mark: assumed_advantage_damage_diff > 0 ? -1 : 1,
    },
  }
})
</script>

<template>
  <div fc gap-10px>
    <div fc flex-col gap-10px>
      <ElCard>
        <div v-if="deck1" fc gap-2>
          <Weapon :weapons="deck1.weapons" />
          <Summon :summons="deck1.summons" />
        </div>
        <div v-else m-auto w-100>
          <el-alert type="info" effect="dark" show-icon center :closable="false" title="进入编成界面,读取队伍信息,设定队伍1" />
        </div>
      </ElCard>
      <div my-2 w-full>
        <div fc gap-10px>
          <div i-carbon:arrow-shift-down text-3xl icon-btn :class="{ lock: isLock }" @click="toggleLock" />
          <div v-if="showDamage" flex flex-col items-start px-2 text-lg>
            <div fc>
              <div>预测伤害：{{ showDamage.assumed_normal_damage.base }}</div>
              <div ml-2px :class="{ damage_up: showDamage.assumed_normal_damage.mark === 1, damage_down: showDamage.assumed_normal_damage.mark === -1 }">
                {{ showDamage.assumed_normal_damage.mark === 1 ? `+${showDamage.assumed_normal_damage.diff}` : `-${showDamage.assumed_normal_damage.diff}` }}
              </div>
            </div>
            <div fc>
              <div>克属伤害：{{ showDamage.assumed_advantage_damage.base }}</div>
              <div ml-2px :class="{ damage_up: showDamage.assumed_advantage_damage.mark === 1, damage_down: showDamage.assumed_advantage_damage.mark === -1 }">
                {{ showDamage.assumed_advantage_damage.mark === 1 ? `+${showDamage.assumed_advantage_damage.diff}` : `-${showDamage.assumed_advantage_damage.diff}` }}
              </div>
            </div>
          </div>
          <div i-carbon:arrow-shift-down text-3xl icon-btn :class="{ lock: isLock }" @click="toggleLock" />
        </div>
      </div>
      <ElCard>
        <div v-if="deck2" fc gap-2>
          <Weapon :weapons="deck2.weapons" />
          <Summon :summons="deck2.summons" />
        </div>
        <div v-else m-auto w-100>
          <el-alert type="info" effect="dark" show-icon center :closable="false" title="点击中间箭头锁定队伍1,切换队伍,设定队伍2" />
        </div>
      </ElCard>
    </div>
    <ElCard v-if="deck1 && deck2" w-350px>
      <ElScrollbar max-height="556px">
        <div w-306px fc flex-col gap-10px p-3px>
          <div
            v-for="effect in dataSort(compareResult)" :key="effect.iconImg"
            w-300px flex items-center justify-between text-base
            :class="{ effect_up: effect.diff === 1, effect_down: effect.diff === -1 }"
          >
            <img w-100px :src="getSkillLabelIcon(effect.iconImg)">
            <div fc>
              <div :class="{ max: effect.value1.isMax }">
                {{ effect.value1.str }}
              </div>
              <div i-carbon:direction-straight-right mx-5px />
              <div :class="{ max: effect.value2.isMax }">
                {{ effect.value2.str }}
              </div>
            </div>
          </div>
        </div>
      </ElScrollbar>
    </ElCard>
  </div>
</template>

<style scoped>
.lock{
    color: rgb(251 191 36);
}
.max{
  color: #ffa826;
}
.effect_up {
  box-shadow: 0 0 3px 3px #059669;
}
.effect_down {
  box-shadow: 0 0 3px 3px #dc2626;
}

.damage_up{
  color:#059669;
}
.damage_down{
  color:#dc2626;
}
</style>
