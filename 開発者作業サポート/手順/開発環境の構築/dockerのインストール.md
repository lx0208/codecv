# Docker オフラインインストール

> 下記はUbuntu環境向けのDockerオフラインインストール手順です


## 1. システム確認

```bash
cat /etc/os-release
```

出力例：

```
ID=ubuntu
VERSION_ID="20.04"
UBUNTU_CODENAME=focal
```

※このバージョンを必ずメモしてください（例：24.04 / 22.04/ 20.04）

## 2. debパッケージのダウンロード

### 2-1 Dockerダウンロードサイトへアクセス

```
https://download.docker.com/linux/ubuntu/dists/
```

### 2-2 Ubuntuのバージョンを選択

※ `cat /etc/os-release` の`UBUNTU_CODENAME`で事前確認してください。

### 2-3 アーキテクチャを選択

`pool/stable/`に移動し、該当するアーキテクチャ(amd64、armhf、arm64、または s390x)を選択します。
Linuxで自分のアーキテクチャを確認する。

```bash
uname -m
```

| 出力結果 | Docker表記 |
| -------- | ---------- |
| x86_64   | amd64      |
| aarch64  | arm64      |
| armv7l   | armhf      |
| s390x    | s390x      |

### 2-4 必要なdebパッケージをダウンロード

以下のパッケージをすべてダウンロードします：

- containerd.io_<version>_<arch>.deb
- docker-ce_<version>_<arch>.deb
- docker-ce-cli_<version>_<arch>.deb
- docker-buildx-plugin_<version>_<arch>.deb
- docker-compose-plugin_<version>_<arch>.deb

## 3. debパッケージのインストール

debパッケージをVMへ転送（scp使用）、転送先ディレクトリで以下を実行します：

```bash
sudo dpkg -i ./containerd.io_<version>_<arch>.deb \
./docker-ce_<version>_<arch>.deb \
./docker-ce-cli_<version>_<arch>.deb \
./docker-buildx-plugin_<version>_<arch>.deb \
./docker-compose-plugin_<version>_<arch>.deb
```

### 4. Dockerサービスの起動

```bash
sudo systemctl enable docker
sudo systemctl start docker
```

動作確認：

```bash
sudo docker version
sudo docker compose version
```
