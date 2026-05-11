<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { NButton, NButtonGroup, NIcon, NProgress, NSpace, NSelect, NTag } from 'naive-ui'
import { WeatherMoon16Regular, Circle16Regular } from '@vicons/fluent'
import {
  deployed,
  loading,
  flypyModelStatus,
  schemaId,
  ime,
  selectOptions,
  showVariant,
  variants,
  variant,
  isEnglish,
  isFullWidth,
  isExtendedCharset,
  isEnglishPunctuation,
  enableEmoji,
  schemaExtended,
  changeLanguage,
  changeVariant,
  changeWidth,
  changeCharset,
  changePunctuation,
  changeEmoji,
  selectIME
} from '../control'
import { getTextarea } from '../util'

const variantLabel = computed(() => showVariant.value && !deployed.value ? variant.value.name : '')
const singleVariant = computed(() => !deployed.value && variants.value.length === 1)

watchEffect(() => {
  if (ime.value) {
    localStorage.setItem('schemaId', ime.value)
  }
  if (variantLabel.value) {
    localStorage.setItem('variantName', variantLabel.value)
  }
})

async function switchVariant () {
  showVariant.value = false
  await changeVariant()
  showVariant.value = true
}

const extendedDisabled = computed(() => ime.value !== schemaId.value || !schemaExtended.includes(ime.value))
const showFlypyModelStatus = computed(() => schemaId.value === 'flypy_xhfast' && flypyModelStatus.value.visible)
const flypyModelType = computed<'success' | 'info' | 'error'>(() => {
  if (flypyModelStatus.value.state === 'error') {
    return 'error'
  }
  return flypyModelStatus.value.model === 'large' ? 'success' : 'info'
})
const flypyModelLabel = computed(() => {
  const status = flypyModelStatus.value
  if (status.model === 'large') {
    return '模型：万象 LTS'
  }
  if (status.state === 'downloading') {
    return status.detail ? `模型：小模型，下载 ${status.detail}` : '模型：小模型，下载中'
  }
  if (status.state === 'cached') {
    return '模型：小模型，万象 LTS 已缓存'
  }
  if (status.state === 'ready') {
    return `模型：小模型，${status.detail || '万象 LTS 已就绪'}`
  }
  if (status.state === 'checking') {
    return `模型：小模型，${status.detail || '检查万象 LTS'}`
  }
  if (status.state === 'switching') {
    return `模型：小模型，${status.detail || '切换中'}`
  }
  if (status.state === 'error') {
    return `模型：小模型，${status.detail || '万象 LTS 加载失败'}`
  }
  return '模型：小模型'
})
const flypyModelProgress = computed(() => {
  const { loaded, total } = flypyModelStatus.value
  if (!loaded || !total) {
    return 0
  }
  return Math.min(100, Math.round(loaded / total * 100))
})

function resetFocus () {
  getTextarea().focus()
}

function onSelectIME (value: string) {
  resetFocus()
  selectIME(value)
}
</script>

<template>
  <n-space>
    <n-select
      style="width: 160px"
      :value="ime"
      :options="selectOptions"
      :loading="loading"
      @update:value="onSelectIME"
    />
    <n-button-group
      class="square-group"
      @click="resetFocus"
    >
      <n-button
        secondary
        title="中英文切换"
        @click="changeLanguage"
      >
        {{ isEnglish ? '英' : '中' }}
      </n-button>
      <n-button
        secondary
        :disabled="isEnglish || singleVariant || deployed"
        title="简繁或变体切换"
        @click="switchVariant"
      >
        {{ variantLabel }}
      </n-button>
      <n-button
        secondary
        title="全角/半角切换"
        @click="changeWidth"
      >
        <template #icon>
          <n-icon :component="isFullWidth ? Circle16Regular : WeatherMoon16Regular" />
        </template>
      </n-button>
      <n-button
        secondary
        :disabled="extendedDisabled"
        title="字符集切换"
        @click="changeCharset"
      >
        {{ extendedDisabled ? '' : isExtendedCharset ? '增' : '常' }}
      </n-button>
      <n-button
        secondary
        :disabled="isEnglish"
        title="中英文标点切换"
        @click="changePunctuation"
      >
        {{ isEnglishPunctuation ? '.' : '。' }}
      </n-button>
      <n-button
        secondary
        title="表情候选开关"
        @click="changeEmoji"
      >
        {{ enableEmoji ? '😀' : '🚫' }}
      </n-button>
    </n-button-group>
    <n-space
      v-if="showFlypyModelStatus"
      class="flypy-model-status"
      align="center"
      :size="8"
    >
      <n-tag
        size="small"
        :type="flypyModelType"
      >
        {{ flypyModelLabel }}
      </n-tag>
      <n-progress
        v-if="flypyModelStatus.state === 'downloading' && flypyModelProgress > 0"
        type="line"
        :percentage="flypyModelProgress"
        :show-indicator="false"
        style="width: 90px"
      />
    </n-space>
  </n-space>
</template>
