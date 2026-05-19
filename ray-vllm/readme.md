# 1. dgx1
docker compose -f docker-compose.ray-head.yml up -d

# 2. dgx2
docker compose -f docker-compose.ray-worker.yml up -d

# 3. dgx1
docker compose -f docker-compose.vllm-api.yml up -d


## ray status
docker exec -it ray-head ray status

## vllm api

curl http://192.168.20.10:8000/v1/models

curl http://192.168.20.10:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "/workspace/aimodels/gemma-4-26b-a4b-it",
    "messages": [
      {"role": "user", "content": "用一句话介绍 DGX Spark。"}
    ],
    "temperature": 0.2,
    "max_tokens": 128
  }'


## shiyo

```
ray-head:
  --num-gpus=0
  只做调度控制面

vllm-api:
  --num-gpus=1
  使用 dgx1 GPU
  同时作为 vLLM driver/API server

ray-worker:
  --num-gpus=1
  使用 dgx2 GPU
```