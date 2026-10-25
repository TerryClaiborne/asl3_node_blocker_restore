# ASL3 Node Blocker & Restore

ASL3 Node Blocker & Restore is a browser-based utility for AllStarLink 3 nodes.

It provides a quick way to see current connections, identify keyed nodes, disconnect a connection, block a problem AllStar node from reconnecting, and restore access later.

## Features

- Live connected-node display
- Keyed Now display
- Disconnect a connected node without blocking it
- Disconnect Web Transceiver connections
- Disconnect & Block numeric AllStar nodes
- Restore blocked nodes
- Manual block by node number
- Optional administrator password
- Light, dark, and automatic themes
- Desktop and cellphone friendly
- Automatic local ASL3 node detection
- Update notification star that pulses when a newer GitHub version is available


## Screenshots

<p align="center">
  <a href="screenshot-dark.png"><img src="screenshot-dark.png" alt="ASL3 Node Blocker & Restore dark theme" width="850"></a>
</p>

<p align="center">
  <a href="screenshot-light.png"><img src="screenshot-light.png" alt="ASL3 Node Blocker & Restore light theme" width="850"></a>
</p>

## Requirements

Tested and working on:

- AllStarLink 3
- Debian 13 (Trixie)
- Apache 2
- PHP 8.x

## First-Time Installation

```bash
cd /var/www/html
sudo git clone https://github.com/TerryClaiborne/asl3_node_blocker_restore.git asl3_blocker
cd asl3_blocker
sudo ./setup_asl3_node_blocker_restore.sh
```

When setup completes, it will display the browser address.

Example:

```text
http://<NODE-IP>/blocker/
```

Open that address in a browser.

## Administrator Login

Login is optional and is disabled by default.

To set an administrator password and enable login:

```bash
sudo /var/www/html/asl3_blocker/setup_asl3_node_blocker_restore.sh --set-admin-password
```

Open the Blocker page, click **Login**, and enter the administrator password. The login page asks for the password only.

The administrator user is:

```text
admin
```

Re-enable login using the saved password hash:

```bash
sudo /var/www/html/asl3_blocker/setup_asl3_node_blocker_restore.sh --enable-auth
```

Disable login while preserving the saved password hash:

```bash
sudo /var/www/html/asl3_blocker/setup_asl3_node_blocker_restore.sh --disable-auth
```

## config.ini

The installer creates the local configuration file:

```text
/var/www/html/asl3_blocker/config.ini
```

The login setting is controlled by:

```text
ASL3_BLOCKER_AUTH_ENABLED=0
```

`0` means login is disabled.

```text
ASL3_BLOCKER_AUTH_ENABLED=1
```

`1` means login is enabled.

The file also stores the detected local node number, administrator user, and saved password hash.

`config.ini` is local/private configuration and **must not be uploaded or committed to GitHub**. It is already excluded by the repository `.gitignore`.

## Updating an Existing Installation

```bash
cd /var/www/html/asl3_blocker
sudo git pull origin main
sudo ./setup_asl3_node_blocker_restore.sh
```

Existing local settings and the administrator password are preserved during updates.

## Uninstall

```bash
sudo /var/www/html/asl3_blocker/setup_asl3_node_blocker_restore.sh --uninstall
```

## Version

Current version:

```text
1.0.0
```
