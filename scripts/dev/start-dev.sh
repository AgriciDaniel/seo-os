#!/usr/bin/env bash
# Standalone dev-server launcher. Resolves nvm-installed pnpm explicitly so
# the systemd user-session unit doesn't depend on .bashrc / nvm shims.
set -e
export PATH="/home/agricidaniel/.nvm/versions/node/v24.13.0/bin:/usr/local/bin:/usr/bin:/bin"
cd "/home/agricidaniel/Desktop/SEO Office"
exec pnpm dev
