# syntax=docker/dockerfile:1
# LoomiDefense level editor — static HTML served by nginx,
# mounted on the vhost at /editor/ (see deploy/loomi.prosper.se.conf).
# Its /api calls stay same-origin and reach the game through the vhost.
FROM nginx:1.27-alpine
COPY . /usr/share/nginx/html/
