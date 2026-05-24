#!/bin/bash
set -e

# Update apt and install prerequisites
apt-get update
apt-get install -y ca-certificates curl gnupg

# Add GPG Key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
chmod a+r /etc/apt/keyrings/docker.gpg

# Add Repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list

# Update and install Docker
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Check and start docker daemon
service docker start
docker run hello-world
