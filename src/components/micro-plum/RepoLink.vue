<script setup lang="ts">
import { NText, NA } from 'naive-ui'

defineProps<{
  repo: string
  license?: string
}>()

function repo2gh (repo: string) {
  return `https://github.com/${repo}`
}
</script>

<template>
  <n-a
    :href="repo2gh(repo)"
    target="_blank"
    style="text-decoration: none"
  >
    <n-text
      :type="license ? 'success' : 'warning'"
      :title="license ? '自由软件' : '专有软件'"
    >
      {{ repo }}
    </n-text>
  </n-a>
</template>
