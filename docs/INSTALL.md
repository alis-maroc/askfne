# Installation Owly — VPS (VPS avec Docker)

Guide d'installation complète d'Owly sur un serveur VPS avec AlmaLinux 8/9, Ubuntu 22/24, ou CWP (CentOS Web Panel).

---

## Table des matières

1. [Prérequis](#1-prérequis)
2. [Installation automatique (recommandée)](#2-installation-automatique-recommandée)
3. [Installation manuelle](#3-installation-manuelle)
4. [Configuration CWP (Option A)](#4-configuration-cwp-option-a)
5. [Configuration SSL](#5-configuration-ssl)
6. [Connexion WhatsApp](#6-connexion-whatsapp)
7. [Snapshots stables (fallback)](#7-snapshots-stables-fallback)
8. [Commandes utiles](#8-commandes-utiles)
9. [Dépannage](#9-dépannage)

---

## 1. Prérequis

### Serveur

| Élément | Minimum | Recommandé |
|---------|---------|------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disque | 20 GB SSD | 50 GB SSD |
| OS | AlmaLinux 8, Ubuntu 22.04 | AlmaLinux 9, Ubuntu 24.04 |

### Dépendances niveau hôte (installées automatiquement)

| Package | Rôle | Installé par |
|---------|------|-------------|
| Docker Engine 20.10+ | Conteneurisation | Script / install-docker |
| Docker Compose v2 | Orchestration | Script |
| Git | Clone du repo | Script |
| Curl + OpenSSL | Downloads, secrets | Script |

### Ce qui n'est PAS nécessaire sur l'hôte

- ❌ Node.js (dans le container)
- ❌ PostgreSQL (dans le container Docker)
- ❌ Chromium/puppeteer (dans le container)
- ❌ Apache/Nginx seul (remplacé par Caddy dans le container, ou CWP)

### Ports utilisés

| Port | Usage | Hôte |
|------|-------|------|
| 80 | HTTP (Caddy auto-redirect) | VPS standard |
| 443 | HTTPS (Caddy + SSL auto) | VPS standard |
| 3000 | App Next.js | CWP (reverse proxy) |
| 5432 | PostgreSQL | Interne au réseau Docker |

---

## 2. Installation automatique (recommandée)

### Option A : Script一行 (recommandé)

```bash
curl -fsSL https://raw.githubusercontent.com/alis-maroc/askfne/main/scripts/install-owly.sh | bash
```

Le script va :
1. Vérifier / installer Docker, Docker Compose, Git, Curl, OpenSSL
2. Détecter automatiquement CWP et configurer Option A
3. Cloner le dépôt Git
4. Générer un fichier `.env` sécurisé (interaction requise)
5. Lancer les containers (`docker compose up -d`)
6. Attendre que la DB soit prête
7. Exécuter les migrations Prisma
8. Proposer d'activer les snapshots quotidiens

### Option B : Exécution locale du script

Si tu as déjà cloné le repo :

```bash
# Sur le VPS
git clone git@github.com:alis-maroc/askfne.git /opt/owly
cd /opt/owly
bash scripts/install-owly.sh
```

### Option C : Via wget

```bash
wget -qO- https://raw.githubusercontent.com/alis-maroc/askfne/main/scripts/install-owly.sh | bash
```

---

## 3. Installation manuelle

### 3.1 Installer Docker (si pas encore)

**AlmaLinux / RHEL :**

```bash
# Docker CE
dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Activer et démarrer
systemctl enable --now docker

# Vérifier
docker --version
docker compose version
```

**Ubuntu :**

```bash
apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release

# Ajouter Docker GPG key + repo
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  tee /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
```

### 3.2 Cloner le repo

```bash
git clone git@github.com:alis-maroc/askfne.git /opt/owly
cd /opt/owly
```

### 3.3 Créer le fichier `.env`

```bash
cp .env.example .env
nano .env   # ou vim, ou cat
```

**Variables requises dans `.env` :**

```env
# Base de données (inchangé — Docker s'en occupe)
DATABASE_URL="postgresql://postgres:MOTDEPASSE@db:5432/owly?schema=public"

# URL de l'app
NEXT_PUBLIC_APP_URL="https://bot.mondomaine.com"

# Secrets (générer avec: openssl rand -base64 32)
JWT_SECRET="TON_SECRET_JWT"
WEBHOOK_SECRET="TON_SECRET_WEBHOOK"

# AI (au moins un requis)
OPENAI_API_KEY="sk-..."

# WhatsApp
WHATSAPP_VERIFY_TOKEN="TOKEN_VERIFICATION"
WHATSAPP_SHARE_TOKEN="TOKEN_PARTAGE"
WHATSAPP_API_KEY="TOKEN_API"

# Optionnel: Telegram
# TELEGRAM_BOT_TOKEN="123456:ABC-..."
# TELEGRAM_WEBHOOK_URL="https://bot.mondomaine.com/api/telegram/webhook"
```

### 3.4 Créer les répertoires nécessaires

```bash
mkdir -p data/whatsapp
mkdir -p /backups/owly
```

### 3.5 Démarrer les containers

```bash
docker compose up -d        # Première fois : build + start
# ou
docker compose --env-file .env up -d
```

### 3.6 Vérifier le démarrage

```bash
# Statut
docker compose ps

# Logs
docker compose logs -f app

# Santé
curl http://localhost:3000/api/health
```

### 3.7 Migrations Prisma

```bash
docker compose exec app npx prisma migrate deploy
```

---

## 4. Configuration CWP (Option A)

Quand CWP (CentOS Web Panel) est détecté, Caddy est désactivé. CWP fait office de reverse proxy HTTPS.

### 4.1 Créer le subdomain dans CWP

1. Connecte-toi à **CWP Admin** (`https://ip-serveur:2030`)
2. **Domains** → **Subdomains** → Ajouter :
   - Subdomain : `bot`
   - Domain : `mondomaine.com`
   - Document Root : `/opt/owly` (ou `/home/USER/public_html/bot`)
3. Cliquer **Create**

### 4.2 Reverse Proxy Apache

1. **WebServer** → **Apache Settings** → **Apache Reverse Proxy**
2. Ajouter :

```
https://bot.mondomaine.com -> http://127.0.0.1:3000
```

3. Sauvegarder et redémarrer Apache :
   ```bash
   systemctl restart httpd
   ```

### 4.3 Alternative : VHost Apache manuel

```apache
# /etc/httpd/conf.d/bot.mondomaine.com.conf
<VirtualHost *:80>
    ServerName bot.mondomaine.com
    ServerAlias bot.mondomaine.com
    
    SSLProxyEngine on
    ProxyPreserveHost on
    RequestHeader set X-Forwarded-Proto "https"
    
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
    
    ErrorLog /var/log/httpd/bot-error.log
    CustomLog /var/log/httpd/bot-access.log combined
</VirtualHost>
```

Puis :
```bash
systemctl restart httpd
```

---

## 5. Configuration SSL

### Avec CWP (recommandé)

1. **DNS** → Vérifier que `bot.mondomaine.com` pointe vers l'IP du VPS
2. **SSL Certificates** → **Let's Encrypt**
3. Sélectionner `bot.mondomaine.com`
4. Cocher **AutoSSL**
5. Cliquer **Request Certificate**

CWP gère automatiquement le renouvellement.

### Sans CWP (Caddy)

Caddy demande automatiquement un certificat Let's Encrypt au premier accès HTTPS. Aucun action nécessaire.

Pour forcer HTTPS :
```bash
# Vérifier que Caddyfile contient bien :
bot.mondomaine.com {
    reverse_proxy localhost:3000
}
```

---

## 6. Connexion WhatsApp

Une fois l'app accessible via HTTPS :

1. Ouvrir : `https://bot.mondomaine.com/whatsapp-setup`
2. Scanner le QR code avec le téléphone WhatsApp
3. Attendre confirmation "WhatsApp connected"
4. Envoyer un message test sur le numéro

### Vérification de la connexion

```bash
# Voir les logs WhatsApp
docker compose logs -f app | grep -i whatsapp

# Statut Baileys
curl http://localhost:3000/api/whatsapp-watch
```

---

## 7. Snapshots stables (fallback)

Le système de snapshots crée chaque jour à 03h00 une image Docker + dump DB rollbackable.

### Activer les snapshots

```bash
cd /opt/owly
bash scripts/setup-snapshot-cron.sh
```

### Commandes utiles

```bash
# Lister les snapshots disponibles
bash scripts/list-snapshots.sh

# Basculer vers un snapshot
bash scripts/switch-to-snapshot.sh owly-stable-2026-09-01

# Voir les images Docker tagguées
docker images owly-app | grep stable
```

Pour plus de détails : voir [`docs/STABLE_FALLBACK.md`](./STABLE_FALLBACK.md)

---

## 8. Commandes utiles

```bash
# Redémarrer l'app
docker compose restart app

# Voir les logs
docker compose logs -f         # tous les services
docker compose logs -f app     # uniquement l'app
docker compose logs -f db      # uniquement la DB

# Shell dans le container
docker compose exec app sh

# Accès DB
docker compose exec db psql -U postgres -d owly

# Reconstruire l'image
docker compose build app
docker compose up -d app

# Saisie manuelle Prisma
docker compose exec app npx prisma studio

# Voir les containers actifs
docker compose ps

# Mettre à jour (git pull + rebuild)
cd /opt/owly
git pull origin main
docker compose build app
docker compose up -d app
docker compose exec app npx prisma migrate deploy
```

---

## 9. Dépannage

### L'app ne démarre pas

```bash
# Voir les logs
docker compose logs app

# Cause fréquente : variable manquante dans .env
docker compose exec app env | grep -E "OPENAI|DATABASE|JWT"
```

### La DB ne répond pas

```bash
# Vérifier que le container db tourne
docker compose ps db

# Logs DB
docker compose logs db

# Test connexion
docker compose exec db pg_isready -U postgres

# Reset DB (⚠️ perte de données)
docker compose down -v    # supprime les volumes
docker compose up -d db   # recrée la DB vide
docker compose exec app npx prisma migrate deploy
```

### Caddy ne donne pas d'HTTPS

```bash
# Vérifier le Caddyfile
cat Caddyfile

# Logs Caddy
docker compose logs caddy

# Forcer reload
docker compose exec caddy caddy reload
```

### WhatsApp déconnecté

```bash
# Voir les logs Baileys
docker compose logs app | grep -i baileys

# Re-scanner le QR
# → https://bot.mondomaine.com/whatsapp-setup
```

### Port 3000 déjà utilisé

```bash
# Trouver le processus
ss -tlnp | grep 3000

# Tuer si c'est un conflit
kill -9 <PID>
```

### Le cron des snapshots ne fonctionne pas

```bash
# Vérifier l'installation du cron
crontab -l | grep owly

# Exécuter manuellement
bash /opt/owly/scripts/snapshot-stable.sh

# Logs cron
grep owly /var/log/cron
```

### Besoin d'aide

1. Consulter [`docs/STABLE_FALLBACK.md`](./STABLE_FALLBACK.md) pour le fallback
2. Voir les logs : `docker compose logs -f`
3. Vérifier la santé : `curl http://localhost:3000/api/health`
