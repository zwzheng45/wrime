# Cloudflare Pages + R2 部署说明

本文档用于把当前 wrime 静态站部署到：

- 页面站点：`https://wrime.zzw.moe`
- Rime 资源桶：`https://wrime-assets.zzw.moe`

推荐部署形态是：

- Cloudflare Pages 只发布页面本体，也就是 `dist/` 中除 `ime/` 以外的文件。
- Cloudflare R2 发布 `dist/ime/**`，包括所有方案的预构建资源和小鹤音形的大模型。

这样可以避免 Pages 直接承载大量输入方案资源，同时仍让用户只在选择对应方案时按需下载资源。

## 路径规则

构建时如果传入：

```sh
--build-arg RIME_CDN=https://wrime-assets.zzw.moe/
```

worker 会按以下规则请求输入方案资源：

```text
https://wrime-assets.zzw.moe/<target>@<version>/<file>
```

例如当前 `package.json` 版本为 `0.11.0` 时，小鹤音形大模型地址应是：

```text
https://wrime-assets.zzw.moe/local/flypy-xhfast@0.11.0/wanxiang-lts-zh-hans.gram
```

所以 R2 里不能直接上传成 `ime/local/flypy-xhfast/wanxiang-lts-zh-hans.gram`，而要上传到带版本号的目录。

## 构建镜像

在项目根目录执行：

```sh
docker build \
  --build-arg ENABLE_LOGGING=OFF \
  --build-arg RIME_CDN=https://wrime-assets.zzw.moe/ \
  -t wrime-flypy-xhfast .
```

如果只把 `ime/**` 放到 R2，通常不需要设置 `LIBRESERVICE_CDN`。此时 `rime.js`、`rime.wasm`、`rime.data` 和字体文件仍由 Pages 提供，文件体积都小于 Pages 单文件限制。

## 导出构建产物

从 Docker 镜像导出静态文件：

```sh
rm -rf dist dist-pages

id=$(docker create wrime-flypy-xhfast)
docker cp "$id":/usr/share/nginx/html ./dist
docker rm "$id"

cp -a dist dist-pages
rm -rf dist-pages/ime
```

导出后：

- `dist/ime/` 上传到 R2。
- `dist-pages/` 上传到 Cloudflare Pages。

## 配置 R2 公开访问

在 Cloudflare R2 中给桶绑定自定义域名：

```text
wrime-assets.zzw.moe
```

然后配置 CORS，至少允许 Pages 域名读取资源：

```json
[
  {
    "AllowedOrigins": ["https://wrime.zzw.moe"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "ETag"],
    "MaxAgeSeconds": 86400
  }
]
```

`Content-Length` 建议暴露出来，否则飞鹤大模型下载进度可能只能显示已下载大小，不能显示总大小。

## 上传 ime 到 R2

先准备 R2 S3 API 凭据：

```sh
export R2_ACCOUNT_ID=你的Cloudflare账号ID
export R2_BUCKET=你的R2桶名
export AWS_ACCESS_KEY_ID=你的R2_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY=你的R2_SECRET_ACCESS_KEY
export AWS_DEFAULT_REGION=auto
export VERSION=0.11.0
```

注意：

- `R2_BUCKET` 是 R2 桶名，不一定是 `wrime-assets.zzw.moe`。
- `wrime-assets.zzw.moe` 是公开访问域名。
- `VERSION` 必须和 `package.json` 里的 `version` 一致。

使用 Docker 版 AWS CLI 上传：

```sh
docker run --rm --entrypoint /bin/sh \
  -e AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY \
  -e AWS_DEFAULT_REGION \
  -e R2_ACCOUNT_ID \
  -e R2_BUCKET \
  -e VERSION \
  -v "$PWD/dist/ime:/ime:ro" \
  amazon/aws-cli -c '
    find /ime -name package.json -type f | while read pkg; do
      dir=${pkg%/package.json}
      target=${dir#/ime/}
      echo "upload $target@$VERSION"
      aws --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" \
        s3 sync "$dir/" "s3://$R2_BUCKET/$target@$VERSION/" \
        --cache-control "public, max-age=31536000, immutable"
    done
  '
```

上传完成后检查关键资源：

```sh
curl -I https://wrime-assets.zzw.moe/luna-pinyin@0.11.0/luna_pinyin.schema.yaml
curl -I https://wrime-assets.zzw.moe/local/flypy-xhfast@0.11.0/zh-hans-t-essay-bgw.gram
curl -I https://wrime-assets.zzw.moe/local/flypy-xhfast@0.11.0/wanxiang-lts-zh-hans.gram
```

应该看到 `200`，并且最好有 `content-length`。

## 上传 Pages

准备 Pages API Token：

```sh
export CLOUDFLARE_ACCOUNT_ID=你的Cloudflare账号ID
export CLOUDFLARE_API_TOKEN=你的Pages部署Token
```

用 Docker 运行 Wrangler 发布 `dist-pages/`：

```sh
docker run --rm \
  -e CLOUDFLARE_ACCOUNT_ID \
  -e CLOUDFLARE_API_TOKEN \
  -v "$PWD:/work" \
  -w /work \
  node:22-bookworm \
  sh -c 'npm exec --yes wrangler@latest pages deploy dist-pages --project-name wrime --branch main'
```

然后在 Cloudflare Pages 项目里绑定自定义域名：

```text
wrime.zzw.moe
```

## 部署后验证

打开：

```text
https://wrime.zzw.moe
```

建议检查：

- 默认打开仍是 `朙月拼音`。
- 默认方案不会请求 `wanxiang-lts-zh-hans.gram`。
- 选择 `小鹤音形` 后，会请求小模型 `zh-hans-t-essay-bgw.gram`。
- 随后后台请求大模型 `wanxiang-lts-zh-hans.gram`。
- 大模型下载完成并切换后，模型状态指示显示为万象 LTS。
- 输入 `jmjmdejqbuzdyile ` 应输出 `渐渐的就不在意了`。

浏览器开发者工具中，Rime 方案资源请求应来自：

```text
https://wrime-assets.zzw.moe/
```

页面本体请求应来自：

```text
https://wrime.zzw.moe/
```

## 发新版

发新版时先更新 `package.json` 版本号，例如：

```json
{
  "version": "0.11.1"
}
```

然后重新执行：

1. Docker build。
2. 导出 `dist` 和 `dist-pages`。
3. 上传 `dist/ime` 到 R2 的 `@0.11.1` 路径。
4. 上传 `dist-pages` 到 Pages。

不要在生产环境复用旧版本路径覆盖文件，例如不要反复覆盖 `@0.11.0`。这些 R2 资源使用了长缓存：

```text
Cache-Control: public, max-age=31536000, immutable
```

复用旧路径会导致浏览器或 Cloudflare 继续命中旧模型、旧 schema 或旧 manifest。

