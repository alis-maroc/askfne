#!/bin/bash
# =============================================================================
# Owly VPS Installer — Interactive setup script
# =============================================================================
# Usage: curl -fsSL https://raw.githubusercontent.com/alis-maroc/askfne/main/scripts/install-owly.sh | bash
# Or:    bash scripts/install-owly.sh
# =============================================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}   $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERR]${NC}   $*" >&2; }

header() {
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}${CYAN}  Owly — Installation VPS${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
}

cleanup() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    echo ""
    log_error "Installation failed (exit $exit_code)."
    log_error "Check the log above. For help, see: docs/INSTALL.md"
  fi
  rm -f /tmp/owly-env-inputs.txt 2>/dev/null || true
}
trap cleanup EXIT

# ── Banner ─────────────────────────────────────────────────────────────────────
header
echo -e "  This script installs Owly on a VPS."
echo -e "  Supports: AlmaLinux, CloudLinux, RHEL, Ubuntu, Debian."
echo -e "  Compatible with CWP (CentOS Web Panel)."
echo ""
echo -e "  ${BOLD}What it does:${NC}"
echo -e "  1. Checks/installs Docker, Docker Compose, Git, Curl, OpenSSL"
echo -e "  2. Clones your Git repository"
echo -e "  3. Generates a secure .env file (interactive)"
echo -e "  4. Starts all containers (app + db)"
echo -e "  5. Runs Prisma migrations"
echo -e "  6. Configures daily stable snapshots (cron)"
echo ""
echo -e "  Press ${BOLD}Ctrl+C${NC} to cancel, ${BOLD}Enter${NC} to continue..."
read -r

# ── 0. Detect OS ───────────────────────────────────────────────────────────────
log_info "Detecting operating system..."
if [[ -f /etc/almalinux-release ]]; then
  OS="almalinux"; OS_NAME="AlmaLinux $(cat /etc/almalinux-release | grep -oP '\d+' | head -1)"
elif [[ -f /etc/cloudlinux-release ]]; then
  OS="cloudlinux"; OS_NAME=$(cat /etc/cloudlinux-release | xargs)
elif [[ -f /etc/redhat-release ]]; then
  OS="rhel"; OS_NAME=$(cat /etc/redhat-release | xargs)
elif [[ -f /etc/lsb-release ]]; then
  OS="ubuntu"; OS_NAME=$(grep DISTRIB_DESCRIPTION /etc/lsb-release | cut -d= -f2 | xargs)
elif [[ -f /etc/debian_version ]]; then
  OS="debian"; OS_NAME="Debian $(cat /etc/debian_version)"
else
  log_warn "Unknown OS. Proceeding anyway — Docker may handle it..."
  OS="unknown"; OS_NAME=$(uname -sr)
fi
log_ok "OS detected: $OS_NAME"

# ── 1. System dependencies ─────────────────────────────────────────────────────
log_info "Installing system dependencies..."

install_pkg() {
  local pkg=$1
  if command -v "$pkg" &>/dev/null; then return 0; fi
  if [[ "$OS" == "almalinux" ]] || [[ "$OS" == "rhel" ]]; then
    dnf install -y -q "$pkg" 2>/dev/null || yum install -y -q "$pkg" 2>/dev/null || true
  elif [[ "$OS" == "ubuntu" ]] || [[ "$OS" == "debian" ]]; then
    apt-get install -y -q "$pkg" 2>/dev/null || true
  fi
}

for pkg in git curl openssl; do
  install_pkg "$pkg"
done
log_ok "System packages ready"

# ── 2. Docker ──────────────────────────────────────────────────────────────────
if command -v docker &>/dev/null && docker info &>/dev/null; then
  log_ok "Docker is already running"
else
  log_warn "Docker not found or not running."
  if [[ "$OS" == "almalinux" ]] || [[ "$OS" == "rhel" ]]; then
    log_info "Installing Docker CE on RHEL/AlmaLinux..."
    dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 2>/dev/null || \
    yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 2>/dev/null || true
    dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin 2>/dev/null || \
    yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin 2>/dev/null
  elif [[ "$OS" == "ubuntu" ]] || [[ "$OS" == "debian" ]]; then
    log_info "Installing Docker CE..."
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg lsb-release
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/"$OS"/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS $(lsb_release -cs) stable" \
      | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
  if command -v docker &>/dev/null; then
    systemctl enable --now docker 2>/dev/null || service docker start 2>/dev/null || true
    log_ok "Docker installed and started"
  else
    log_error "Docker installation failed. Please install Docker manually first."
    log_info "Guide: https://docs.docker.com/engine/install/"
    exit 1
  fi
fi

# Docker Compose v2 check (plugin) or v1 (standalone)
if docker compose version &>/dev/null; then
  DOCKER_COMPOSE="docker compose"
  ln -sf /usr/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose 2>/dev/null && chmod +x /usr/local/bin/docker-compose
  log_ok "Docker Compose plugin: $(docker compose version --short 2>/dev/null)"
elif command -v docker-compose &>/dev/null; then
  DOCKER_COMPOSE="docker-compose"
  log_ok "Docker Compose standalone: $(docker-compose version --short 2>/dev/null)"
else
  log_warn "Docker Compose not found. Attempting to install the v2 plugin..."
  if [[ "$OS" == "almalinux" ]] || [[ "$OS" == "rhel" ]] || [[ "$OS" == "cloudlinux" ]]; then
    dnf install -y docker-compose-plugin 2>/dev/null || \
    yum install -y docker-compose-plugin 2>/dev/null || true
  elif [[ "$OS" == "ubuntu" ]] || [[ "$OS" == "debian" ]]; then
    apt-get install -y -q docker-compose-plugin 2>/dev/null || true
  fi
  if docker compose version &>/dev/null; then
    DOCKER_COMPOSE="docker compose"
  ln -sf /usr/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose 2>/dev/null && chmod +x /usr/local/bin/docker-compose
    log_ok "Docker Compose plugin installed: $(docker compose version --short 2>/dev/null)"
  else
    log_warn "Plugin install failed. Downloading docker-compose standalone binary..."
    ARCH=$(uname -m)
    case "$ARCH" in
      x86_64) COMPOSE_ARCH="x86_64" ;;
      aarch64|arm64) COMPOSE_ARCH="aarch64" ;;
      *) log_error "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    if curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${COMPOSE_ARCH}" \
         -o /usr/local/bin/docker-compose 2>/dev/null; then
      chmod +x /usr/local/bin/docker-compose
      DOCKER_COMPOSE="docker-compose"
      log_ok "Docker Compose standalone installed: $(docker-compose version --short 2>/dev/null)"
    else
      log_error "Failed to install Docker Compose. Please install it manually."
      log_info "Guide: https://docs.docker.com/compose/install/"
      exit 1
    fi
  fi
fi

# ── 3. CWP Detection ───────────────────────────────────────────────────────────
CWP_DETECTED=false
if [[ -d /usr/local/cwpsrv ]] || [[ -d /var/cpanel ]] || systemctl list-unit-files | grep -q cwpsrv; then
  CWP_DETECTED=true
  log_warn "CWP (CentOS Web Panel) detected. Will configure Option A: reverse proxy via CWP."
fi

# ── 4. Repository ───────────────────────────────────────────────────────────────
log_info "Cloning Owly repository..."

OWLY_DIR=""
while [[ -z "$OWLY_DIR" ]]; do
  echo ""
  echo -e "  ${BOLD}Enter your Git repository URL:${NC}"
  echo -e "  (press Enter for default: ${CYAN}git@github.com:alis-maroc/askfne.git${NC})"
  read -r REPO_URL
  REPO_URL=${REPO_URL:-git@github.com:alis-maroc/askfne.git}

  echo ""
  echo -e "  ${BOLD}Installation directory:${NC}"
  echo -e "  (press Enter for default: ${CYAN}/opt/owly${NC})"
  read -r OWLY_DIR_INPUT
  OWLY_DIR=${OWLY_DIR_INPUT:-/opt/owly}

  if [[ -d "$OWLY_DIR" ]]; then
    echo ""
    log_warn "Directory $OWLY_DIR already exists."
    echo -e "  [${GREEN}U${NC}] Update existing (git pull)"
    echo -e "  [${YELLOW}C${NC}] Change directory"
    echo -e "  [${RED}Q${NC}] Quit"
    read -n1 -r choice
    echo ""
    case "$choice" in
      u|U) log_info "Pulling latest changes..."; (cd "$OWLY_DIR" && git pull) ;;
      c|C) OWLY_DIR=""; continue ;;
      q|Q) log_info "Cancelled."; exit 0 ;;
      *) log_info "Enter pressed -> defaulting to Update (git pull)..."; (cd "$OWLY_DIR" && git pull) ;;
    esac
  else
    PARENT=$(dirname "$OWLY_DIR")
    mkdir -p "$PARENT"
    log_info "Cloning to $OWLY_DIR..."
    # Try SSH first, fallback to HTTPS
    if git clone "$REPO_URL" "$OWLY_DIR" 2>/dev/null; then
      log_ok "Repository cloned (SSH)"
    elif git clone "${REPO_URL/git@github.com:/https://github.com/}" "$OWLY_DIR" 2>/dev/null; then
      log_ok "Repository cloned (HTTPS)"
    else
      log_error "Failed to clone repository."
      log_info "Make sure your SSH key is added to GitHub, or use HTTPS URL."
      OWLY_DIR=""
      continue
    fi
  fi
done

cd "$OWLY_DIR"
log_ok "Working directory: $OWLY_DIR"
log_ok "Git branch: $(git branch --show-current)"
log_ok "Latest commit: $(git log --oneline -1)"

# ── 5. Environment file ─────────────────────────────────────────────────────────
log_info "Setting up environment file..."

ENV_FILE="$OWLY_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  echo ""
  log_warn ".env already exists. Backing up to .env.backup-$(date +%Y%m%d-%H%M%S)..."
  cp "$ENV_FILE" "$ENV_FILE.backup-$(date +%Y%m%d-%H%M%S)"
fi

# Function to generate random secret
gen_secret() {
  openssl rand -base64 32 | tr -d '\n'
}

# Function to ask a required question
ask_required() {
  local var_name=$1; local prompt=$2; local default=$3
  local value=""
  while [[ -z "$value" ]]; do
    echo -n "  $prompt"
    if [[ -n "$default" ]]; then echo -n " [$default]"; fi
    echo -n ": "
    read -r value
    value=${value:-$default}
    if [[ -z "$value" ]]; then log_warn "This field is required."; fi
  done
  echo "${var_name}=${value}"
}

# Function to ask an optional question
ask_optional() {
  local var_name=$1; local prompt=$2; local default=$3
  echo -n "  $prompt"
  if [[ -n "$default" ]]; then echo -n " [$default]"; fi
  echo -n ": "
  read -r value
  value=${value:-$default}
  if [[ -n "$value" ]]; then echo "${var_name}=${value}"; else echo "# ${var_name}=${default}"; fi
}

echo ""
echo -e "  ${BOLD}=== Environment Configuration ===${NC}"
echo -e "  ${YELLOW}Press Enter to accept the default value shown in brackets.${NC}"
echo ""

# ── 5. Collect user inputs + write .env ──────────────────────────────────────────
echo ""
echo -e "  ${BOLD}=== Environment Configuration ===${NC}"
echo ""

# Collect inputs FIRST (reads must be outside redirected block)
echo "  Bot domain (e.g. bot.mondomain.com): "
read -r APP_URL
while [[ -z "$APP_URL" ]]; do
  log_warn "Domain is required."
  echo -n "  Bot domain: "
  read -r APP_URL
done

echo "  OpenAI API Key (sk-...): "
read -rs OPENAI_KEY; echo ""
while [[ -z "$OPENAI_KEY" ]]; do
  log_warn "At least one AI provider is required."
  echo -n "  OpenAI API Key: "
  read -rs OPENAI_KEY; echo ""
done

echo -n "  Anthropic API Key (sk-ant-...) [optional, Enter to skip]: "
read -rs ANTHROPIC_KEY; echo ""
echo -n "  Groq API Key (gsk_...) [optional, Enter to skip]: "
read -rs GROQ_KEY; echo ""
echo -n "  OpenRouter API Key [optional, Enter to skip]: "
read -rs OPENROUTER_KEY; echo ""

# Generate secrets
DB_PASSWORD=$(openssl rand -base64 20 | tr -d '/+=' | head -c 24)
JWT_SECRET_VAL=$(openssl rand -base64 32)
WEBHOOK_SECRET_VAL=$(openssl rand -base64 32)
WA_VERIFY_TOKEN=$(openssl rand -base64 32)
WA_SHARE_TOKEN=$(openssl rand -base64 32)
WA_API_KEY=$(openssl rand -base64 32)

# Write the .env file (no reads here — avoids stdin clash)
cat > "$ENV_FILE" <<EOF
# ============================================
# Owly — Generated by install-owly.sh
# Date: $(date -Iseconds)
# ============================================

# ---- Database ----
DATABASE_URL="postgresql://postgres:${DB_PASSWORD}@db:5432/owly?schema=public"

# ---- App ----
NEXT_PUBLIC_APP_URL="https://${APP_URL}"
NODE_ENV="production"

# ---- Secrets ----
JWT_SECRET="${JWT_SECRET_VAL}"
WEBHOOK_SECRET="${WEBHOOK_SECRET_VAL}"

# ---- AI Provider ----
OPENAI_API_KEY="${OPENAI_KEY}"
EOF

[[ -n "$ANTHROPIC_KEY"   ]] && echo "ANTHROPIC_API_KEY=\"${ANTHROPIC_KEY}\""   >> "$ENV_FILE"
[[ -n "$GROQ_KEY"         ]] && echo "GROQ_API_KEY=\"${GROQ_KEY}\""             >> "$ENV_FILE"
[[ -n "$OPENROUTER_KEY"   ]] && echo "OPENROUTER_API_KEY=\"${OPENROUTER_KEY}\"" >> "$ENV_FILE"

cat >> "$ENV_FILE" <<EOF

# ---- Channels ----
# WhatsApp
WHATSAPP_VERIFY_TOKEN="${WA_VERIFY_TOKEN}"
WHATSAPP_SHARE_TOKEN="${WA_SHARE_TOKEN}"
WHATSAPP_API_KEY="${WA_API_KEY}"

# Telegram (optional — uncomment after creating bot with @BotFather)
# TELEGRAM_BOT_TOKEN="123456:ABC-DEF..."
# TELEGRAM_WEBHOOK_URL="https://${APP_URL}/api/telegram/webhook"

# ---- CORS ----
CORS_ORIGIN="https://${APP_URL}"

# ---- Snapshots (auto-configured) ----
SNAPSHOT_DIR="/backups/owly"
SNAPSHOT_RETENTION_DAYS="7"
EOF


log_ok ".env created at $ENV_FILE"
log_warn "SECRETS ARE IN .env — keep it private!"

# ── 6. Port binding (CWP vs standalone) ─────────────────────────────────────────
if [[ "$CWP_DETECTED" == "true" ]]; then
  log_info "Configuring for CWP (reverse proxy mode)..."
  # Check if Caddy section exists in docker-compose and comment it out
  if grep -q "^  caddy:" "$OWLY_DIR/docker-compose.yml" 2>/dev/null; then
    log_info "Disabling Caddy in docker-compose.yml (CWP handles reverse proxy)..."
    sed -i 's/^  caddy:/  # caddy:/' "$OWLY_DIR/docker-compose.yml"
    sed -i 's/^    build: .\/caddy/#    build: .\//' "$OWLY_DIR/docker-compose.yml" || true
    # Comment out caddy service block
    awk '/^  # caddy:/{found=1} found{print} /^  app:/{if(found)exit}' "$OWLY_DIR/docker-compose.yml" > /tmp/caddy_block.txt || true
    # Remove caddy block lines from docker-compose
    python3 -c "
import sys
lines = open('$OWLY_DIR/docker-compose.yml').readlines()
out = []
skip = False
for line in lines:
    if line.strip().startswith('# caddy:'):
        skip = True
    if not skip:
        out.append(line)
    if skip and line.startswith('  ') and not line.startswith('  #'):
        if line.strip():
            continue
        else:
            skip = False
open('$OWLY_DIR/docker-compose.yml','w').writelines(out)
" 2>/dev/null || true
  fi
  # Bind app directly on port 3000
  if ! grep -q '"3000:3000"' "$OWLY_DIR/docker-compose.yml"; then
    log_info "Adding port 3000 to app service..."
    sed -i '/image:.*nextjs/a\    ports:\n      - "3000:3000"' "$OWLY_DIR/docker-compose.yml" 2>/dev/null || \
    sed -i 's/ports:/ports:\n      - "3000:3000"/' "$OWLY_DIR/docker-compose.yml" 2>/dev/null || true
  fi
  log_ok "App will be available at http://localhost:3000 (CWP reverse proxy forwards from port 80/443)"
else
  log_info "No CWP detected. Caddy will handle HTTPS automatically."
  log_info "App will be available on ports 80/443."
fi

# ── 7. Build & Start containers ─────────────────────────────────────────────────
log_info "Building and starting containers..."
log_warn "This may take 5–15 minutes on first run (npm dependencies + Prisma client)..."

mkdir -p /backups/owly
mkdir -p "$OWLY_DIR/data/whatsapp"

# Start db first, wait for it
log_info "Starting database..."
cd "$OWLY_DIR"
$(${DOCKER_COMPOSE} config 2>/dev/null | grep -q "Error" && echo "docker-compose up -d db" || "${DOCKER_COMPOSE}")
$(${DOCKER_COMPOSE} --env-file .env up -d db 2>/dev/null || docker-compose --env-file .env up -d db 2>/dev/null) &>/dev/null || true
$DOCKER_COMPOSE up -d db 2>/dev/null || docker-compose up -d db 2>/dev/null || true

log_info "Waiting for database to be ready..."
for i in $(seq 1 30); do
  sleep 2
  if $DOCKER_COMPOSE exec -T db pg_isready -U postgres &>/dev/null || \
     docker-compose exec -T db pg_isready -U postgres &>/dev/null; then
    log_ok "Database is ready!"
    break
  fi
  if [[ $i -eq 30 ]]; then
    log_error "Database did not start in time."
    log_info "Check logs: $DOCKER_COMPOSE logs db"
    exit 1
  fi
done

# Start app
log_info "Starting application..."
$DOCKER_COMPOSE up -d app 2>/dev/null || docker-compose up -d app 2>/dev/null

log_info "Waiting for app to be healthy..."
for i in $(seq 1 60); do
  sleep 3
  if curl -sf http://localhost:3000/api/health &>/dev/null; then
    log_ok "App is healthy!"
    break
  fi
  if [[ $i -eq 60 ]]; then
    log_warn "App health check timed out. Checking logs..."
    $DOCKER_COMPOSE logs app 2>/dev/null | tail -20 || docker-compose logs app 2>/dev/null | tail -20
  fi
done

# ── 8. Prisma migrations ─────────────────────────────────────────────────────────
log_info "Running Prisma migrations..."
$DOCKER_COMPOSE exec -T app npx prisma migrate deploy 2>/dev/null || \
docker-compose exec -T app npx prisma migrate deploy 2>/dev/null || \
$DOCKER_COMPOSE exec -T app node_modules/.bin/prisma migrate deploy 2>/dev/null || true
log_ok "Migrations complete"

# ── 9. Stable snapshot cron ──────────────────────────────────────────────────────
SNAPSHOT_SCRIPT="$OWLY_DIR/scripts/snapshot-stable.sh"
SETUP_CRON="$OWLY_DIR/scripts/setup-snapshot-cron.sh"

if [[ -f "$SETUP_CRON" ]]; then
  echo ""
  echo -e "  ${BOLD}=== Stable Snapshot Setup ===${NC}"
  echo -e "  Configure daily stable snapshots? (${YELLOW}recommended${NC})"
  echo -e "  This creates a daily rollback point at 03:00 AM."
  echo -e "  [${GREEN}Y${NC}] Yes, set up daily snapshots"
  echo -e "  [${RED}N${NC}] No, skip"
  read -n1 -r setup_cron
  echo ""
  if [[ "$setup_cron" =~ ^[Yy]$ ]]; then
    bash "$SETUP_CRON" && log_ok "Daily snapshots configured!" || log_warn "Cron setup failed. Run manually: bash $SETUP_CRON"
  fi
fi

# ── 10. Final summary ─────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Installation Complete!${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}URL:${NC}       https://$APP_URL"
echo -e "  ${BOLD}Dashboard:${NC} https://$APP_URL/admin"
echo -e "  ${BOLD}Health:${NC}    https://$APP_URL/api/health"
echo ""
echo -e "  ${BOLD}Next steps:${NC}"
echo ""
if [[ "$CWP_DETECTED" == "true" ]]; then
  echo -e "  1. In CWP → WebServer Settings → Apache Reverse Proxy:"
  echo -e "     Add: https://$APP_URL → http://127.0.0.1:3000"
  echo ""
  echo -e "  2. In CWP → SSL Certificates:"
  echo -e "     Add Let's Encrypt for: $APP_URL"
  echo ""
else
  echo -e "  1. Caddy will automatically request an SSL certificate."
  echo -e "     Wait ~2 minutes for HTTPS to become active."
  echo ""
fi
echo -e "  3. Link your WhatsApp Business account:"
echo -e "     Visit: https://$APP_URL/whatsapp-setup"
echo ""
echo -e "  4. Create admin account at:"
echo -e "     https://$APP_URL/admin"
echo ""
echo -e "  ${BOLD}Useful commands:${NC}"
echo -e "  docker compose -f $OWLY_DIR/docker-compose.yml logs -f       # View logs"
echo -e "  docker compose -f $OWLY_DIR/docker-compose.yml restart app   # Restart app"
echo -e "  docker compose -f $OWLY_DIR/docker-compose.yml exec app sh  # Shell into container"
echo ""
echo -e "  ${BOLD}Docs:${NC} $OWLY_DIR/docs/INSTALL.md"
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
