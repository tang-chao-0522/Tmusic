# TMusic 微信小程序

独立的 Taro + React 工作区。小程序组件沿用 Web 端 shadcn/ui 的视觉规范，用 Taro 原生组件实现；接口和业务数据由同一个 Fastify 后端提供。

## 在本机运行（Windows PowerShell）

先安装 Node.js 22+、微信开发者工具、MongoDB 和 Redis。项目的网易云登录需要 MongoDB 存储加密凭据。若已安装 Docker，也可以运行：

```powershell
docker compose up -d mongo redis
```

首次在仓库根目录安装依赖：

```powershell
npm install
```

打开三个 PowerShell 窗口，均进入仓库根目录，依次运行：

```powershell
# 窗口 1：网易云 API 服务
npm run dev:netease
```

```powershell
# 窗口 2：TMusic 后端
npm run build -w @tmusic/contracts
npm run dev:api
```

```powershell
# 窗口 3：小程序编译监听
$env:TARO_APP_API_URL='http://127.0.0.1:4100/api/v1'
npm run dev:mini
```

打开微信开发者工具，导入仓库下的 `miniapp` 文件夹。`project.config.json` 已指向 `dist` 编译目录。体验本地 HTTP 接口时，在开发者工具的「详情 → 本地设置」勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。开发工具可先使用测试号；上传或真机预览前，把 `project.config.json` 的 `touristappid` 换成自己的小程序 AppID。

手机真机不能访问电脑的 `127.0.0.1`。真机测试或正式发布时，将 `TARO_APP_API_URL` 改成手机可访问的 HTTPS API 地址，并在小程序后台配置 request 合法域名；一起听歌还需要同域名的 WSS socket 合法域名。修改环境变量后重启 `npm run dev:mini`。

在小程序「我的」页面用网易云绑定的中国大陆手机号接收短信验证码登录，无需扫码。网易云登录和个人音乐库需要 MongoDB 正常运行；网易云短信发送与验证也依赖上游接口可用。

## 构建

```powershell
npm run typecheck -w @tmusic/miniapp
npm run build:mini
```

构建产物位于 `miniapp/dist`。Web 端当前没有实际 AI 服务接口，因此小程序的 AI 助手页通过现有曲库搜索提供情绪选歌。
