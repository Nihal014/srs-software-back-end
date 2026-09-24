# RSR Bakes — production server setup (DigitalOcean, one Droplet)

Result: `https://erp.rsrbakes.in` served by one Ubuntu Droplet running nginx (Angular + `/api` proxy),
NestJS under pm2, and MySQL on the same machine. Nightly DB backups.

Replace `SERVER_IP` with the Droplet's public IP everywhere below.

---

## 1. Create the Droplet (DigitalOcean website)
- Image **Ubuntu 24.04 LTS**, plan **Basic → Regular, 1 GB RAM / 1 vCPU (~$6/mo)**. 1 GB is enough for this app *only with* the swap file (step 4) and MySQL memory limit (step 5). If it ever feels slow or `pm2 status` shows restarts from memory, resize to the 2 GB plan ($12) from the Droplet's Resize tab.
- Region **Bangalore (BLR1)**.
- Authentication: **SSH key** (not password). On your laptop, in Git Bash: `ssh-keygen -t ed25519`, then paste the contents of `~/.ssh/id_ed25519.pub` into DigitalOcean.
- Turn on **Daily Backups** (+$1.80/mo, keeps 7 days) — a second safety net on top of the nightly DB dump.
- Name it `rsr-prod`.

## 2. Point the domain at it (GoDaddy → DNS)
Add an **A record**: Host `erp`, Points to `SERVER_IP`, TTL 600. Wait a few minutes, then `ping erp.rsrbakes.in` should show `SERVER_IP`.

## 3. First login and lock-down
```bash
ssh root@SERVER_IP
adduser deploy                      # choose a password; you'll need it for sudo
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy   # lets you log in as deploy with the same key
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```
Open a **second** terminal and check `ssh deploy@SERVER_IP` works before continuing. Then, as `deploy`:
```bash
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/; s/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

## 4. Install software (as `deploy`)
```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install nginx mysql-server git certbot python3-certbot-nginx unattended-upgrades
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs
sudo npm i -g pm2
```

**Add swap (needed on a 1 GB server):**
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h        # Swap should show 2.0Gi
```

## 5. MySQL
```bash
sudo mysql_secure_installation      # remove anonymous users/test db; disallow remote root
sudo mysql
```
```sql
CREATE DATABASE rsr_bakes CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'rsr_bakes_app'@'localhost' IDENTIFIED BY 'PUT-A-LONG-RANDOM-PASSWORD-HERE';
GRANT ALL PRIVILEGES ON rsr_bakes.* TO 'rsr_bakes_app'@'localhost';
EXIT;
```
Keep MySQL's memory small (fine for a small business, and essential on 1 GB). Create `/etc/mysql/conf.d/rsr.cnf`:
```
[mysqld]
performance_schema = OFF
innodb_buffer_pool_size = 192M
max_connections = 40
```
then `sudo systemctl restart mysql`.

MySQL listens only on localhost by default — keep it that way (the firewall also blocks 3306).

## 6. Backend
GitHub access: the repo is private, so give the server a read-only **deploy key**:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub         # add at GitHub → srs-software-back-end → Settings → Deploy keys (read-only)
printf 'Host github.com\n  IdentityFile ~/.ssh/github_deploy\n' >> ~/.ssh/config
sudo mkdir -p /srv/rsr && sudo chown deploy:deploy /srv/rsr
git clone git@github.com:Nihal014/srs-software-back-end.git /srv/rsr/backend
cd /srv/rsr/backend
```
Create `.env` (`nano .env`):
```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=rsr_bakes_app
DB_PASSWORD=<the MySQL password from step 5>
DB_NAME=rsr_bakes
FRONTEND_URL=https://erp.rsrbakes.in
PORT=3000
HOST=127.0.0.1
JWT_SECRET=<run: openssl rand -hex 48>
JWT_EXPIRES_IN=12h
```
`chmod 600 .env`. **Never reuse your laptop's JWT_SECRET or DB password here.**
```bash
npm ci && npm run build && npm run migrate
```
**Replace the demo logins** (migration 012 seeds accounts whose passwords are in the repo):
```bash
ADMIN_EMAIL='you@yourmail.com' ADMIN_NAME='Raees A.' ADMIN_PASSWORD='a-long-unique-password' \
  node scripts/set-admin.cjs --remove-sample-data
```
Start the API and make it survive reboots:
```bash
pm2 start deploy/ecosystem.config.cjs && pm2 save
pm2 startup systemd                  # run the command it prints, then: pm2 save
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/auth/me    # expect 401 (API is up)
```

## 7. nginx + HTTPS
```bash
sudo mkdir -p /var/www/releases
sudo chown -R deploy:deploy /var/www
sudo cp /srv/rsr/backend/deploy/nginx-rsrbakes.conf /etc/nginx/sites-available/rsrbakes
sudo ln -s /etc/nginx/sites-available/rsrbakes /etc/nginx/sites-enabled/rsrbakes
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d erp.rsrbakes.in      # choose "redirect HTTP to HTTPS"; renewal is automatic
```

## 8. Publish the frontend (from your laptop, Git Bash, in the frontend folder)
```bash
./deploy/upload.sh deploy@SERVER_IP
```
Open `https://erp.rsrbakes.in` and log in with the admin you set in step 6.

## 9. Nightly backup
```bash
mkdir -p ~/backups/rsrbakes
crontab -e     # add:  15 2 * * * bash /srv/rsr/backend/deploy/backup.sh >> /home/deploy/rsr-backup.log 2>&1
```
Backups go to `~/backups/rsrbakes` and the last 30 days are kept. Test once by running `bash deploy/backup.sh` and
check a `.sql.gz` appears. **Also copy a backup off the server now and then** (`scp`) — a backup on the same disk
does not survive losing the Droplet.

**Restore test (do this once before going live):** `gunzip -c FILE.sql.gz | mysql -u rsr_bakes_app -p some_scratch_db`.

## 10. Routine releases
- Backend: push to `master`, then on the server `cd /srv/rsr/backend && bash deploy/deploy.sh`
  (backs up the DB, pulls, builds, runs new migrations, reloads pm2).
- Frontend: on your laptop `./deploy/upload.sh deploy@SERVER_IP`.
- Deploy the backend first when a release adds API routes, then the frontend.

## Troubleshooting
- `pm2 logs rsr-api` — API errors. `sudo tail -f /var/log/nginx/error.log` — nginx errors.
- 502 Bad Gateway → API not running: `pm2 status`.
- Blank page after a frontend upload → hard refresh (Ctrl+F5); `index.html` is never cached, hashed files are.
