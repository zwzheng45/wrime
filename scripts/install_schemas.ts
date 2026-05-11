import { platform } from 'os'
import { spawnSync } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, cpSync, rmSync, statSync, existsSync } from 'fs'
import { cwd, chdir, exit } from 'process'
import yaml from 'js-yaml'
import {
  Recipe,
  getBinaryNames,
  GitHubDownloader
} from '@libreservice/micro-plum'
import { rf, utf8, ensure, md5sum } from './util.js'
import packageJson from '../package.json' assert { type: 'json' }
import schemas from '../schemas.json' assert { type: 'json' }

const root = cwd()
const { version } = packageJson
const RIME_DIR = 'build/librime_native/bin'
const defaultPath = `${RIME_DIR}/default.yaml`

// output files
const schemaName: { [key: string]: string } = {} // maps schema to names
const schemaFiles: { [key: string]: { dict?: string, prism?: string } } = {} // maps schema to dict and prism
const schemaTarget: { [key: string]: string } = {} // maps schema to target
type TargetFile = { name: string, md5: string, path?: string }
type SchemaResource = { name: string, path?: string }

const targetFiles: { [key: string]: TargetFile[] } = {} // maps target to files with hash
const targetVersion: { [key: string]: string } = {} // maps target to npm package version
const dependencyMap: { [key: string]: string[] } = {} // maps schema to dependent schemas
const schemaResources: { [key: string]: SchemaResource[] } = {} // maps schema to runtime resources

// temp data structures
const targetManifest: { [key: string]: string[] } = {} // maps target to files downloaded from it
const targetLicense: { [key: string]: string } = {}
const ids = []
const disabledIds: string[] = []
const buildIds: string[] = []
const flypyDeployIds = new Set([
  'flypy_xhfast',
  'flypy_xhfast_lts',
  'melt_eng',
  'easy_en',
  'flypy_radical',
  'flypy_phrase'
])
const flypyGrammarIds = new Set(['flypy_xhfast', 'flypy_xhfast_lts'])

async function install (recipe: Recipe, target?: string) {
  const manifest = await recipe.load()
  for (const { file, content } of manifest) {
    if (content) {
      const path = `${RIME_DIR}/${file}`
      mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true })
      writeFileSync(path, content)
      if (target && !targetManifest[target].includes(file)) {
        targetManifest[target].push(file)
      }
      console.log(`Installed ${file}`)
    }
  }
}

function installLocalTarget (target: string) {
  const sourceDir = getLocalSourceDir(target)
  function walk (dir: string, prefix = '') {
    for (const name of readdirSync(dir)) {
      if (name === '.DS_Store') {
        continue
      }
      const src = `${dir}/${name}`
      const file = prefix ? `${prefix}/${name}` : name
      if (statSync(src).isDirectory()) {
        walk(src, file)
        continue
      }
      if (!file.endsWith('.gram')) {
        const dest = `${RIME_DIR}/${file}`
        mkdirSync(dest.slice(0, dest.lastIndexOf('/')), { recursive: true })
        copyFileSync(src, dest)
      }
      if (!targetManifest[target].includes(file)) {
        targetManifest[target].push(file)
      }
      console.log(`Installed ${file}`)
    }
  }
  walk(sourceDir)
}

function parseYaml (schemaId: string) {
  const schemaPath = `${RIME_DIR}/build/${schemaId}.schema.yaml`
  if (!existsSync(schemaPath)) {
    return
  }
  const content = yaml.load(readFileSync(schemaPath, utf8)) as { [key: string]: any }
  schemaFiles[schemaId] = {}
  const { dict, prism } = getBinaryNames(content)
  // By default, dictionary equals to schemaId, and prism equals to dictionary (not schemaId, see luna_pinyin_fluency)
  if (dict !== schemaId) {
    schemaFiles[schemaId].dict = dict
  }
  if (prism !== dict) {
    schemaFiles[schemaId].prism = prism
  }
}

function getPackageDir (target: string) {
  return `public/ime/${target}`
}

function getLocalSourceDir (target: string) {
  return `local-schemas/${target.slice('local/'.length)}`
}

function readJson (path: string, defaultValue: any) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch (e) {
    return defaultValue
  }
}

function initTarget (target: string, license: string) {
  if (!(target in targetManifest)) {
    targetManifest[target] = []
    targetFiles[target] = []
    targetLicense[target] = license
  }
}

function stripGrammarFromSchema (schemaId: string) {
  if (flypyGrammarIds.has(schemaId)) {
    return
  }
  const path = `${RIME_DIR}/${schemaId}.schema.yaml`
  if (!existsSync(path)) {
    return
  }
  const content = yaml.load(readFileSync(path, utf8)) as { [key: string]: any }
  let changed = false

  for (const key of Object.keys(content)) {
    if (key === 'grammar' || key.startsWith('grammar/')) {
      delete content[key]
      changed = true
    }
  }

  const translator = content.translator
  if (translator && typeof translator === 'object') {
    for (const key of ['contextual_suggestions', 'max_homophones']) {
      if (key in translator) {
        delete translator[key]
        changed = true
      }
    }
  }
  for (const key of ['translator/contextual_suggestions', 'translator/max_homophones']) {
    if (key in content) {
      delete content[key]
      changed = true
    }
  }

  if (changed) {
    writeFileSync(path, yaml.dump(content, { lineWidth: -1 }))
  }
}

function bumpVersion (oldVersion: string | undefined) {
  if (!oldVersion) {
    return version
  }
  const [major, minor, patch] = oldVersion.split('.')
  return [major, minor, Number(patch) + 1].join('.')
}

// Main

for (const fileName of ['rime.lua', 'lua', 'opencc']) {
  rmSync(`${RIME_DIR}/${fileName}`, rf)
}

mkdirSync(`${RIME_DIR}/opencc`, { recursive: true })
for (const fileName of readdirSync('rime-config')) {
  cpSync(`rime-config/${fileName}`, `${RIME_DIR}/${fileName}`, { recursive: true })
}
await Promise.all(['prelude', 'essay', 'emoji'].map(target => install(new Recipe(new GitHubDownloader(target)))))

// remove emoji_category as I don't want to visit a zoo when I type 东吴
const emojiJson = `${RIME_DIR}/opencc/emoji.json`
const emojiCategory = `${RIME_DIR}/opencc/emoji_category.txt`
const emojiContent = JSON.parse(readFileSync(emojiJson, utf8))
const emojiDict = emojiContent.conversion_chain[0].dict
emojiDict.dicts = emojiDict.dicts.filter(({ file }: { file: string }) => file !== 'emoji_category.txt')
writeFileSync(emojiJson, JSON.stringify(emojiContent))
rmSync(emojiCategory, rf)

for (const schema of schemas) {
  const local = schema.target.startsWith('local/')
  const recipe = local ? undefined : new Recipe(new GitHubDownloader(schema.target, [schema.id]))
  const target = local ? schema.target : recipe!.loader.repo.match(/(rime\/rime-)?(.*)/)![2]
  initTarget(target, schema.license)
  ids.push(schema.id)
  // @ts-ignore
  if (schema.disabled) {
    disabledIds.push(schema.id)
  } else {
    schemaName[schema.id] = schema.name
  }
  schemaTarget[schema.id] = target
  if ((schema as { build?: boolean }).build) {
    buildIds.push(schema.id)
  }
  const resources = (schema as { resources?: SchemaResource[] }).resources
  if (resources) {
    schemaResources[schema.id] = resources
  }
  if (schema.dependencies) {
    dependencyMap[schema.id] = schema.dependencies
  }
  if (schema.family) {
    // @ts-ignore
    for (const { id, name, disabled, build, resources } of schema.family) {
      recipe?.loader.schemaIds.push(id)
      ids.push(id)
      schemaTarget[id] = target
      if (build) {
        buildIds.push(id)
      }
      if (resources) {
        schemaResources[id] = resources
      }
      if (schema.dependencies) {
        dependencyMap[id] = schema.dependencies
      }
      if (disabled) {
        disabledIds.push(id)
      } else {
        schemaName[id] = name
      }
    }
  }
  if (local) {
    installLocalTarget(target)
  } else {
    await install(recipe!, target)
  }
  if (schema.emoji) {
    writeFileSync(`${RIME_DIR}/${schema.id}.custom.yaml`,
`__patch:
  - patch/+:
      __include: emoji_suggestion:/patch
`)
  }
}

// check schemas.json integrity
for (const [schemaId, dependencies] of Object.entries(dependencyMap)) {
  for (const id of dependencies) {
    if (!ids.includes(id)) {
      console.error(`Integrity check fails. Dependency '${id}' of '${schemaId}' should be defined in schemas.json.`)
      exit(1)
    }
  }
}

ids.forEach(stripGrammarFromSchema)

const defaultContent = readFileSync(defaultPath, 'utf-8')
const deployIds = ids.filter(id => !disabledIds.includes(id) || buildIds.includes(id))

function writeDefaultSchemaList (schemaIds: string[]) {
  const patch = schemaIds.map(id => `  - schema: ${id}`).join('\n') + '\n'
  const updatedContent = defaultContent.replace(/( {2}- schema: \S+\n)+/, patch)
  writeFileSync(defaultPath, updatedContent)
}

function deploySchemas (schemaIds: string[]) {
  if (!schemaIds.length) {
    return
  }
  writeDefaultSchemaList(schemaIds)
  chdir(RIME_DIR)
  ensure(spawnSync(platform() === 'win32' ? '.\\rime_api_console.exe' : './rime_api_console', [], {
    stdio: ['ignore', 'inherit', 'inherit'],
    input: ''
  }))
  chdir(root)
}

deploySchemas(deployIds.filter(id => !flypyDeployIds.has(id)))
deploySchemas(deployIds.filter(id => flypyDeployIds.has(id)))
writeDefaultSchemaList(deployIds)
copyFileSync(defaultPath, `${RIME_DIR}/build/default.yaml`)
ids.forEach(parseYaml)

for (const [target, manifest] of Object.entries(targetManifest)) {
  // find all built files that belongs to a target('s npm package)
  const fileNames = []
  const resources: SchemaResource[] = []
  const resourceNames = new Set<string>()
  const schemaPostfix = '.schema.yaml'
  for (const file of manifest) {
    if (!file.endsWith(schemaPostfix)) {
      continue
    }
    const schemaId = file.slice(0, -schemaPostfix.length)
    if (!(schemaId in schemaFiles)) {
      continue
    }
    fileNames.push(file)
    const { dict, prism } = schemaFiles[schemaId]
    const dictionary = dict || schemaId
    const dictYaml = `${dictionary}.dict.yaml`
    const tableBin = `${dictionary}.table.bin`
    const reverseBin = `${dictionary}.reverse.bin`
    const prismBin = `${prism || dictionary}.prism.bin`
    if (!fileNames.includes(tableBin) && manifest.includes(dictYaml)) {
      fileNames.push(tableBin, reverseBin)
    }
    if (!fileNames.includes(prismBin)) {
      fileNames.push(prismBin)
    }
    for (const resource of schemaResources[schemaId] || []) {
      if (!resourceNames.has(resource.name)) {
        resourceNames.add(resource.name)
        resources.push(resource)
      }
    }
  }
  fileNames.sort()
  resources.sort((a, b) => a.name.localeCompare(b.name))

  // make npm package and calculate hash
  const packageDir = getPackageDir(target)
  mkdirSync(packageDir, { recursive: true })

  for (const fileName of fileNames) {
    const fullPath = `${RIME_DIR}/build/${fileName}`
    copyFileSync(fullPath, `${packageDir}/${fileName}`)

    const md5 = md5sum(fullPath)
    targetFiles[target].push({ name: fileName, md5 })
  }
  for (const resource of resources) {
    const runtimePath = resource.path || resource.name
    let fullPath = `${RIME_DIR}/${runtimePath}`
    if (!existsSync(fullPath) && target.startsWith('local/')) {
      fullPath = `${getLocalSourceDir(target)}/${runtimePath}`
    }
    const packagePath = `${packageDir}/${resource.name}`
    mkdirSync(packagePath.slice(0, packagePath.lastIndexOf('/')), { recursive: true })
    copyFileSync(fullPath, packagePath)

    const md5 = md5sum(fullPath)
    targetFiles[target].push({ name: resource.name, md5, path: runtimePath })
  }
}

const oldTargetFiles = readJson('target-files.json', {}) as typeof targetFiles

const updatedTargets = []
for (const [target, files] of Object.entries(targetFiles)) {
  const packageDir = getPackageDir(target)
  const packageJsonPath = `${packageDir}/package.json`
  const { version: oldVersion } = readJson(packageJsonPath, {}) as { version?: string }
  let newVersion = oldVersion || version
  if (JSON.stringify(files) !== JSON.stringify(oldTargetFiles[target])) {
    updatedTargets.push(target)
    newVersion = bumpVersion(oldVersion)
    const packageJson = {
      name: `@${target.includes('/') ? '' : 'rime-contrib/'}${target}`,
      version: newVersion,
      files: targetFiles[target].map(({ name }) => name),
      license: targetLicense[target]
    }
    writeFileSync(packageJsonPath, JSON.stringify(packageJson))
  }
  targetVersion[target] = newVersion
}

if (updatedTargets.length) {
  console.log('Updated targets:')
  for (const target of updatedTargets) {
    console.log(target)
  }
} else {
  console.log('All targets are already up to date.')
}

// add/modify || remove
if (updatedTargets.length || Object.keys(targetFiles).length !== Object.keys(oldTargetFiles).length) {
  writeFileSync('target-files.json', JSON.stringify(targetFiles))
}

writeFileSync('schema-name.json', JSON.stringify(schemaName))
writeFileSync('schema-files.json', JSON.stringify(schemaFiles))
writeFileSync('schema-target.json', JSON.stringify(schemaTarget))
writeFileSync('schema-resources.json', JSON.stringify(schemaResources))
writeFileSync('dependency-map.json', JSON.stringify(dependencyMap))
writeFileSync('target-version.json', JSON.stringify(targetVersion))

console.log("Run 'pnpm run wasm' before 'pnpm run dev' to update rime.data.")
