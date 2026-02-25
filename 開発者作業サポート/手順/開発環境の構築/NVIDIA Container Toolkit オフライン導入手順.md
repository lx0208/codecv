# NVIDIA Container Toolkit オフライン導入

## 目的

Docker コンテナ内で `--gpus all` を使用可能にする。

必要なもの：

- nvidia-container-toolkit
- nvidia-container-runtime
- libnvidia-container 関連パッケージ

## A. 有線マシン（インターネット接続あり）で準備

### ① NVIDIA公式リポジトリ追加

```bash
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)

curl -s -L https://nvidia.github.io/libnvidia-container/gpgkey | sudo apt-key add -

curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
```

### ② パッケージ一覧取得

```bash
sudo apt update
```

### ③ 必要なdebをダウンロード（依存込み）

```bash
mkdir -p nvidia-toolkit-offline
cd nvidia-toolkit-offline

sudo apt download \
  nvidia-container-toolkit \
  nvidia-container-toolkit-base \
  nvidia-container-runtime \
  libnvidia-container1 \
  libnvidia-container-tools
```

### ④必要なdocker imageをダウンロード

```bash
sudo docker pull nvidia/cuda:12.9.1-base-ubuntu20.04
sudo docker save -o nvidia_cuda_12.9.1-base-ubuntu20.04.tar nvidia/cuda:12.9.1-base-ubuntu20.04
```



## B. オフラインVM側でインストール

### ① debをVMにscp転送したディレクトリへ移動して、debインストール

```bash
sudo dpkg -i *.deb
```

依存エラーが出た場合：

```bash
sudo apt --fix-broken install --no-download
```

### ② Docker設定反映

```bash
sudo nvidia-ctk runtime configure --runtime=docker
```

### ③ Docker再起動

```bash
sudo systemctl restart docker
```

###  動作確認

```bash
sudo docker info | grep -i runtime
```

出力例：

Runtimes: io.containerd.runc.v2 **nvidia runc**

### GPU確認テスト：

ホスト側CUDAバージョン確認

```bash
nvidia-smi
```

出力例:

```
+-----------------------------------------------------------------------------------------+
| NVIDIA-SMI 590.57                 Driver Version: 591.86         CUDA Version: 13.1     |
+-----------------------------------------+------------------------+----------------------+
```

※ ここで表示される「CUDA Version」は
 **ドライバがサポート可能な最大CUDAバージョン**です。

オフラインVMでイメージ読み込み

```bash
sudo docker load -i nvidia_cuda_12.9.1-base-ubuntu20.04.tar
sudo docker run --rm --gpus all nvidia/cuda:12.9.1-base-ubuntu20.04 nvidia-smi
```

出力例:

```
Wed Feb 25 16:28:23 2026       
+-----------------------------------------------------------------------------------------+
| NVIDIA-SMI 590.57                 Driver Version: 591.86         CUDA Version: 13.1     |
+-----------------------------------------+------------------------+----------------------+
```

