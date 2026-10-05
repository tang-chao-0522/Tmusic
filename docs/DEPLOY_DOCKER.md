# 在 1.15.171.136 用 Docker 部署

运行应用只需 Docker Engine 和 Compose 插件，无需在宿主机安装 Node.js、npm 或 Nginx。以下部署命令还会使用 Git 和 OpenSSL。
本配置将前端、API、Nginx、MongoDB、Redis 和网易云接口服务全部放入容器。

## 准备

1. 在云服务器安全组开放 22、80、443。不要开放 3000、4100、27017、6379。
2. 按 [Docker 官方 Ubuntu 文档](https://docs.docker.com/engine/install/ubuntu/)安装 Docker Engine 和 Compose 插件。
3. 登录服务器并拉取当前开发分支：

   ```bash
   ssh ubuntu@1.15.171.136
   sudo apt update && sudo apt install -y git openssl
   git clone -b tc/agent https://github.com/tang-chao-0522/Tmusic.git ~/tmusic
   cd ~/tmusic
   ```

如果服务器拉取 GitHub 失败，可先从本地上传仓库文件；不要上传 `node_modules` 或任何含密钥的 `.env` 文件。

## 配置密钥并启动

```bash
cp deploy.env.example deploy.env
sed -i "s/replace-with-openssl-rand-hex-32/$(openssl rand -hex 32)/" deploy.env
sed -i "s|replace-with-openssl-rand-base64-32|$(openssl rand -base64 32)|" deploy.env
chmod 600 deploy.env
sudo docker compose -f compose.prod.yml up -d --build web api netease-api mongo redis
sudo docker compose -f compose.prod.yml ps
curl http://127.0.0.1/api/v1/health
```

健康接口应显示 `mongo: true`、`redis: true`。若服务尚在启动，稍等后重试；查看日志可用
`sudo docker compose -f compose.prod.yml logs --tail=100 api`。

## 给 IP 地址配置 HTTPS

生产环境的房间会话 Cookie 只在 HTTPS 下工作。Let's Encrypt 已支持 IP 地址证书；证书约 6 天有效，因此必须自动续期。Certbot 需要 5.4 或更新版本。

先确认容器内 Certbot 版本：

```bash
sudo docker compose -f compose.prod.yml run --rm certbot --version
```

确认版本符合要求后，申请证书；根据提示填写邮箱并同意条款：

```bash
sudo docker compose -f compose.prod.yml run --rm certbot \
  certonly --webroot --webroot-path /var/www/certbot \
  --preferred-profile shortlived --ip-address 1.15.171.136
sudo docker compose -f compose.prod.yml restart web
sudo docker compose -f compose.prod.yml --profile renewal up -d certbot-renew
curl -I https://1.15.171.136/
```

首次启动时 Nginx 使用 HTTP 配置，以便 Certbot 完成验证。获得证书后重启 `web`，它会切换到 HTTPS 配置。`certbot-renew` 每 12 小时检查续期，Nginx 每小时重新加载证书。可用以下命令检查续期：

```bash
sudo docker compose -f compose.prod.yml run --rm certbot renew --dry-run
```

## 更新

```bash
cd ~/tmusic
git pull --ff-only
sudo docker compose -f compose.prod.yml up -d --build web api netease-api mongo redis
sudo docker compose -f compose.prod.yml ps
```

保留 `deploy.env` 和 Docker 数据卷；不要执行 `docker compose down -v`，否则会删除 MongoDB、Redis 和证书数据。

当前 API 使用浏览器提交的 `x-user-id` 区分用户，尚未提供完整的用户认证。面向公众开放前应补上服务端认证；目前适合个人测试。
