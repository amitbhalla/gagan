==================================================
SERVER INFORMATION REPORT
==================================================

=== 1. SYSTEM INFORMATION ===
OS Version:
PRETTY_NAME="Ubuntu 24.04.3 LTS"
VERSION_ID="24.04"

Kernel:
6.14.0-1016-gcp

Hostname:
n8n-website-01.asia-south1-b.c.mynd-prod-website.internal

=== 2. RESOURCE USAGE ===
CPU Info:
CPU(s):                                  2
On-line CPU(s) list:                     0,1
Model name:                              AMD EPYC 7B13
BIOS Model name:                           CPU @ 2.0GHz
Thread(s) per core:                      2
NUMA node0 CPU(s):                       0,1

Memory:
               total        used        free      shared  buff/cache   available
Mem:           7.8Gi       1.1Gi       691Mi       1.2Mi       6.3Gi       6.7Gi
Swap:             0B          0B          0B

Disk Usage:
Filesystem      Size  Used Avail Use% Mounted on
/dev/root        48G  7.6G   40G  16% /

=== 3. NETWORK & PORTS ===
IP Address:
    inet 10.90.30.17/32 metric 100 scope global dynamic ens4

Open Ports:
tcp        0      0 0.0.0.0:20202           0.0.0.0:*               LISTEN      2709/fluent-bit     
tcp        0      0 0.0.0.0:443             0.0.0.0:*               LISTEN      26264/nginx: master 
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      1/init              
tcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN      26264/nginx: master 
tcp        0      0 127.0.0.53:53           0.0.0.0:*               LISTEN      369/systemd-resolve 
tcp        0      0 127.0.0.54:53           0.0.0.0:*               LISTEN      369/systemd-resolve 
tcp6       0      0 :::20201                :::*                    LISTEN      2702/otelopscol     
tcp6       0      0 :::22                   :::*                    LISTEN      1/init              
tcp6       0      0 :::5678                 :::*                    LISTEN      694541/node         

=== 4. NGINX CONFIGURATION ===
Nginx Version:
nginx version: nginx/1.24.0 (Ubuntu)

Nginx Status:
     Loaded: loaded (/usr/lib/systemd/system/nginx.service; enabled; preset: enabled)
     Active: active (running) since Fri 2025-10-03 15:44:12 UTC; 3 weeks 4 days ago
Warning: The unit file, source configuration file or drop-ins of nginx.service changed on disk. Run 'systemctl daemon-reload' to reload units.

Nginx Sites Enabled:
total 8
drwxr-xr-x 2 root root 4096 Oct  3 15:43 .
drwxr-xr-x 8 root root 4096 Oct  3 15:13 ..
lrwxrwxrwx 1 root root   30 Oct  3 15:43 n8n -> /etc/nginx/sites-available/n8n

Nginx Config Files:
total 16
drwxr-xr-x 2 root root 4096 Oct  3 15:43 .
drwxr-xr-x 8 root root 4096 Oct  3 15:13 ..
-rw-r--r-- 1 root root 2412 Nov 30  2023 default
-rw-r--r-- 1 root root 1451 Oct  3 15:43 n8n

=== 5. EXISTING APPLICATIONS ===
Running Node.js Processes:
n8n       694541  0.0  5.3 23073596 431404 ?     Ssl  Oct15  11:17 node /usr/bin/n8n start

PM2 Processes (if installed):
PM2 not installed or no processes

Application Directories:
total 12
drwxr-xr-x  3 root root 4096 Oct  3 15:13 .
drwxr-xr-x 14 root root 4096 Oct  3 15:13 ..
drwxr-xr-x  2 root root 4096 Oct  3 15:13 html

=== 6. NODE.JS & NPM ===
Node.js Version:
v20.19.5

NPM Version:
10.8.2

NVM Installation:
NVM not found

=== 7. DATABASE ===
SQLite:
3.45.1 2024-01-30 16:01:20 e876e51a0ed5c5b3126f52e532044363a014bc594cfefa87ffb5b82257ccalt1 (64-bit)

MySQL/MariaDB:
MySQL not installed

PostgreSQL:
PostgreSQL not installed

=== 8. SSL CERTIFICATES ===
Certbot Version:
certbot 2.9.0

Existing Certificates:

- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
No certificates found.
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

=== 9. FIREWALL STATUS ===
UFW Status:
Status: active
Logging: on (low)
Default: deny (incoming), allow (outgoing), disabled (routed)
New profiles: skip

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW IN    Anywhere                  
80/tcp                     ALLOW IN    Anywhere                  
443/tcp                    ALLOW IN    Anywhere                  
22/tcp (v6)                ALLOW IN    Anywhere (v6)             
80/tcp (v6)                ALLOW IN    Anywhere (v6)             
443/tcp (v6)               ALLOW IN    Anywhere (v6)             


=== 10. GIT CONFIGURATION ===
Git Version:
git version 2.43.0

Git Config:
No global git config

=== 11. AVAILABLE DISK SPACE ===
Disk Space:
Filesystem      Size  Used Avail Use% Mounted on
/dev/root        48G  7.6G   40G  16% /

=== 12. CURRENT USER & PERMISSIONS ===
Current User:
root

Groups:
root google-sudoers

Sudo Access:
User root may run the following commands on n8n-website-01:
    (ALL : ALL) NOPASSWD: ALL

==================================================
END OF REPORT
==================================================

Please share this output for deployment planning.
root@n8n-website-01:~# 
