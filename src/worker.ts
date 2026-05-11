import { expose, control, loadWasm, fsOperate } from '@libreservice/my-worker'
import { CONTENT, HASH, LazyCache } from '@libreservice/lazy-cache'
import schemaName from '../schema-name.json'
import schemaFiles from '../schema-files.json'
import schemaTarget from '../schema-target.json'
import schemaResources from '../schema-resources.json'
import dependencyMap from '../dependency-map.json'
import targetFiles from '../target-files.json'
import targetVersion from '../target-version.json'

const RIME_USER = '/rime'
const RIME_SHARED = '/usr/share/rime-data'
const FLYPY_XHFAST = 'flypy_xhfast'
const FLYPY_XHFAST_LTS = 'flypy_xhfast_lts'
const FLYPY_XHFAST_LTS_READY = `${RIME_USER}/flypy_xhfast_lts.ready`
const FLYPY_LARGE_MODEL = 'wanxiang-lts-zh-hans.gram'
const RIME_CDN: string = '__RIME_CDN__'

function getURL (target: string, name: string) {
  if (RIME_CDN) {
    return RIME_CDN + `${target}@${(targetVersion as {[key: string]: string})[target]}/${name}`
  }
  return `ime/${target}/${name}`
}

const lazyCache = new LazyCache('ime')

type TargetFile = {
  name: string
  md5: string
  target: string
  path?: string
}

type DownloadProgress = {
  name: string
  loaded: number
  total?: number
  cached: boolean
}

type FetchPrebuiltOptions = {
  trackResource?: string
  onProgress?: (progress: DownloadProgress) => void
}

async function getWithProgress (
  name: string,
  md5: string,
  url: string,
  onProgress: (progress: DownloadProgress) => void
): Promise<ArrayBuffer> {
  const db = await lazyCache.getDB()
  const storedHash: string | undefined = await db?.get(HASH, name)
  if (storedHash === md5) {
    const buffer = await db!.get(CONTENT, name) as ArrayBuffer
    onProgress({ name, loaded: buffer.byteLength, total: buffer.byteLength, cached: true })
    return buffer
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Fail to download ${name}`)
  }

  const totalHeader = response.headers.get('content-length')
  const total = totalHeader ? Number(totalHeader) : undefined
  const reader = response.body?.getReader()
  if (!reader) {
    const buffer = await response.arrayBuffer()
    onProgress({ name, loaded: buffer.byteLength, total: total || buffer.byteLength, cached: false })
    try {
      await db?.put(CONTENT, buffer, name)
      await db?.put(HASH, md5, name)
    } catch (error) {
      console.warn(`Failed to cache ${name}; continuing with the downloaded copy.`, error)
    }
    return buffer
  }

  const chunks: Uint8Array[] = []
  let loaded = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    if (!value) {
      continue
    }
    chunks.push(value)
    loaded += value.byteLength
    onProgress({ name, loaded, total, cached: false })
  }

  const bytes = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const buffer = bytes.buffer
  try {
    await db?.put(CONTENT, buffer, name)
    await db?.put(HASH, md5, name)
  } catch (error) {
    console.warn(`Failed to cache ${name}; continuing with the downloaded copy.`, error)
  }
  return buffer
}

async function fetchPrebuilt (schemaId: string, options: FetchPrebuiltOptions = {}) {
  const fetched: string[] = []
  function getFiles (key: string) {
    if (fetched.includes(key)) {
      return []
    }
    fetched.push(key)
    const files: TargetFile[] = []

    for (const dependency of (dependencyMap as {[key: string]: string[] | undefined})[key] || []) {
      files.push(...getFiles(dependency))
    }
    const { dict, prism } = (schemaFiles as {[key: string]: { dict?: string, prism?: string }})[key]
    const dictionary = dict || key
    const tableBin = `${dictionary}.table.bin`
    const reverseBin = `${dictionary}.reverse.bin`
    const prismBin = `${prism || dictionary}.prism.bin`
    const schemaYaml = `${key}.schema.yaml`
    const target = (schemaTarget as {[key: string]: string})[key]
    for (const fileName of [tableBin, reverseBin, prismBin, schemaYaml]) {
      for (const { name, md5, path } of (targetFiles as { [key: string]: { name: string, md5: string, path?: string }[]})[target]) {
        if (fileName === name) {
          files.push({ name, md5, target, path })
          break
        }
      }
    }
    for (const resource of (schemaResources as {[key: string]: { name: string, path?: string }[] | undefined})[key] || []) {
      for (const { name, md5, path } of (targetFiles as { [key: string]: { name: string, md5: string, path?: string }[]})[target]) {
        if (resource.name === name) {
          files.push({ name, md5, target, path })
          break
        }
      }
    }
    return files
  }
  const files = getFiles(schemaId)
  await Promise.all(files.map(async ({ name, target, md5, path: runtimePath }) => {
    const path = runtimePath ? `${RIME_SHARED}/${runtimePath}` : `${RIME_SHARED}/build/${name}`
    try {
      Module.FS.lookupPath(path)
    } catch (e) { // not exists
      const url = getURL(target, name)
      const ab = name === options.trackResource && options.onProgress
        ? await getWithProgress(name, md5, url, options.onProgress)
        : await lazyCache.get(name, md5, url)
      const content = new Uint8Array(ab)
      writeRuntimeFile(path, content)
      if (name.endsWith('.gram')) {
        writeRuntimeFile(`${RIME_SHARED}/build/${name}`, content)
      }
    }
  }))
}

function ensureFSDirectory (path: string) {
  const parts = path.slice(1, path.lastIndexOf('/')).split('/')
  let current = ''
  for (const part of parts) {
    current += `/${part}`
    try {
      Module.FS.lookupPath(current)
    } catch {
      Module.FS.mkdir(current)
    }
  }
}

function writeRuntimeFile (path: string, content: Uint8Array) {
  ensureFSDirectory(path)
  Module.FS.writeFile(path, content)
}

const globalOptionState: {[key: string]: boolean} = {}
const schemaOptionState: {[schemaId: string]: {[key: string]: boolean}} = {}
const GLOBAL_OPTIONS = new Set([
  'ascii_mode',
  'full_shape',
  'extended_charset',
  'ascii_punct',
  'emoji_suggestion'
])
let activeSchemaId = ''
let hasComposition = false
let flypyUpgradePromise: Promise<void> | undefined
let flypyUpgradeReady = false
let switchingToFlypyLts = false
let flypyLastProgress: DownloadProgress | undefined

const flypyModelStatus = control('flypyModelStatus')

function getVisibleSchemaId (schemaId = activeSchemaId) {
  return schemaId === FLYPY_XHFAST_LTS ? FLYPY_XHFAST : schemaId
}

function getScopedOptionState (schemaId = activeSchemaId) {
  const visibleSchemaId = getVisibleSchemaId(schemaId)
  schemaOptionState[visibleSchemaId] ||= {}
  return schemaOptionState[visibleSchemaId]
}

function emitFlypyModelStatus (status: FLYPY_MODEL_STATUS) {
  flypyModelStatus(status)
}

function emitFlypyHiddenStatus () {
  emitFlypyModelStatus({
    visible: false,
    model: 'none',
    state: 'idle'
  })
}

function formatBytes (bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function emitFlypyDownloadStatus (progress: DownloadProgress) {
  flypyLastProgress = progress
  const detail = progress.total
    ? `${formatBytes(progress.loaded)} / ${formatBytes(progress.total)}`
    : formatBytes(progress.loaded)
  emitFlypyModelStatus({
    visible: true,
    model: 'small',
    state: progress.cached ? 'cached' : 'downloading',
    loaded: progress.loaded,
    total: progress.total,
    cached: progress.cached,
    detail
  })
}

function hasFlypyLtsReadyMarker () {
  try {
    Module.FS.lookupPath(FLYPY_XHFAST_LTS_READY)
    return true
  } catch {
    return false
  }
}

async function markFlypyLtsReady () {
  Module.FS.writeFile(FLYPY_XHFAST_LTS_READY, new Uint8Array([1]))
  await syncUserDirectory('write')
}

async function clearFlypyLtsReady () {
  try {
    Module.FS.unlink(FLYPY_XHFAST_LTS_READY)
    await syncUserDirectory('write')
  } catch {}
}

function replayOptions () {
  for (const [option, value] of Object.entries(globalOptionState)) {
    Module.ccall('set_option', 'null', ['string', 'number'], [option, value])
  }
  for (const [option, value] of Object.entries(getScopedOptionState())) {
    Module.ccall('set_option', 'null', ['string', 'number'], [option, value])
  }
}

async function selectSchema (schemaId: string) {
  Module.ccall('set_ime', 'null', ['string'], [schemaId])
  activeSchemaId = schemaId
  replayOptions()
  return syncUserDirectory('write')
}

async function trySwitchToFlypyLts () {
  if (!flypyUpgradeReady ||
    switchingToFlypyLts ||
    activeSchemaId !== FLYPY_XHFAST) {
    return
  }
  if (hasComposition) {
    emitFlypyModelStatus({
      visible: true,
      model: 'small',
      state: 'ready',
      loaded: flypyLastProgress?.loaded,
      total: flypyLastProgress?.total,
      detail: '万象 LTS 已就绪，等待输入空闲'
    })
    return
  }
  switchingToFlypyLts = true
  try {
    emitFlypyModelStatus({
      visible: true,
      model: 'small',
      state: 'switching',
      detail: '切换到万象 LTS'
    })
    await selectSchema(FLYPY_XHFAST_LTS)
    emitFlypyModelStatus({
      visible: true,
      model: 'large',
      state: 'active',
      loaded: flypyLastProgress?.loaded,
      total: flypyLastProgress?.total,
      detail: '万象 LTS'
    })
  } finally {
    switchingToFlypyLts = false
  }
}

function startFlypyUpgrade () {
  if (flypyUpgradePromise) {
    flypyUpgradePromise.then(trySwitchToFlypyLts)
    return
  }
  emitFlypyModelStatus({
    visible: true,
    model: 'small',
    state: 'checking',
    detail: '准备万象 LTS'
  })
  flypyUpgradePromise = fetchPrebuilt(FLYPY_XHFAST_LTS, {
    trackResource: FLYPY_LARGE_MODEL,
    onProgress: emitFlypyDownloadStatus
  })
    .then(async () => {
      flypyUpgradeReady = true
      await markFlypyLtsReady()
      emitFlypyModelStatus({
        visible: true,
        model: 'small',
        state: 'ready',
        loaded: flypyLastProgress?.loaded,
        total: flypyLastProgress?.total,
        cached: flypyLastProgress?.cached,
        detail: '万象 LTS 已就绪'
      })
    })
    .then(trySwitchToFlypyLts)
    .catch(error => {
      flypyUpgradePromise = undefined
      emitFlypyModelStatus({
        visible: true,
        model: 'small',
        state: 'error',
        detail: '万象 LTS 加载失败'
      })
      console.warn('Failed to load flypy large grammar model.', error)
    })
}

async function setIME (schemaId: string) {
  hasComposition = false
  if (schemaId !== FLYPY_XHFAST) {
    emitFlypyHiddenStatus()
  }
  if (!deployed && schemaId === FLYPY_XHFAST && hasFlypyLtsReadyMarker()) {
    try {
      emitFlypyModelStatus({
        visible: true,
        model: 'small',
        state: 'checking',
        detail: '检查万象 LTS 缓存'
      })
      await fetchPrebuilt(FLYPY_XHFAST_LTS, {
        trackResource: FLYPY_LARGE_MODEL,
        onProgress: emitFlypyDownloadStatus
      })
      flypyUpgradeReady = true
      await selectSchema(FLYPY_XHFAST_LTS)
      emitFlypyModelStatus({
        visible: true,
        model: 'large',
        state: 'active',
        loaded: flypyLastProgress?.loaded,
        total: flypyLastProgress?.total,
        cached: flypyLastProgress?.cached,
        detail: '万象 LTS'
      })
      return
    } catch (error) {
      flypyUpgradeReady = false
      await clearFlypyLtsReady()
      emitFlypyModelStatus({
        visible: true,
        model: 'small',
        state: 'error',
        detail: '万象 LTS 缓存不可用'
      })
      console.warn('Failed to load cached flypy large grammar model.', error)
    }
  }
  if (!deployed) {
    await fetchPrebuilt(schemaId)
  }
  await selectSchema(schemaId)
  if (!deployed && schemaId === FLYPY_XHFAST) {
    emitFlypyModelStatus({
      visible: true,
      model: 'small',
      state: 'active',
      detail: '小模型'
    })
    startFlypyUpgrade()
  }
}

function syncUserDirectory (direction: 'read' | 'write') {
  let resolve: (_: any) => void
  let reject: (err: any) => void
  const promise = new Promise<void>((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  Module.FS.syncfs(direction === 'read', (err: any) => {
    if (err) {
      reject(err)
    }
    resolve(null)
  })
  return promise
}

const readyPromise = loadWasm('rime.js', {
  url: '__LIBRESERVICE_CDN__',
  async init () {
    Module.FS.mkdir(RIME_USER)
    Module.FS.mount(IDBFS, {}, RIME_USER)
    await syncUserDirectory('read')
    Module.ccall('init', 'null', [], [])
    for (const [schema, name] of Object.entries(schemaName)) {
      Module.ccall('set_schema_name', 'null', ['string', 'string'], [schema, name])
    }
  },
  Module: {
    // Customize for glog
    printErr (message: string) {
      const match = message.match(/[EWID]\S+ \S+ \S+ (.*)/)
      if (match) {
        ({
          E: console.error,
          W: console.warn,
          I: console.info,
          D: console.debug
        })[message[0] as 'E' | 'W' | 'I' | 'D'](match[1])
      } else {
        console.error(message)
      }
    }
  }
})

let deployed = false
const deployStatus = control('deployStatus')
// @ts-ignore
globalThis._deployStatus = (status: 'start' | 'failure' | 'success', schemas: string) => { // called from api.cpp
  if (status === 'success') {
    deployed = true
  }
  deployStatus(status, schemas)
}

function rmStar (path: string) {
  for (const file of Module.FS.readdir(path)) {
    if (file === '.' || file === '..') {
      continue
    }
    const subPath = `${path}/${file}`
    const { mode } = Module.FS.lstat(subPath)
    if (Module.FS.isDir(mode)) {
      rmStar(subPath)
      Module.FS.rmdir(subPath)
    } else {
      Module.FS.unlink(subPath)
    }
  }
}

async function resetUserDirectory () {
  rmStar(RIME_USER)
  await syncUserDirectory('write')
  deployed = false
  activeSchemaId = ''
  hasComposition = false
  flypyUpgradePromise = undefined
  flypyUpgradeReady = false
  flypyLastProgress = undefined
  emitFlypyHiddenStatus()
  Module.ccall('reset', 'null', [], [])
}

expose({
  fsOperate,
  resetUserDirectory,
  setIME,
  setOption (option: string, value: boolean): void {
    if (GLOBAL_OPTIONS.has(option)) {
      globalOptionState[option] = value
    } else {
      getScopedOptionState()[option] = value
    }
    return Module.ccall('set_option', 'null', ['string', 'number'], [option, value])
  },
  setPageSize (size: number) {
    return Module.ccall('set_page_size', 'null', ['number'], [size])
  },
  deploy (): void {
    return Module.ccall('deploy', 'null', [], [])
  },
  async process (input: string): Promise<RIME_RESULT> {
    const result = JSON.parse(Module.ccall('process', 'string', ['string'], [input]))
    hasComposition = result.state === 1
    if ('committed' in result) {
      await syncUserDirectory('write') // record frequency
    }
    await trySwitchToFlypyLts()
    return result
  },
  async selectCandidateOnCurrentPage (index: number): Promise<string> {
    const result = Module.ccall('select_candidate_on_current_page', 'string', ['number'], [index])
    hasComposition = JSON.parse(result).state === 1
    await trySwitchToFlypyLts()
    return result
  },
  async changePage (backward: boolean): Promise<string> {
    const result = Module.ccall('change_page', 'string', ['boolean'], [backward])
    hasComposition = JSON.parse(result).state === 1
    await trySwitchToFlypyLts()
    return result
  }
}, readyPromise)
