// Electron 主进程 与 渲染进程 交互的桥梁
const { contextBridge, ipcRenderer } = require("electron");

// 在window对象下导出可交互的对象
contextBridge.exposeInMainWorld("buy_the_way_api", {
    // === 配置管理 ===
    // 保存配置
    saveConfig: (config) => ipcRenderer.invoke("buy_the_way.saveConfig", config),
    // 读取配置
    loadConfig: () => ipcRenderer.invoke("buy_the_way.loadConfig"),

    // === 邮件通知 ===
    // 发送邮件
    sendEmail: (emailConfig, subject, body, imagePaths = []) => ipcRenderer.invoke("buy_the_way.sendEmail", emailConfig, subject, body, imagePaths),

    // === 消息处理 ===
    // 渲染进程向主进程发送捕获到的消息
    sendMessageToMain: (message) => ipcRenderer.send("buy_the_way.messageFromRenderer", message),
    // 监听主进程推送过来的新消息
    onNewMessage: (callback) => ipcRenderer.on("buy_the_way.newMessage", (event, message) => callback(message)),

    // === 转发功能 ===
    // 监听转发到QQ用户的指令
    onForwardToUsers: (callback) => ipcRenderer.on("buy_the_way.forwardToUsers", (event, data) => callback(data)),
    // 监听转发到群聊的指令
    onForwardToGroups: (callback) => ipcRenderer.on("buy_the_way.forwardToGroups", (event, data) => callback(data)),    // === 其他 ===
    // 打开文件选择对话框 (用于选择 YAML 文件等)
    showOpenDialog: (options) => ipcRenderer.invoke("buy_the_way.showOpenDialog", options),
    // 显示消息提示
    showToast: (message, type = 'info') => ipcRenderer.send("buy_the_way.showToast", message, type),
    // 获取插件路径的 API
    getPluginPath: () => ipcRenderer.invoke("buy_the_way.getPluginPath"),
    // 检查文件是否存在
    checkFileExists: (filePath) => ipcRenderer.invoke("buy_the_way.checkFileExists", filePath)
});
