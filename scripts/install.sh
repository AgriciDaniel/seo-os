#!/usr/bin/env bash
# =============================================================================
# SEO Office — community installer
# =============================================================================
# Usage:
#   git clone https://github.com/AgriciDaniel/seo-os.git ~/seo-office
#   bash ~/seo-office/scripts/install.sh
#
# Or, to clone to a custom directory:
#   INSTALL_DIR="$HOME/SEO Office" bash scripts/install.sh
#
# What this script does:
#   1. Detects your OS (macOS / Linux / WSL2)
#   2. Installs Node.js 24 via nvm if not present
#   3. Installs pnpm 10 if not present
#   4. Verifies Python 3.11+ (prints install instructions if missing)
#   5. Clones the repo to ~/seo-office (or your chosen directory)
#   6. Runs `pnpm install`
#   7. Scaffolds `.env.local` from `.env.example`
#   8. Prints next steps for starting the app and opening /setup
#
# This script is intentionally simple and conservative. It WILL ask before
# making system-level changes. It will NEVER overwrite your existing
# `.env.local` or modify files outside the install directory.
# =============================================================================

set -euo pipefail

# -------- config ---------------------------------------------------------------
INSTALL_DIR="${INSTALL_DIR:-$HOME/seo-office}"
REPO_URL="${REPO_URL:-https://github.com/AgriciDaniel/seo-os.git}"
NODE_VERSION="${NODE_VERSION:-24}"
REQUIRED_PNPM_MAJOR=10
REQUIRED_PYTHON_MINOR=11            # 3.11+

# -------- pretty printing ------------------------------------------------------
c_reset=$'\033[0m'; c_bold=$'\033[1m'; c_dim=$'\033[2m'
c_blue=$'\033[34m'; c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_red=$'\033[31m'

step()  { printf "\n%s==> %s%s\n" "$c_blue$c_bold" "$1" "$c_reset"; }
info()  { printf "    %s%s%s\n" "$c_dim" "$1" "$c_reset"; }
ok()    { printf "    %s✓ %s%s\n" "$c_green" "$1" "$c_reset"; }
warn()  { printf "    %s! %s%s\n" "$c_yellow" "$1" "$c_reset"; }
fail()  { printf "    %s✗ %s%s\n" "$c_red" "$1" "$c_reset" >&2; exit 1; }

confirm() {
  local response
  if [[ -r /dev/tty ]]; then
    read -r -p "    ? $1 [y/N] " response </dev/tty
  else
    warn "No interactive terminal available; treating prompt as no: $1"
    return 1
  fi
  [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]
}

load_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [[ -s "$NVM_DIR/nvm.sh" ]] && \. "$NVM_DIR/nvm.sh"
}

# -------- pre-flight ----------------------------------------------------------
step "Pre-flight checks"
case "$(uname -s)" in
  Darwin*) info "OS: macOS"; OS=mac ;;
  Linux*)  info "OS: Linux ($(uname -r))"; OS=linux ;;
  *)       fail "Unsupported OS: $(uname -s). SEO Office supports macOS, Linux, and WSL2." ;;
esac

command -v git >/dev/null 2>&1 || fail "git is required before running this installer."
command -v curl >/dev/null 2>&1 || fail "curl is required before running this installer."
info "Repo: $REPO_URL"

# -------- Node.js via nvm ------------------------------------------------------
step "Node.js $NODE_VERSION"
load_nvm
if command -v node >/dev/null 2>&1; then
  current=$(node --version | sed 's/v//')
  major=${current%%.*}
  if [[ "$major" -ge "$NODE_VERSION" ]]; then
    ok "node $current already installed"
  else
    warn "node $current is older than required v$NODE_VERSION"
    confirm "Install Node $NODE_VERSION via nvm?" || fail "Aborting — upgrade Node manually then re-run."
    NEED_NVM=1
  fi
else
  info "node not found"
  confirm "Install Node $NODE_VERSION via nvm?" || fail "Aborting — install Node $NODE_VERSION manually then re-run."
  NEED_NVM=1
fi

if [[ "${NEED_NVM:-0}" == "1" ]]; then
  load_nvm
  if ! command -v nvm >/dev/null 2>&1; then
    info "installing nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    load_nvm
  fi
  command -v nvm >/dev/null 2>&1 || fail "nvm installed but is not available in this shell. Open a new terminal and re-run."
  nvm install "$NODE_VERSION"
  nvm use "$NODE_VERSION"
  ok "node $(node --version)"
fi

# -------- pnpm ----------------------------------------------------------------
step "pnpm $REQUIRED_PNPM_MAJOR"
if command -v pnpm >/dev/null 2>&1; then
  current=$(pnpm --version)
  major=${current%%.*}
  if [[ "$major" -ge "$REQUIRED_PNPM_MAJOR" ]]; then
    ok "pnpm $current already installed"
  else
    warn "pnpm $current is older than required v$REQUIRED_PNPM_MAJOR"
    confirm "Upgrade pnpm via corepack?" && corepack enable && corepack prepare "pnpm@latest" --activate
  fi
else
  info "installing pnpm via corepack..."
  corepack enable
  corepack prepare "pnpm@latest" --activate
  ok "pnpm $(pnpm --version)"
fi

# -------- Python --------------------------------------------------------------
step "Python 3.$REQUIRED_PYTHON_MINOR+"
if command -v python3 >/dev/null 2>&1; then
  pyver=$(python3 -c 'import sys; print("{}.{}".format(*sys.version_info[:2]))')
  minor=${pyver#*.}
  if [[ "$minor" -ge "$REQUIRED_PYTHON_MINOR" ]]; then
    ok "python $pyver already installed"
  else
    warn "python $pyver is older than required 3.$REQUIRED_PYTHON_MINOR"
    if [[ "$OS" == "mac" ]]; then
      info "  install via: brew install python@3.13"
    else
      info "  install via: sudo apt install python3.13 (Pop!_OS/Ubuntu) or use pyenv"
    fi
    fail "Re-run this installer once Python is upgraded."
  fi
else
  warn "python3 not found"
  if [[ "$OS" == "mac" ]]; then
    info "  install via: brew install python@3.13"
  else
    info "  install via: sudo apt install python3.13 (Pop!_OS/Ubuntu) or use pyenv"
  fi
  fail "Re-run this installer once Python is installed."
fi

# -------- clone --------------------------------------------------------------
step "Cloning SEO Office to $INSTALL_DIR"
if [[ -d "$INSTALL_DIR" ]]; then
  warn "$INSTALL_DIR already exists"
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "appears to be an existing git checkout — skipping clone"
  else
    fail "Directory exists but isn't a git repo. Move/remove it and re-run."
  fi
else
  if [[ -z "$REPO_URL" ]]; then
    fail "REPO_URL is empty — cannot clone. Set REPO_URL env var or clone manually."
  fi
  git clone "$REPO_URL" "$INSTALL_DIR"
  ok "cloned"
fi

cd "$INSTALL_DIR"

# -------- install deps -------------------------------------------------------
step "Installing dependencies"
pnpm install
ok "pnpm install complete"

# -------- .env.local ---------------------------------------------------------
step "Configuring environment"
if [[ -f .env.local ]]; then
  warn ".env.local already exists — not overwriting"
else
  cp .env.example .env.local
  ok "created .env.local from template"
  info "  → the setup wizard can write provider choices and API keys here"
fi

# -------- done ---------------------------------------------------------------
cat <<EOF

${c_bold}${c_green}SEO Office installed.${c_reset}

Next steps:
  1. Run:
       ${c_bold}cd $INSTALL_DIR && pnpm dev${c_reset}
  2. Open:
       ${c_bold}http://localhost:3000/setup${c_reset}
  3. Choose one LLM provider in the setup wizard:
       claude-cli, codex-cli, gemini-cli, or anthropic-api
  4. Add optional integrations there or in ${c_bold}$INSTALL_DIR/.env.local${c_reset}
     API keys stay in .env.local. Google OAuth is handled by the setup wizard
     through gcloud, including upload of a Desktop OAuth client JSON if needed.

Need help? See ${c_dim}docs/design/2026-05-11-seo-office-design.md${c_reset}
EOF
