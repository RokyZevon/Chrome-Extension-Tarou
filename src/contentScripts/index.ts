import { onMessage, sendMessage } from 'webext-bridge/content-script'

(() => {
  // 获取副本名称
  onMessage('getRaidName', () => {
    return new Promise((resolve) => {
      const start = setInterval(() => {
        if (!/\/#raid(?:_multi)?\/\d+/.test(document.URL)) {
          console.log('战斗开始检测中断', document.URL)
          clearInterval(start)
          resolve({})
        }

        console.log('监测到战斗开始')
        const targetEl = document.querySelector('.enemy-info .name')
        if (targetEl && targetEl.innerHTML) {
          clearInterval(start)
          resolve({ questName: targetEl.innerHTML })
        }
      }, 200)
    })
  })

  // 获取掉落数据
  onMessage('getBattleResult', () => {
    return new Promise((resolve) => {
      const start = setInterval(() => {
        if (!/\/#result(?:_multi)?\/\d+/.test(document.URL)) {
          console.log('战斗结算检测中断', document.URL)
          clearInterval(start)
          resolve({})
        }

        console.log('监测到结算')
        const targetEl = document.querySelector('.prt-item-list')

        if (targetEl) {
          clearInterval(start)
          resolve({ domStr: targetEl.outerHTML })
        }
      }, 200)
    })
  })

  // 获取历史战斗掉落数据
  onMessage('getBattleHistoryResult', () => {
    return new Promise((resolve) => {
      const start = setInterval(() => {
        if (!document.URL.includes('#result_multi/detail')) {
          console.log('历史战斗结算检测中断', document.URL)
          clearInterval(start)
          resolve({})
        }

        console.log('监测到历史结算')
        const targetEl = document.querySelector('.prt-result-detail')

        if (targetEl) {
          clearInterval(start)
          resolve({ domStr: targetEl.outerHTML })
        }
      }, 200)
    })
  })

  // 获取未结算战斗数据
  onMessage('getUnclaimedList', () => {
    return new Promise((resolve) => {
      const start = setInterval(() => {
        if (!document.URL.includes('#quest/assist/unclaimed')) {
          console.log('未结算战斗检测中断', document.URL)
          clearInterval(start)
          resolve({})
        }

        console.log('监测到未结算战斗页面')
        const targetEl = document.querySelector('#prt-unclaimed-list')

        if (targetEl) {
          clearInterval(start)
          resolve({ domStr: targetEl.outerHTML })
        }
      }, 200)
    })
  })

  // 获取友招信息
  onMessage('getSupportSummon', () => {
    return new Promise((resolve) => {
      const start = setInterval(() => {
        if (!document.URL.includes('#profile')) {
          console.log('主页检测中断', document.URL)
          clearInterval(start)
          resolve({})
        }

        console.log('监测到主页')
        const targetEl = document.querySelector('.cnt-profile')

        if (targetEl) {
          clearInterval(start)
          resolve({ domStr: targetEl.outerHTML })
        }
      }, 200)
    })
  })

  // 获取角色信息
  onMessage('getNpczenith', () => {
    return new Promise((resolve) => {
      const start = setInterval(() => {
        if (!document.URL.includes('#zenith')) {
          console.log('角色检测中断', document.URL)
          clearInterval(start)
          resolve({})
        }

        console.log('监测到角色详情')
        const targetEl = document.querySelector('div.cnt-zenith.npc')

        if (targetEl) {
          clearInterval(start)
          resolve({ domStr: targetEl.outerHTML })
        }
      }, 200)
    })
  })

  function injectScript() {
    const script = document.createElement('script')
    script.async = true
    const params = new URLSearchParams({
      extensionId: chrome.runtime.id,
    })
    script.src = chrome.runtime.getURL(`inject.js?${params}`)
    const doc = document.head || document.documentElement
    doc.appendChild(script)
    document.addEventListener(chrome.runtime.id, async (e) => {
      sendMessage('express', (e as CustomEvent).detail, 'background')
    })
  }

  injectScript()
})()
