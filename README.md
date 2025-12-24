# LingoEcho - 极简语音背单词助手

LingoEcho 是一款专为高效记忆单词设计的极简 Web 应用。它结合了智谱 AI (GLM) 和 Azure 神经网络语音的强大能力，提供清新的交互体验。

## ✨ 功能特性

- **🌿 清新设计**：基于 Plus Jakarta Sans 字体与现代毛玻璃质感 UI。
- **🤖 多引擎驱动**：
  - **Azure-TTS (顶级音质)**：集成微软神经网络语音，细腻真人感。
  - **GLM-TTS (云端语音)**：使用智谱 `glm-tts` 引擎，支持移动端播报。
  - **Web-TTS (本地离线)**：省流且响应极快。
- **📸 视觉识词**：AI 自动解析教材图片中的单词。

## 🔑 环境变量配置

### 智谱 AI (必须)
- **Variable Name**: `GLM_API_KEY`
- **Value**: 获取自 [bigmodel.cn](https://bigmodel.cn/)。

### Azure 语音 (可选)
- **Variable Name**: `AZURE_API_KEY`
- **Value**: 获取自 Azure 认知服务。
- **Variable Name**: `AZURE_REGION` (可选)
- **Value**: 默认 `eastasia`，需与您的 Key 区域一致。

## 🚀 部署与使用

1. **部署**：推荐使用 Vercel 一键部署并配置上述环境变量。
2. **诊断**：如果听到声音异常，点击主页右上角的“小虫子”图标进入诊断中心测试不同引擎。