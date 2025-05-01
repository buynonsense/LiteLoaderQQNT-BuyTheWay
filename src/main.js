const { ipcMain, dialog, BrowserWindow, Notification } = require("electron");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");

// --- 默认设置及更新函数 ---
const defaultSettings = {
    targetProducts: [],
    monitoredGroups: [],
    emailConfig: {
        enabled: false,
        host: '',
        port: 465,
        secure: true,
        auth: {
            user: '',
            pass: ''
        },
        to: ''
    },
    // 添加新的转发配置
    forwardConfig: {
        toUsers: {
            enabled: false,
            users: []  // 要转发到的QQ号列表
        },
        toGroups: {
            enabled: false,
            groups: [] // 要转发到的群号列表
        }
    }
};

/**
 * 使用默认值更新现有设置对象中的缺失键。
 * @param {Object} existingSettings - 需要检查和更新的当前设置对象。
 * @param {Object} defaultSettings - 包含所需键及其默认值的默认设置对象。
 * @returns {boolean} - 如果向现有设置中添加了任何键，则返回 true，否则返回 false。
 */
function updateSettingsWithDefaults(existingSettings, defaults) {
    let updated = false;
    for (const key in defaults) {
        if (!existingSettings.hasOwnProperty(key)) {
            existingSettings[key] = defaults[key];
            updated = true;
        } else if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
            // 递归更新嵌套对象
            if (typeof existingSettings[key] !== 'object' || existingSettings[key] === null) {
                existingSettings[key] = {}; // 如果类型不匹配或为空，则重置为对象
                updated = true;
            }
            if (updateSettingsWithDefaults(existingSettings[key], defaults[key])) {
                updated = true;
            }
        }
    }
    return updated;
}

// --- 持久化配置文件初始化 (参考 GPT-Reply) ---
// 获取并准备插件数据目录和设置文件
const pluginDataPath = LiteLoader.plugins["buy_the_way"].path.data;
const settingsPath = path.join(pluginDataPath, "settings.json");
// 确保数据目录存在
if (!fs.existsSync(pluginDataPath)) {
    fs.mkdirSync(pluginDataPath, { recursive: true });
}
// 初始化设置文件
if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 4), 'utf-8');
}
// 加载并检查默认值
let currentSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
if (updateSettingsWithDefaults(currentSettings, defaultSettings)) {
    fs.writeFileSync(settingsPath, JSON.stringify(currentSettings, null, 4), 'utf-8');
}
// 插件根路径，稍后在 onLoad 设置
let pluginRootPath = null; // 用于存储插件根路径

/**
 * 加载或初始化设置
 */
function loadOrInitSettings() {
    try {
        if (!fs.existsSync(pluginDataPath)) {
            fs.mkdirSync(pluginDataPath, { recursive: true });
            console.log("[BuyTheWay] Plugin data path created:", pluginDataPath);
        }

        if (!fs.existsSync(settingsPath)) {
            console.log("[BuyTheWay] Settings file not found, creating with defaults.");
            currentSettings = JSON.parse(JSON.stringify(defaultSettings)); // 深拷贝默认设置
            fs.writeFileSync(settingsPath, JSON.stringify(currentSettings, null, 4), 'utf-8');
        } else {
            console.log("[BuyTheWay] Loading settings from:", settingsPath);
            const fileContent = fs.readFileSync(settingsPath, 'utf-8');
            currentSettings = JSON.parse(fileContent);

            // 检查并补充缺失的默认值
            if (updateSettingsWithDefaults(currentSettings, defaultSettings)) {
                console.log("[BuyTheWay] Settings updated with new default values.");
                fs.writeFileSync(settingsPath, JSON.stringify(currentSettings, null, 4), 'utf-8');
            }
        }
        console.log("[BuyTheWay] Settings loaded successfully.");
    } catch (error) {
        console.error("[BuyTheWay] Error loading or initializing settings:", error);
        // 加载失败时使用默认设置，防止插件完全失效
        currentSettings = JSON.parse(JSON.stringify(defaultSettings));
        if (Notification.isSupported()) {
            new Notification({ title: 'BuyTheWay 错误', body: `加载配置失败: ${error.message}` }).show();
        }
    }
}

/**
 * 保存设置到文件
 * @param {Object} settingsToSave 要保存的设置对象
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function saveSettingsToFile(settingsToSave) {
    try {
        // 更新内存中的设置缓存
        currentSettings = settingsToSave;
        // 写入文件
        fs.writeFileSync(settingsPath, JSON.stringify(settingsToSave, null, 4), 'utf-8');
        console.log("[BuyTheWay] Settings saved to file:", settingsPath);
        return { success: true };
    } catch (error) {
        console.error("[BuyTheWay] Error saving settings to file:", error);
        return { success: false, error: error.message };
    }
}

// --- IPC 处理程序注册 ---

ipcMain.handle("buy_the_way.getPluginPath", () => {
    console.log(`[BuyTheWay] IPC handle 'getPluginPath' called. Current pluginRootPath: '${pluginRootPath}'`);
    if (pluginRootPath) {
        console.log("[BuyTheWay] IPC getPluginPath returning stored path:", pluginRootPath);
        return pluginRootPath;
    } else {
        console.error("[BuyTheWay] [Error] IPC getPluginPath called but pluginRootPath is null or empty.");
        return null;
    }
});

ipcMain.handle("buy_the_way.saveConfig", async (event, config) => {
    return await saveSettingsToFile(config);
});

ipcMain.handle("buy_the_way.loadConfig", async () => {
    if (!currentSettings) {
        loadOrInitSettings();
    }

    if (currentSettings) {
        return { success: true, config: currentSettings };
    } else {
        console.error("[BuyTheWay] Failed to load settings for loadConfig handler.");
        return { success: false, error: "Failed to load settings.", config: defaultSettings };
    }
});

ipcMain.handle("buy_the_way.sendEmail", async (event, emailConfig, subject, body) => {
    if (!emailConfig || !emailConfig.enabled) {
        console.log("[BuyTheWay] Email notification is disabled.");
        return { success: false, error: "Email notification is disabled." };
    }
    try {
        const transporter = nodemailer.createTransport({
            host: emailConfig.host,
            port: emailConfig.port,
            secure: emailConfig.secure,
            auth: { user: emailConfig.auth.user, pass: emailConfig.auth.pass },
        });
        const mailOptions = {
            from: `"BuyTheWay Bot" <${emailConfig.auth.user}>`,
            to: emailConfig.to,
            subject: subject,
            html: body,
        };
        let info = await transporter.sendMail(mailOptions);
        console.log("[BuyTheWay] Email sent: %s", info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error("[BuyTheWay] Error sending email:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("buy_the_way.showOpenDialog", async (event, options) => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (!focusedWindow) return { success: false, error: "No focused window" };
    try {
        const result = await dialog.showOpenDialog(focusedWindow, options);
        return { success: true, canceled: result.canceled, filePaths: result.filePaths };
    } catch (error) {
        console.error("[BuyTheWay] Error showing open dialog:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.on("buy_the_way.showToast", (event, message, type = 'info') => {
    console.log(`[BuyTheWay Toast - ${type}]: ${message}`);
    if (Notification.isSupported()) {
        new Notification({ title: 'BuyTheWay 提示', body: message }).show();
    } else {
        console.warn("[BuyTheWay] Notifications not supported on this system.");
    }
});

ipcMain.on("buy_the_way.messageFromRenderer", (event, message) => {
    if (currentSettings) handleReceivedMessage(message);
});

// --- 主逻辑 ---

function onLoad(plugin) {
    console.log("[BuyTheWay] Plugin loading...");
    console.log("[BuyTheWay] Received plugin object:", plugin);

    // 初始化路径
    try {
        if (plugin && plugin.path && plugin.path.plugin) {
            pluginRootPath = plugin.path.plugin;
            pluginDataPath = plugin.path.data;
            console.log("[BuyTheWay] [Success] Plugin paths obtained from plugin object:", { pluginRootPath, pluginDataPath });
        } else if (typeof LiteLoader !== 'undefined' && LiteLoader.plugins && LiteLoader.plugins["buy_the_way"] && LiteLoader.plugins["buy_the_way"].path && LiteLoader.plugins["buy_the_way"].path.plugin) {
            console.log("[BuyTheWay] [Info] Trying to get path from LiteLoader global.");
            pluginRootPath = LiteLoader.plugins["buy_the_way"].path.plugin;
            pluginDataPath = LiteLoader.plugins["buy_the_way"].path.data;
            console.log("[BuyTheWay] [Success] Plugin paths obtained from LiteLoader global:", { pluginRootPath, pluginDataPath });
        } else {
            console.warn("[BuyTheWay] [Warning] Failed to get plugin path from plugin object or LiteLoader global. Using fallback path for data.");
            pluginDataPath = path.join(process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + "/.config"), 'LiteLoaderQQNT', 'plugins_data', 'buy_the_way');
            pluginRootPath = null;
            console.warn("[BuyTheWay] Fallback data path:", pluginDataPath);
            console.error("[BuyTheWay] [Error] Could not determine plugin root path! Settings window might fail to load.");
        }

        if (pluginDataPath) {
            settingsPath = path.join(pluginDataPath, "settings.json");
            console.log("[BuyTheWay] Settings path set to:", settingsPath);
            loadOrInitSettings();
        } else {
            console.error("[BuyTheWay] [Critical Error] pluginDataPath could not be determined. Settings will not load/save.");
            if (Notification.isSupported()) {
                new Notification({ title: 'BuyTheWay 严重错误', body: '无法确定插件数据路径，设置功能将无法使用。' }).show();
            }
        }

    } catch (error) {
        console.error("[BuyTheWay] [Critical Error] Error during path initialization:", error);
        pluginRootPath = null;
        if (Notification.isSupported()) {
            new Notification({ title: 'BuyTheWay 错误', body: `插件路径初始化失败: ${error.message}` }).show();
        }
    }
}

async function handleReceivedMessage(message) {
    console.log('[BuyTheWay] 收到消息，开始处理:', JSON.stringify(message).substring(0, 100) + '...');

    // 只基于关键字匹配发送通知
    if (!currentSettings) {
        console.warn('[BuyTheWay] 当前设置为空，无法处理消息');
        return;
    }

    if (!currentSettings.monitoredGroups.includes(message.chatId)) {
        console.log(`[BuyTheWay] 消息来源 ${message.chatId} 不在监控列表中，跳过处理`);
        return;
    }

    const content = message.content;
    if (!content || content === '（非文本消息）') {
        console.log('[BuyTheWay] 消息内容为空或非文本消息，跳过处理');
        return;
    }

    const keywords = currentSettings.targetProducts || [];
    console.log(`[BuyTheWay] 开始匹配关键词，共 ${keywords.length} 个关键词`);

    if (keywords.length > 0) {
        let matched = false;
        for (const kw of keywords) {
            if (content.toLowerCase().includes(kw.toLowerCase())) {
                console.log(`[BuyTheWay] 匹配到关键词: "${kw}"`);
                matched = true;
                break;
            }
        }

        if (!matched) {
            console.log('[BuyTheWay] 未匹配到任何关键词，跳过处理');
            return;
        }
    } else {
        console.log('[BuyTheWay] 无关键词配置，处理所有消息');
    }

    try {
        // 准备消息内容
        const matchInfo = `来源: ${message.type} (${message.chatId})`;
        const senderInfo = `发送者: ${message.sender}`;
        const timeInfo = `时间: ${message.time}`;
        const contentInfo = `内容: ${content}`;

        const msgBody = `${matchInfo}\n${senderInfo}\n${timeInfo}\n${contentInfo}`;
        const emailHtmlBody = `<p><b>${matchInfo}</b></p><p>${senderInfo}</p><p>${timeInfo}</p><p>内容：</p><pre>${content}</pre>`;

        console.log('[BuyTheWay] 消息匹配成功，准备执行转发');

        // 1. 邮件转发
        if (currentSettings.emailConfig && currentSettings.emailConfig.enabled) {
            console.log('[BuyTheWay] 邮件转发已启用，准备发送邮件');
            try {
                const subject = `BuyTheWay 消息匹配: ${message.chatId}`;
                const emailConfig = currentSettings.emailConfig;

                console.log(`[BuyTheWay] 邮件服务器配置: ${emailConfig.host}:${emailConfig.port}, 收件人: ${emailConfig.to}`);

                if (!emailConfig.host || !emailConfig.port || !emailConfig.auth?.user || !emailConfig.auth?.pass || !emailConfig.to) {
                    console.error('[BuyTheWay] 邮件配置不完整，跳过发送');
                } else {
                    const transporter = nodemailer.createTransport({
                        host: emailConfig.host,
                        port: emailConfig.port,
                        secure: emailConfig.secure,
                        auth: { user: emailConfig.auth.user, pass: emailConfig.auth.pass }
                    });

                    const mailResult = await transporter.sendMail({
                        from: `"BuyTheWay Bot" <${emailConfig.auth.user}>`,
                        to: emailConfig.to,
                        subject,
                        html: emailHtmlBody
                    });

                    console.log('[BuyTheWay] 邮件发送成功，ID:', mailResult.messageId);
                }
            } catch (emailErr) {
                console.error('[BuyTheWay] 邮件发送失败:', emailErr);
                if (Notification.isSupported()) {
                    new Notification({ title: 'BuyTheWay 邮件错误', body: `邮件发送失败: ${emailErr.message}` }).show();
                }
            }
        } else {
            console.log('[BuyTheWay] 邮件转发未启用或配置不完整');
        }

        // 打印当前转发配置状态
        console.log('[BuyTheWay] 当前转发配置:', JSON.stringify({
            emailEnabled: currentSettings.emailConfig?.enabled || false,
            toUsers: {
                enabled: currentSettings.forwardConfig?.toUsers?.enabled || false,
                count: currentSettings.forwardConfig?.toUsers?.users?.length || 0
            },
            toGroups: {
                enabled: currentSettings.forwardConfig?.toGroups?.enabled || false,
                count: currentSettings.forwardConfig?.toGroups?.groups?.length || 0
            }
        }));

        // 2. 转发到用户
        const forwardToUsers = currentSettings.forwardConfig?.toUsers;
        if (forwardToUsers && forwardToUsers.enabled && forwardToUsers.users && forwardToUsers.users.length > 0) {
            console.log(`[BuyTheWay] 准备转发到 ${forwardToUsers.users.length} 个QQ用户:`, forwardToUsers.users);
            // 发出IPC消息，让渲染进程执行转发
            let windowsCount = 0;
            BrowserWindow.getAllWindows().forEach(window => {
                try {
                    window.webContents.send("buy_the_way.forwardToUsers", {
                        users: forwardToUsers.users,
                        content: msgBody
                    });
                    windowsCount++;
                } catch (sendErr) {
                    console.error('[BuyTheWay] 向窗口发送QQ转发消息失败:', sendErr);
                }
            });
            console.log(`[BuyTheWay] 已向 ${windowsCount} 个窗口发送QQ转发请求`);
        } else {
            console.log('[BuyTheWay] QQ用户转发未启用或目标用户列表为空');
        }

        // 3. 转发到群
        const forwardToGroups = currentSettings.forwardConfig?.toGroups;
        if (forwardToGroups && forwardToGroups.enabled && forwardToGroups.groups && forwardToGroups.groups.length > 0) {
            console.log(`[BuyTheWay] 准备转发到 ${forwardToGroups.groups.length} 个QQ群:`, forwardToGroups.groups);
            // 发出IPC消息，让渲染进程执行转发
            let windowsCount = 0;
            BrowserWindow.getAllWindows().forEach(window => {
                try {
                    window.webContents.send("buy_the_way.forwardToGroups", {
                        groups: forwardToGroups.groups,
                        content: msgBody
                    });
                    windowsCount++;
                } catch (sendErr) {
                    console.error('[BuyTheWay] 向窗口发送群转发消息失败:', sendErr);
                }
            });
            console.log(`[BuyTheWay] 已向 ${windowsCount} 个窗口发送群转发请求`);
        } else {
            console.log('[BuyTheWay] QQ群转发未启用或目标群列表为空');
        }

        // 本地通知(如果没有任何转发或配置不正确时)
        if ((!currentSettings.emailConfig || !currentSettings.emailConfig.enabled) &&
            (!forwardToUsers || !forwardToUsers.enabled || !forwardToUsers.users.length) &&
            (!forwardToGroups || !forwardToGroups.enabled || !forwardToGroups.groups.length)) {
            console.log('[BuyTheWay] 所有转发方式均未启用，显示本地通知');
            if (Notification.isSupported()) {
                new Notification({ title: `BuyTheWay 消息匹配: ${message.chatId}`, body: content }).show();
            }
        }
    } catch (error) {
        console.error('[BuyTheWay] 消息处理/转发过程中出错:', error);
        if (Notification.isSupported()) {
            new Notification({ title: 'BuyTheWay 错误', body: `消息处理失败: ${error.message}` }).show();
        }
    }
}

// 插件卸载时执行
function onUnload(plugin) {
    console.log("[BuyTheWay] Plugin unloaded.");
    ipcMain.removeHandler("buy_the_way.getPluginPath");
    ipcMain.removeHandler("buy_the_way.saveConfig");
    ipcMain.removeHandler("buy_the_way.loadConfig");
    ipcMain.removeHandler("buy_the_way.sendEmail");
    ipcMain.removeHandler("buy_the_way.showOpenDialog");
    ipcMain.removeAllListeners("buy_the_way.showToast");
    ipcMain.removeAllListeners("buy_the_way.messageFromRenderer");
}

module.exports = {
    onLoad,
    onUnload
};