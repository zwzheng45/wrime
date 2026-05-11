# wRIME

本仓库基于 [LibreService/my_rime](https://github.com/LibreService/my_rime/)。在原版基础上添加了我个人的[小鹤音形](https://github.com/zwzheng45/rime-fast-xhup)方案，并使用了[万象语法模型（RIME-LMDG）](https://github.com/amzxyz/RIME-LMDG)改善长句输入体验。

## 小鹤音形使用方式

- 在方案选择器中选择 `小鹤音形`。
- 首次选择后，页面会先加载小模型 `zh-hans-t-essay-bgw.gram`，保证输入法尽快可用。
- 小模型可用后，后台开始按需下载大模型 `wanxiang-lts-zh-hans.gram`。
- 大模型下载完成后，worker 会等待当前输入没有 composition，再自动切换到隐藏运行时方案 `flypy_xhfast_lts`。

小鹤音形相关 schema：

- `flypy_xhfast`：用户可见方案，使用小模型。
- `flypy_xhfast_lts`：隐藏运行时方案，使用万象 LTS 大模型，不显示在方案选择器中。
- `melt_eng`、`easy_en`、`flypy_radical`、`flypy_phrase`：小鹤音形依赖方案/资源。

## 本地构建和预览

建议优先使用 Docker，减少对宿主机环境的影响。

```sh
docker build --build-arg ENABLE_LOGGING=OFF -t wrime-flypy-xhfast .
docker run --rm -p 8080:80 wrime-flypy-xhfast
```

浏览器访问：

```text
http://localhost:8080
```

本仓库使用 Git LFS 管理大模型文件。克隆或构建前请确保 LFS 文件已拉取：

```sh
git lfs install
git lfs pull
```

Dockerfile 会安装 `git-lfs` 并执行 `git lfs pull`。CI 和 Docker 构建也会拉取 `librime-octagram`，用于让 `.gram` 语言模型在 native/wasm 中实际生效。

## 测试

推荐在 Docker 容器中跑 Playwright，避免污染本机浏览器/依赖环境。先启动已构建镜像：

```sh
docker run --rm -d -p 8080:80 wrime-flypy-xhfast
```

然后运行核心回归：

```sh
docker run --rm --network host \
  -e PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080/ \
  -v "$PWD":/workspace \
  -v wrime-node-modules:/workspace/node_modules \
  -w /workspace \
  mcr.microsoft.com/playwright:v1.59.1-noble \
  /bin/bash -lc "./node_modules/.bin/playwright test --browser chromium test/test-basic.spec.ts test/test-flypy_xhfast.spec.ts"
```

## 上线部署

### 容器部署

```sh
docker build --build-arg ENABLE_LOGGING=OFF -t wrime-flypy-xhfast .
docker run -d --name wrime -p 80:80 wrime-flypy-xhfast
```

### 静态站点部署

从 Docker 构建产物发布 `/usr/share/nginx/html`，或发布本地构建生成的 `dist/`。静态服务必须能访问以下资源：

- `rime.js`
- `rime.wasm`
- `rime.data`
- `worker.js`
- `ime/**`

大模型是按需下载的，因此 `ime/local/flypy-xhfast/wanxiang-lts-zh-hans.gram` 也必须发布并可访问。建议静态服务为模型文件返回 `Content-Length`，这样前端可以显示准确下载进度。

### CDN 部署

构建时可传入 CDN 路径：

```sh
docker build \
  --build-arg ENABLE_LOGGING=OFF \
  --build-arg LIBRESERVICE_CDN=https://cdn.example.com/wrime/v1/ \
  --build-arg RIME_CDN=https://cdn.example.com/wrime/v1/ime/ \
  -t wrime-flypy-xhfast .
```

发布新版本时请更新 CDN 版本路径或清理缓存，避免浏览器继续使用旧 manifest、旧 worker 或旧模型文件。

Cloudflare Pages + R2 部署可参考 [Cloudflare Pages + R2 部署说明](doc/cloudflare-pages-r2.md)。

## 以下是原 README

---

# My RIME 梧桐输入法
![](https://img.shields.io/github/license/LibreService/my_rime)

Online Chinese IME powered by [RIME](https://github.com/rime/librime).

https://my-rime.vercel.app/


This is a **STATIC** website so you **DON'T** need to own a server to host it.

All computation is performed in browser, thanks to Web Assembly.

It's also a [PWA](https://web.dev/progressive-web-apps/), so you can install it like a native App and use it **OFFLINE**.

## Documentation
If you want to distribute your own IME, see [customize](doc/customize.md).

If you want to deploy schemas dynamically (online, like how you deploy in Desktop/Mobile platforms), see [deploy](doc/deploy.md).

If you want to develop My RIME or know technical details, see [develop](doc/develop.md).

## Self host
Download latest [artifact](https://github.com/LibreService/my_rime/releases/download/latest/my-rime-dist.zip) built by GitHub Actions.

## Development workflow
My RIME can be built on Linux, macOS and Windows.

### Install node
You may use [nvm](https://github.com/nvm-sh/nvm)
or [winget](https://github.com/microsoft/winget-cli)
to install node.
### Install pnpm and dev dependencies
```sh
npm i -g pnpm
pnpm i
```
### Install build and RIME dependencies
```sh
# Ubuntu
apt install -y \
  cmake \
  ninja-build \
  clang-format \
  libboost-dev \
  libboost-regex-dev \
  libyaml-cpp-dev \
  libleveldb-dev \
  libmarisa-dev \
  libopencc-dev

# macOS
brew install cmake ninja clang-format

# Windows
winget install cmake Ninja-build.Ninja LLVM
```
### Install emsdk
https://emscripten.org/docs/getting_started/downloads.html
### Get submodule
It's not recommended to clone recursively, as many boost libs are not needed.
```sh
pnpm run submodule
```
### Get font
Uncommon characters are rendered using
[遍黑体](https://github.com/Fitzgerald-Porthmouth-Koenigsegg/Plangothic-Project),
[花园明朝](https://github.com/max32002/max-hana)
and
[一点明朝](https://github.com/ichitenfont/I.Ming).
```sh
pnpm run font
```
### Build wasm
```sh
pnpm run native
pnpm run schema
export ENABLE_LOGGING=OFF # optional, default ON
export BUILD_TYPE=Debug # optional, default Release
pnpm run lib
pnpm run wasm
```
### Run develop server
```sh
pnpm run dev
```
The app is accessible at http://localhost:5173

Optionally, go to http://localhost:5173/?debug=on or turn on `Advanced` switch so that you can send raw key sequences to librime,
e.g. `{Shift+Delete}`, `{Release+a}`.
This feature is better used with log enabled.
### Lint
```sh
pnpm run lint:fix
```
### Check type
```sh
pnpm run check
```
### Build
```sh
pnpm run build
```
### Test
```sh
pnpm run test
```
### Preview
```sh
pnpm run preview
```
### Deploy (maintainer only)
```sh
# publish IMEs
declare -a packages=(
  ... # targets output by pnpm run schema
)
for package in "${packages[@]}"; do
  pushd public/ime/$package
  npm publish
  popd
done

# set VERSION to avoid CDN and browser caching old version
export LIBRESERVICE_CDN=https://cdn.jsdelivr.net/npm/@libreservice/my-rime@VERSION/dist/
export RIME_CDN=https://cdn.jsdelivr.net/npm/@rime-contrib/

vercel build --prod
npm publish
vercel deploy --prebuilt --prod
```

## Docker
```sh
docker build \
  --build-arg ENABLE_LOGGING=OFF \
  -t my-rime .
docker run --name my-rime -d my-rime
```
Let's say the IP address of the container is 172.17.0.2 (got by `docker inspect my-rime | grep IPAddress`), then My RIME is accessible at http://172.17.0.2/.

## License
AGPLv3+
