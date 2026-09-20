#!/usr/bin/env python3
"""Provision this application's users, credentials and systemd services on Ubuntu.
Run as root AFTER copying the built release and installing documented packages.
Existing config is retained. No CLI credentials are imported.
"""
import os, pathlib, pwd, secrets, subprocess
if os.geteuid() != 0: raise SystemExit('Server provisioning requires root.')
root = pathlib.Path('/opt/ai-artist-studio')
config = pathlib.Path('/etc/artist-studio')
config.mkdir(mode=0o755, exist_ok=True)
for username in ['artist-studio','artist-runner']:
    try: pwd.getpwnam(username)
    except KeyError: subprocess.run(['useradd','--system','--create-home','--home-dir','/var/lib/'+username,'--shell','/usr/sbin/nologin',username],check=True)
def save_secret(file, text, user):
    file.write_text(text); file.chmod(0o640)
    os.chown(file,0,pwd.getpwnam(user).pw_gid)
web = config/'web.env'
if not web.exists():
    password=secrets.token_hex(32); token=secrets.token_hex(32); setup=secrets.token_urlsafe(32)
    sql=f"CREATE USER artist_studio WITH PASSWORD '{password}';\nCREATE DATABASE artist_studio OWNER artist_studio;\n"
    subprocess.run(['runuser','-u','postgres','--','psql','-v','ON_ERROR_STOP=1'],input=sql,text=True,check=True,stdout=subprocess.DEVNULL)
    save_secret(web,f'DATABASE_URL=postgresql://artist_studio:{password}@127.0.0.1:5432/artist_studio\nREDIS_URL=redis://127.0.0.1:6379\nQUEUE_NAME=artist-studio\nAPP_ORIGIN=https://artist.dorfspy.de\nSTORAGE_ROOT=/var/lib/artist-studio/assets\nRUNNER_URL=http://127.0.0.1:3211\nRUNNER_TOKEN={token}\nTOKEN_ENCRYPTION_KEY={secrets.token_hex(32)}\nSETUP_TOKEN={setup}\nNODE_ENV=production\n','artist-studio')
    save_secret(config/'runner.env',f'RUNNER_TOKEN={token}\nRUNNER_AUTH_ROOT=/var/lib/artist-runner/auth\nRUNNER_ISOLATE_BIN=/opt/ai-artist-studio/studio-isolate\nRUNNER_CLI_ROOT=/opt/artist-cli/node_modules\nRUNNER_BIND=127.0.0.1\nRUNNER_PORT=3211\nCLI_TIMEOUT_MS=180000\nNODE_ENV=production\nPATH=/opt/artist-cli/node_modules/.bin:/usr/local/bin:/usr/bin:/bin\n','artist-runner')
for directory, username in [('/var/lib/artist-studio/assets','artist-studio'),('/var/lib/artist-runner/auth','artist-runner')]:
    p=pathlib.Path(directory);p.mkdir(parents=True,exist_ok=True);p.chmod(0o700);u=pwd.getpwnam(username);os.chown(p,u.pw_uid,u.pw_gid)
subprocess.run(['cc','-O2',str(root/'src/runner/isolate.c'),'-o',str(root/'studio-isolate')],check=True)
units={
 'web':('artist-studio','web.env','/usr/local/bin/node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3210','512M'),
 'worker':('artist-studio','web.env','/usr/local/bin/node --import tsx src/worker/main.ts','1G'),
 'runner':('artist-runner','runner.env','/usr/local/bin/node --import tsx src/runner/main.ts','1G')}
for name,(user,env,command,memory) in units.items():
    text=f'''[Unit]
Description=AI Artist Studio {name}
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target

[Service]
Type=simple
User={user}
Group={user}
WorkingDirectory=/opt/ai-artist-studio
EnvironmentFile=/etc/artist-studio/{env}
ExecStart={command}
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
KillMode=control-group
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/{user}
RestrictSUIDSGID=true
LockPersonality=true
LimitCORE=0
TasksMax=150
MemoryMax={memory}
CPUQuota={'150%' if name=='worker' else '100%'}

[Install]
WantedBy=multi-user.target
'''
    pathlib.Path('/etc/systemd/system/artist-studio-'+name+'.service').write_text(text)
env=os.environ.copy()
for line in web.read_text().splitlines():
    k,v=line.split('=',1);env[k]=v
subprocess.run(['runuser','-u','artist-studio','--','/usr/local/bin/node','--import','tsx','scripts/migrate.ts'],cwd=root,env=env,check=True)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now',*['artist-studio-'+n for n in units]],check=True)
print('Application provisioned. First-setup token is in /etc/artist-studio/web.env (protected).')
