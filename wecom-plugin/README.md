# OpenClaw + 企业微信

> 智能机器人通过长链接关联OpenClaw

---

## 快速开始

```shell
# 安装企微插件
openclaw plugins install @wecom/wecom-openclaw-plugin

# 更新插件
openclaw plugins update wecom

# 最小化配置
openclaw config set channels.wecom.botId <替换成你的智能机器人botid> && openclaw config set channels.wecom.secret <替换成你的智能机器人secret> && openclaw config set channels.wecom.enabled true && openclaw gateway restart
```
