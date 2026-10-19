# Edge TTS Sec-MS-GEC v2 修复记录

## 背景与根因

2026 年 10 月，`POST /api/tts-edge` 会在 55 秒后稳定返回 504。网络和 Microsoft 语音服务本身均正常；同机运行 Python `edge-tts` 7.3.1 可以成功合成，而项目使用的 `edge-tts-universal` 1.4.0 无法完成 WebSocket 握手。

服务端已经要求 `Sec-MS-GEC-Version: 2-143.0.3650.75`。v2 token 的格式是 `<16 hex CS64>-<64 hex SHA256>`，其中 CS64 和 SHA-256 状态初始化均为 Microsoft 的定制算法。旧 JS 库仍发送 v1 版本和普通 SHA-256 token，因此握手返回 HTTP 403。该库没有直接处理 `ws` 的 `unexpected-response` 事件；即使后续 `error` 被加入内部队列，等待 `open` 的 Promise 也不会被拒绝或唤醒，最终表现为挂起并触发 API 外层 55 秒超时。

## 修复方式

- 以 LGPL-3.0-or-later 的 Python [`edge-tts`](https://github.com/rany2/edge-tts) 7.3.1 `drm.py` 为权威参考，将 v2 token 算法逐行移植到 `server/edgeTtsGec.ts`，并在源码保留来源与 SPDX 标识。
- 用 `ws` 实现项目所需的最小 Node.js 客户端，发送 `speech.config` 和 SSML、解析 `Path:audio` 二进制帧，并在 `Path:turn.end` 后返回 MP3。
- 显式处理 `unexpected-response`、连接错误、提前关闭和总超时；遇到带 `Date` 响应头的 403 时校正时钟并重试一次。
- 移除 `edge-tts-universal`，将已经间接使用的轻量 `ws` 提升为直接依赖，避免补丁在重装依赖后丢失。
- `/api/tts-available` 使用带 v2 token 的 WebSocket 握手做 3 秒实时探测，不再无条件报告 Edge 可用；前端会提前缓存探测结果并在 Edge 不可用时选择已配置的备用引擎或本地语音。

`/api/tts-edge` 保持 Vercel Node.js runtime。不要将它切换到 Edge Runtime，因为当前实现依赖 Node.js 的 `ws`、`Buffer` 和 `node:crypto`。

## 维护提示

Chromium 版本、`Sec-MS-GEC-Version`、Trusted Client Token、Origin 或摘要算法都属于 Microsoft 的非公开协议，未来可能再次变化。若出现握手 403，应优先与最新 Python `edge-tts` 的 `constants.py`、`drm.py` 和 `communicate.py` 对照。固定时间戳下，TypeScript 与 Python 生成的 token 必须完全一致，再继续排查 wire protocol。
