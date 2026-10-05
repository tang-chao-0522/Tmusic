#!/bin/sh
set -eu

if [ -s /etc/letsencrypt/live/1.15.171.136/fullchain.pem ]; then
    cp /etc/nginx/tmusic-https.conf /etc/nginx/conf.d/default.conf
else
    cp /etc/nginx/tmusic-http.conf /etc/nginx/conf.d/default.conf
fi

# Certbot renews the mounted certificate; reload Nginx so it picks up new files.
(while sleep 3600; do nginx -s reload || true; done) &
exec nginx -g 'daemon off;'
