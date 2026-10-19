# 接入腾讯云 TTS（方案文档 · 待审核）

> 状态：**草稿，未实施**
> 作者：哪吒（AI）
> 日期：2026-10-19
> 目标：为 LingoEcho 增加腾讯云语音合成引擎，作为 Edge TTS 之外的稳定云端备选

---

## 1. 背景

- Microsoft Edge TTS 是非公开协议，2026-10 因微软升级 `Sec-MS-GEC` 到 v2 而全面 504，已修复但**未来仍可能再变**（见 `docs/edge-tts-gec-v2-fix.md`）。
- 现有备用引擎 MiniMax **余额不足**（线上实测 `{"error":"insufficient balance"}`）；GLM 需要额外 key。
- 主人已领取腾讯云语音合成免费资源包 → 需要一个**官方、稳定、有 SLA** 的备选。

## 2. 腾讯云 TTS 接口结论（已核实官方文档）

**形态**：标准腾讯云「云 API 3.0」，HTTPS + JSON，**无需下载 SDK**（SDK 只是封装）。

| 项 | 值 |
|---|---|
| 端点 | `POST https://tts.tencentcloudapi.com` |
| Action | `TextToVoice` |
| Version | `2019-08-23` |
| 鉴权 | `TC3-HMAC-SHA256` 签名（自定义实现，约 40 行） |
| Region | 可选（不传走默认） |

**请求体关键参数**

| 参数 | 说明 |
|---|---|
| `Text` | 源文本。**中文 ≤150 字，英文 ≤500 字母** |
| `SessionId` | 建议传 uuid，防重复 |
| `VoiceType` | 音色 ID（整数） |
| `PrimaryLanguage` | 1=中文（默认）, 2=英文 |
| `Codec` | `mp3`（本方案固定） |
| `SampleRate` | 24000 / 16000 / 8000 |
| `Speed` | 语速，范围 `[-2,6]`（见 §5 映射） |
| `Volume` | 音量，范围 `[-10,10]` |

**响应**：`Response.Audio` = base64 编码的音频；`Response.RequestId`。

**错误码**（与本项目相关的）

| 错误码 | 含义 | 建议映射 |
|---|---|---|
| `UnsupportedOperation.NoFreeAccount` / `PkgExhausted` | 免费包用尽 / 资源包用尽 | 503 + 明确提示"腾讯云额度用尽" |
| `UnsupportedOperation.ServerNotOpen` | 服务未开通 | 503 + "需在控制台开通 TTS" |
| `UnsupportedOperation.AccountArrears` | 欠费 | 503 |
| `RequestLimitExceeded` / `LimitExceeded.AccessLimit` | 限流 | 429 |
| `InvalidParameterValue.*` | 参数错误 | 400 |
| `InternalError.*` | 服务端错误 | 502 |

## 3. 改动清单

沿用现有 `server/` + `api/` 结构，**不引入新依赖**（`node:crypto` 已够）。

| 文件 | 改动 |
|---|---|
| **新增** `server/tencentTts.ts` | TC3 签名 + `TextToVoice` 调用 + base64 解码 + 长文本切分 |
| **新增** `api/tts-tencent.ts` | 与 `tts-edge` 完全一致的接口契约 |
| 改 `api/tts-available.ts` | 增加 `tencent` 探测项，纳入 `preferred` 优先级 |
| 改 `services/geminiService.ts` | `TTSEngine` 加 `'tencent'`；新增 `speakWithTencentTTS`；引擎优先级 |
| 改 `components/StudySession.tsx` | 引擎列表加一项「腾讯云」 |
| 改 `services/geminiService.ts` | 修正 MiniMax 探测（余额不足仍报 true 的问题，见 §7） |
| 改 `README.md` / 新增 `docs/` | 文档 |

## 4. 接口契约（`api/tts-tencent.ts`）

**请求**（与 edge 一致）：
```json
{ "text": "apple", "voice": "101050", "speed": 0.6 }
```

**响应**：
- 成功：`200` + `Content-Type: audio/mpeg` + MP3 二进制
- 失败：JSON `{"error": "..."}`，状态码语义同 edge（400/413/429/503/504/500）

**环境变量**（Vercel）：
```
TENCENT_SECRET_ID   = 必需
TENCENT_SECRET_KEY  = 必需
TENCENT_TTS_VOICE_ZH = 可选，默认音色（中文）
TENCENT_TTS_VOICE_EN = 可选，默认音色（英文）
```

## 5. 语速映射

腾讯云 `Speed` 非线性，采用查表 + 区间夹取：

| 本项目 rate | 腾讯云 Speed |
|---|---|
| 0.6（生词慢速，当前默认） | **-2** |
| 0.8 | -1 |
| 1.0 | 0 |
| 1.2 | 1 |
| 1.5 | 2 |
| 其他 | 按相邻区间线性插值，最终夹到 `[-2,6]` |

> 说明：项目当前传 `speed: 0.6`，意图是「慢速朗读」。腾讯云最小 0.6 倍（Speed=-2），语义一致。

## 6. 音色选择（需你确认）

腾讯云按音色类型分三档，**免费额度不同**，且不同类型价格差异很大：

| 音色类型 | 免费额度 | 付费单价 | 特点 |
|---|---|---|---|
| 精品音色 | **800 万字符** | 0.3 元/万字符 | 中/英各自单语言 |
| 大模型音色 | 10 万字符 | 0.55–1.2 元/万字符 | 支持中英文混读 |
| 超自然大模型音色 | 2 万字符 | 4.9–6.5 元/万字符 | 最自然，最贵 |

**候选音色**（来自官方音色列表，2026-10-09 更新）：

| 用途 | 音色 ID | 名称 | 类型 |
|---|---|---|---|
| 英文（精品） | `101050` | WeJack 英文男声 | 精品 |
| 中文（精品） | `101001` | 智瑜 情感女声 | 精品 |
| 中文（精品） | `101011` | 智燕 新闻女声 | 精品 |
| 中英混读（大模型） | `501000` | 智斌 阅读男声 | 大模型 |
| 英文（大模型） | `501008` | WeJames 外语男声 | 大模型 |

**推荐（假设你领的是 800 万精品包）**：
- 中文 → `101001`（智瑜）
- 英文 → `101050`（WeJack）
- 由 `PrimaryLanguage` 按文本自动切换（项目已有中英判断逻辑）

> ⚠️ **需要你确认领的是哪一档资源包**，直接决定选哪组音色。

## 7. 可用性探测（`tts-available`）

改为：

```js
const edge    = await probeEdgeTts(3000);          // 已有
const tencent = !!(process.env.TENCENT_SECRET_ID && process.env.TENCENT_SECRET_KEY);
const minimax = !!(process.env.MINIMAX_API_KEY && /* 新增：最近一次未报余额不足 */);
const glm     = !!process.env.GLM_API_KEY;
const preferred = edge ? 'edge' : tencent ? 'tencent' : minimax ? 'minimax' : glm ? 'glm' : 'local';
```

**顺带修掉的问题**：MiniMax 现在只判断「有没有 key」，实际余额不足也报 `true`。方案：把「最近一次调用失败原因」记在模块级变量里，余额不足时置为不可用（轻量、无额外费用）。

> 腾讯云这里用「key 存在性」判断，不做真实探测——因为真实合成会产生费用。风险：key 无效时会误报可用，但前端已具备失败重试交互，可接受。

## 8. 长文本切分

腾讯云单次限制（中文 150 字 / 英文 500 字母）**比 Edge 严格**。

- 现状：项目发的是 `"word; word; word."`（重复三遍），单词场景不会超。
- 但为稳妥，`server/tencentTts.ts` 内做**按句/按标点切分**，逐段合成后拼接 MP3。
- 复用 `server/edgeTts.ts` 里已有的切分思路（按字节上限切、不切断 UTF-8）。

## 9. 密钥管理

- **不要**把 SecretKey 发到聊天里。
- 生产：在 Vercel 项目 → Settings → Environment Variables 添加 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`。
- 本地验证：我用 `secrets` 工具申请掩码录入（`allowedHosts: ["tts.tencentcloudapi.com"]`），值不经过模型上下文。

## 10. 验证方案（实施后执行）

1. **签名正确性**：对固定输入，比对本地生成签名与官方 API Explorer 结果一致。
2. **本地端到端**：`api/tts-tencent` handler 直接调用，中英文各出一条，`file` 确认 `MPEG ADTS`。
3. **错误路径**：空 text→400、超长→413、无 key→503。
4. **契约回归**：`api/tts-edge` / `api/ocr` 不受影响。
5. **线上**：部署后 `curl` 三个端点，确认引擎列表含腾讯云且能出声。

## 11. 风险

| 风险 | 应对 |
|---|---|
| 免费额度用尽 | 返回明确错误码 + 前端提示；付费 0.3 元/万字符很便宜 |
| 单次文本上限更严 | 内置切分 |
| 签名实现出错 | 用 API Explorer 对照验证 |
| key 泄漏 | 只在服务端 env，不进 git，不进前端 bundle |
| 引擎误报可用 | 前端已有失败重试；后续可加自动降级 |

## 12. 需要你确认

1. **领的是哪档资源包？**（精品 800 万 / 大模型 10 万 / 超自然 2 万）→ 决定音色
2. **默认音色**用我推荐的（中文 101001 / 英文 101050）还是你指定？
3. **引擎优先级**：`Edge → 腾讯云 → MiniMax → GLM → 本地`，认可吗？
4. 是否**顺带修 MiniMax 余额误报**？
5. 是否要**自动降级**（某引擎失败自动换下一个），还是保持现在的「失败显示重试」？
