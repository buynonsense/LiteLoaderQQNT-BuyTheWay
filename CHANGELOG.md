# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-05-25

### 🔧 Fixed
- **[CRITICAL]** 修复图片路径生成重复拼接问题
  - 解决了生成错误路径 `C:\...\Thumb\C:\...\Ori\filename_720.png` 的问题
  - 实现正确的 Ori→Thumb 目录替换逻辑
- **[CRITICAL]** 修复图片扩展名硬编码问题
  - 支持 QQ 缩略图的 `.jpg` 和 `.png` 两种随机格式
  - 为每个分辨率变体生成双扩展名路径
- **[MAJOR]** 修复 QQ 后台运行时图片转发失败问题
  - 优化图片文件访问逻辑
  - 改进文件就绪检测机制

### ✨ Added
- **多路径变体生成策略**
  - 按优先级生成多个可能的缩略图路径（720p, 480p, 200p, 0p）
  - 智能扩展名检测（.jpg/.png）
  - 优雅的回退机制
- **增强的图片处理工具**
  - 内嵌 ImagePathResolver 和 MessageChainProcessor
  - 异步文件访问验证 API
  - 详细的调试日志输出

### 🚀 Improved
- **图片转发性能优化**
  - 并行路径变体检查
  - 减少文件访问等待时间
  - 提高图片处理成功率
- **代码质量提升**
  - 避免动态脚本加载问题
  - 改进错误处理和容错机制
  - 更稳定的插件启动流程

### 🛠️ Technical
- 重构 `generatePathVariants` 方法
- 添加 `checkFileExists` IPC API
- 优化路径解析和标准化算法
- 改进 Windows 路径兼容性

## [1.0.0] - 2025-05-XX

### ✨ Added
- 初始版本发布
- QQ 消息监听和关键词匹配
- 邮件转发功能
- QQ 好友和群聊转发功能
- 基本的图片处理支持
- 可视化配置界面
- 消息格式模板系统

### 🎯 Features
- Euphony 消息链处理
- 多种消息格式模板
- 配置导入导出功能
- 实时消息转发
- 关键词过滤机制