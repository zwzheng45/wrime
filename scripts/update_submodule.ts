import { mkdirSync, cpSync } from 'fs'
import { cwd, chdir } from 'process'
import { spawnSync, SpawnSyncOptionsWithBufferEncoding } from 'child_process'
import { ensure } from './util.js'

const root = cwd()
const includeBoost = `${root}/build/sysroot/usr/include/boost`
mkdirSync(includeBoost, { recursive: true })

const spawnArg: SpawnSyncOptionsWithBufferEncoding = {
  stdio: 'inherit',
  env: process.env
}

function update (submodule: string, boost?: boolean) {
  const args = [
    'submodule',
    'update',
    '--init',
    ...(boost ? ['--depth', '1'] : ['--recursive']),
    '-f',
    submodule
  ]
  let result: ReturnType<typeof spawnSync> | undefined
  for (let attempt = 1; attempt <= 3; ++attempt) {
    result = spawnSync('git', args, spawnArg)
    if (result.status === 0) {
      return
    }
    if (attempt < 3) {
      console.warn(`Retrying submodule '${submodule}' (${attempt + 1}/3).`)
    }
  }
  ensure(result!)
}

for (const submodule of [
  'librime',
  'lua',
  'librime-lua',
  'librime-octagram'
]) {
  update(submodule)
}

update('boost', true)

chdir('boost')
update('tools', true)

chdir('libs')
for (const submodule of [
  'algorithm',
  'align',
  'any',
  'array',
  'assert',
  'bind',
  'concept_check',
  'config',
  'container',
  'container_hash',
  'core',
  'crc',
  'date_time',
  'describe',
  'detail',
  'endian',
  'format',
  'function',
  'function_types',
  'functional',
  'headers',
  'integer',
  'interprocess',
  'intrusive',
  'io',
  'iostreams',
  'iterator',
  'json',
  'lexical_cast',
  'move',
  'mp11',
  'mpl',
  'numeric/conversion',
  'optional',
  'predef',
  'preprocessor',
  'random',
  'range',
  'regex',
  'scope_exit',
  'signals2',
  'smart_ptr',
  'static_assert',
  'system',
  'throw_exception',
  'tti',
  'type_index',
  'type_traits',
  'typeof',
  'utility',
  'uuid',
  'variant',
  'variant2',
  'winapi'
]) {
  update(submodule.split('/')[0], true)
  cpSync(`${submodule}/include/boost`, includeBoost, { recursive: true })
}
