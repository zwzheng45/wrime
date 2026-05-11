<script setup lang="ts">
import {
  NConfigProvider,
  NNotificationProvider,
  NDialogProvider,
  NMessageProvider,
  NH1,
  NA,
  NText,
  darkTheme,
  useOsTheme,
  zhCN,
  dateZhCN
} from 'naive-ui'
import { MyLayout } from '@libreservice/my-widget'
import MyPwa from './components/MyPwa.vue'
import { homepage } from '../package.json'

const osThemeRef = useOsTheme()
const appName = 'wRIME'
const appTitle = 'wRIME - 基于 RIME 的在线中文输入法'
const upstreamRepository = 'https://github.com/LibreService/my_rime'
const commit = '__COMMIT__'
const buildDate = '__BUILD_DATE__'
const shortCommit = commit.slice(0, 7)
</script>

<template>
  <my-pwa />
  <n-config-provider
    :theme="osThemeRef === 'dark' ? darkTheme : null"
    :locale="zhCN"
    :date-locale="dateZhCN"
  >
    <my-layout>
      <template #header>
        <header class="app-header">
          <n-a
            class="app-brand"
            :href="homepage"
            target="_blank"
            >
            <img
              src="/logo.svg"
              alt="wRIME"
            >
            <span>{{ appName }}</span>
          </n-a>
        </header>
      </template>
      <template #content>
        <div style="cursor: pointer; text-align: center; margin-top: 16px">
          <n-h1>{{ appTitle }}</n-h1>
        </div>
        <n-notification-provider :max="1">
          <n-dialog-provider>
            <n-message-provider>
              <router-view v-slot="{ Component }">
                <keep-alive>
                  <component :is="Component" />
                </keep-alive>
              </router-view>
            </n-message-provider>
          </n-dialog-provider>
        </n-notification-provider>
      </template>
      <template #footer>
        <footer class="app-footer">
          <div>
            <n-text>© 2026 ZZW. 小鹤音形集成，本站搭建与维护</n-text>
          </div>
          <div>
            <n-a
              :href="upstreamRepository"
              target="_blank"
            >
              © 2022-2024 Qijia Liu and contributors
            </n-a>
          </div>
          <div>
            <n-text depth="3">
              构建时间：{{ buildDate }} · 提交：
              <n-a
                :href="`${homepage}/commit/${commit}`"
                target="_blank"
              >
                {{ shortCommit }}
              </n-a>
            </n-text>
          </div>
        </footer>
      </template>
    </my-layout>
  </n-config-provider>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 12px 20px;
}

.app-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: inherit;
  font-size: 20px;
  font-weight: 700;
  text-decoration: none;
}

.app-brand img {
  width: 28px;
  height: 28px;
}

.app-footer {
  padding: 16px 20px 24px;
  text-align: center;
  line-height: 1.8;
}
</style>
