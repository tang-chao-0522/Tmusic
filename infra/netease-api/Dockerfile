FROM node:20-alpine

WORKDIR /service
RUN npm init -y && npm install --omit=dev NeteaseCloudMusicApi@4.32.0

ENV PORT=3000
EXPOSE 3000

CMD ["npx", "--no-install", "NeteaseCloudMusicApi"]
