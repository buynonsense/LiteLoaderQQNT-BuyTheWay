const { ipcMain, dialog, BrowserWindow, Notification } = require("electron");
const nodemailer = require("nodemailer");
const path = require("path"); // 确保导入 path 模块
const fs = require("fs"); // 确保导入 fs 模块

// --- 默认设置及更新函数 ---
const defaultSettings = {
    pluginEnabled: true,
    targetProducts: [],
    monitoredGroupsRaw: [], // 使用 Raw 后缀存储原始文本行
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
    forwardConfig: {
        toUsers: {
            enabled: false,
            usersRaw: [] // 使用 Raw 后缀
        },
        toGroups: {
            enabled: false,
            groupsRaw: [] // 使用 Raw 后缀
        }
    },
    messageFormatTemplate: 'default'
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

// Helper function to extract numbers from a string
// 辅助函数：从字符串中提取数字
const extractNumbers = (str) => {
    if (typeof str !== 'string') return null;
    const match = str.match(/\d+/); // 查找第一个数字序列
    return match ? match[0] : null; // 返回第一个匹配项，否则返回 null
};

// --- 新增：格式化消息函数 (与 renderer.js 中的类似) ---
function formatMessage(template, senderWithComment, content, time) { // sender 变为 senderWithComment
    let msgBody = '';
    let emailHtmlBody = '';

    // Basic HTML escaping for email body content
    // 邮件正文内容的基础 HTML 转义
    const escapeHtml = (unsafe) => {
        if (typeof unsafe !== 'string') return unsafe; // 处理非字符串输入
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };
    const escapedContent = escapeHtml(content);
    const escapedSenderWithComment = escapeHtml(senderWithComment); // 使用带注释的发送者
    const escapedTime = escapeHtml(time);

    switch (template) {
        case 'emoji':
            msgBody = `🔢 来源：${senderWithComment}\n📝 内容：${content}\n⏰ 时间：${time}`;
            emailHtmlBody = `<p>🔢 来源：${escapedSenderWithComment}</p><p>📝 内容：</p><pre>${escapedContent}</pre><p>⏰ 时间：${escapedTime}</p>`;
            break;
        case 'brackets':
            msgBody = `【来源】『${senderWithComment}』\n【内容】「${content}」\n【时间】『${time}』`;
            emailHtmlBody = `<p>【来源】『${escapedSenderWithComment}』</p><p>【内容】「${escapedContent}」</p><p>【时间】『${escapedTime}』</p>`;
            break;
        case 'symbols':
            msgBody = `✦ 来源：${senderWithComment}\n✧ 内容：${content}\n✦ 时间：${time}`;
            emailHtmlBody = `<p>✦ 来源：${escapedSenderWithComment}</p><p>✧ 内容：</p><pre>${escapedContent}</pre><p>✦ 时间：${escapedTime}</p>`;
            break;
        case 'markdown_lines':
            msgBody = `---\n### 来源\n${senderWithComment}\n\n### 内容\n${content}\n\n### 时间\n${time}\n---`;
            emailHtmlBody = `<hr><h3>来源</h3><p>${escapedSenderWithComment}</p><h3>内容</h3><pre>${escapedContent}</pre><h3>时间</h3><p>${escapedTime}</p><hr>`;
            break;
        case 'markdown_bold':
            msgBody = `**来源**：${senderWithComment}\n**内容**：${content}\n**时间**：${time}`;
            emailHtmlBody = `<p><b>来源</b>：${escapedSenderWithComment}</p><p><b>内容</b>：</p><pre>${escapedContent}</pre><p><b>时间</b>：${escapedTime}</p>`;
            break;
        case 'markdown_table':
            msgBody = `| 项目 | 内容       |\n|------|------------|\n| 来源 | ${senderWithComment}   |\n| 内容 | ${content}     |\n| 时间 | ${time}    |`;
            emailHtmlBody = `<table border="1" style="border-collapse: collapse; padding: 5px;">
                             <thead><tr><th>项目</th><th>内容</th></tr></thead>
                             <tbody>
                               <tr><td>来源</td><td>${escapedSenderWithComment}</td></tr>
                               <tr><td>内容</td><td><pre style="margin:0; padding:0;">${escapedContent}</pre></td></tr>
                               <tr><td>时间</td><td>${escapedTime}</td></tr>
                             </tbody>
                           </table>`;
            break;
        case 'default':
        default:
            msgBody = `来源: ${senderWithComment}\n内容: ${content}\n时间: ${time}`;
            emailHtmlBody = `<p><b>来源</b>: ${escapedSenderWithComment}</p><p>内容：</p><pre>${escapedContent}</pre><p><b>时间</b>: ${escapedTime}</p>`;
            break;
    }

    return { msgBody, emailHtmlBody };
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
            console.log("[BuyTheWay] 插件数据路径已创建:", pluginDataPath);
        }

        if (!fs.existsSync(settingsPath)) {
            console.log("[BuyTheWay] 未找到设置文件，使用默认值创建。");
            currentSettings = JSON.parse(JSON.stringify(defaultSettings)); // 深拷贝默认设置
            fs.writeFileSync(settingsPath, JSON.stringify(currentSettings, null, 4), 'utf-8');
        } else {
            console.log("[BuyTheWay] 从以下位置加载设置:", settingsPath);
            const fileContent = fs.readFileSync(settingsPath, 'utf-8');
            currentSettings = JSON.parse(fileContent);

            // 检查并补充缺失的默认值
            if (updateSettingsWithDefaults(currentSettings, defaultSettings)) {
                console.log("[BuyTheWay] 设置已使用新的默认值更新。");
                fs.writeFileSync(settingsPath, JSON.stringify(currentSettings, null, 4), 'utf-8');
            }
        }
        console.log("[BuyTheWay] 设置加载成功。");
    } catch (error) {
        console.error("[BuyTheWay] 加载或初始化设置时出错:", error);
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
        // 增加日志：记录要保存的 targetProducts
        console.log("[BuyTheWay] 尝试保存设置。 targetProducts:", JSON.stringify(settingsToSave.targetProducts));
        // 更新内存中的设置缓存
        currentSettings = settingsToSave;
        // 写入文件
        fs.writeFileSync(settingsPath, JSON.stringify(settingsToSave, null, 4), 'utf-8');
        console.log("[BuyTheWay] 设置已成功保存到文件:", settingsPath);
        return { success: true };
    } catch (error) {
        console.error("[BuyTheWay] 保存设置到文件时出错:", error);
        return { success: false, error: error.message };
    }
}

// --- IPC 处理程序注册 ---

ipcMain.handle("buy_the_way.getPluginPath", () => {
    console.log(`[BuyTheWay] IPC句柄 'getPluginPath' 已调用。当前 pluginRootPath: '${pluginRootPath}'`);
    if (pluginRootPath) {
        console.log("[BuyTheWay] IPC getPluginPath 返回存储的路径:", pluginRootPath);
        return pluginRootPath;
    } else {
        console.error("[BuyTheWay] [错误] IPC getPluginPath 已调用，但 pluginRootPath 为空或无效。");
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
        console.error("[BuyTheWay] 为 loadConfig 句柄加载设置失败。");
        return { success: false, error: "加载设置失败。", config: defaultSettings };
    }
});

ipcMain.handle("buy_the_way.sendEmail", async (event, emailConfig, subject, body, imagePaths = []) => { // 增加 imagePaths 参数
    if (!emailConfig || !emailConfig.enabled) {
        console.log("[BuyTheWay] 邮件通知已禁用。");
        return { success: false, error: "邮件通知已禁用。" };
    }
    try {
        const transporter = nodemailer.createTransport({
            host: emailConfig.host,
            port: emailConfig.port,
            secure: emailConfig.secure,
            auth: { user: emailConfig.auth.user, pass: emailConfig.auth.pass },
            tls: {
                // 在某些情况下，特别是自签名证书或特定邮件服务器，可能需要这个
                rejectUnauthorized: emailConfig.rejectUnauthorized === undefined ? true : emailConfig.rejectUnauthorized
            }
        });
        const mailOptions = {
            from: `"${emailConfig.fromName || 'BuyTheWay 机器人'}" <${emailConfig.auth.user}>`, // 修改机器人名称
            to: emailConfig.to,
            subject: subject,
            html: body,
            attachments: []
        };

        if (imagePaths && imagePaths.length > 0) {
            console.log('[BuyTheWay] 准备邮件附件，路径:', imagePaths);
            imagePaths.forEach((imgPath, index) => {
                if (typeof imgPath === 'string' && fs.existsSync(imgPath)) {
                    try {
                        const filename = path.basename(imgPath);
                        // 检查文件是否可读
                        fs.accessSync(imgPath, fs.constants.R_OK);
                        mailOptions.attachments.push({
                            filename: filename,
                            path: imgPath,
                            cid: `image_${index}` // 用于在html body中通过 <img src="cid:image_X"> 引用
                        });
                        console.log(`[BuyTheWay] 已添加附件: ${filename} (cid: image_${index}) 来自路径: ${imgPath}`);
                    } catch (err) {
                        console.warn(`[BuyTheWay] 访问或准备附件路径时出错: ${imgPath}. 错误: ${err.message}`);
                    }
                } else {
                    console.warn(`[BuyTheWay] 邮件附件的图片路径不存在、不是字符串或无法访问: ${imgPath}`);
                }
            });
        }

        let info = await transporter.sendMail(mailOptions);
        console.log("[BuyTheWay] 邮件已发送: %s", info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error("[BuyTheWay] 发送邮件时出错:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("buy_the_way.showOpenDialog", async (event, options) => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (!focusedWindow) return { success: false, error: "没有聚焦的窗口" }; // 没有聚焦窗口
    try {
        const result = await dialog.showOpenDialog(focusedWindow, options);
        return { success: true, canceled: result.canceled, filePaths: result.filePaths };
    } catch (error) {
        console.error("[BuyTheWay] 显示打开对话框时出错:", error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("buy_the_way.checkFileExists", async (event, filePath) => {
    try {
        if (!filePath || typeof filePath !== 'string') {
            console.warn("[BuyTheWay] checkFileExists: 无效的文件路径", filePath);
            return { exists: false, error: "无效的文件路径" };
        }

        console.log(`[BuyTheWay] 检查文件存在性: ${filePath}`);

        // 检查文件是否存在且可读
        try {
            await fs.promises.access(filePath, fs.constants.F_OK | fs.constants.R_OK);
            
            // 获取文件统计信息以确保文件完整性
            const stats = await fs.promises.stat(filePath);
            
            // 检查文件大小是否合理（图片文件应该大于0字节）
            if (stats.size === 0) {
                console.warn(`[BuyTheWay] 文件大小为0，可能正在写入中: ${filePath}`);
                return { exists: false, error: "文件大小为0，可能正在写入中", size: 0 };
            }

            // 检查文件是否最近被修改（可能正在写入）
            const now = new Date();
            const modifiedTime = stats.mtime;
            const timeDiffMs = now - modifiedTime;
            
            // 如果文件在100毫秒内被修改，可能还在写入中
            if (timeDiffMs < 100) {
                console.warn(`[BuyTheWay] 文件最近被修改(${timeDiffMs}ms前)，可能正在写入中: ${filePath}`);
                return { exists: false, error: "文件最近被修改，可能正在写入中", recentlyModified: true };
            }

            console.log(`[BuyTheWay] 文件访问成功: ${filePath} (大小: ${stats.size}字节, 修改时间: ${modifiedTime.toISOString()})`);
            return { 
                exists: true, 
                size: stats.size, 
                mtime: modifiedTime,
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory()
            };
            
        } catch (accessError) {
            // 详细记录访问失败的原因
            console.warn(`[BuyTheWay] 文件访问失败: ${filePath}`, {
                code: accessError.code,
                errno: accessError.errno,
                message: accessError.message
            });
            
            // 尝试获取更多文件信息
            try {
                const stats = await fs.promises.stat(filePath);
                console.log(`[BuyTheWay] 文件存在但无法访问:`, {
                    size: stats.size,
                    isFile: stats.isFile(),
                    mode: stats.mode,
                    atime: stats.atime,
                    mtime: stats.mtime
                });
                
                // 如果文件存在但无法访问，可能是权限问题或文件锁定
                return { 
                    exists: false, 
                    error: accessError.code || accessError.message,
                    fileExists: true,
                    possibleCause: "权限问题或文件被锁定"
                };
            } catch (statError) {
                console.warn(`[BuyTheWay] 文件不存在: ${filePath}`);
                return { 
                    exists: false, 
                    error: accessError.code || accessError.message,
                    fileExists: false
                };
            }
        }
    } catch (error) {
        console.error("[BuyTheWay] 检查文件存在性时出错:", error);
        return { exists: false, error: error.message };
    }
});

ipcMain.on("buy_the_way.showToast", (event, message, type = 'info') => {
    console.log(`[BuyTheWay Toast - ${type}]: ${message}`);
    if (Notification.isSupported()) {
        new Notification({ title: 'BuyTheWay 提示', body: message }).show();
    } else {
        console.warn("[BuyTheWay] 此系统不支持通知。"); // 系统不支持通知
    }
});

ipcMain.on("buy_the_way.messageFromRenderer", (event, message) => {
    if (currentSettings) handleReceivedMessage(message);
});

// --- 主逻辑 ---

function onLoad(plugin) {
    console.log("[BuyTheWay] 插件加载中...");
    console.log("[BuyTheWay] 收到的插件对象:", plugin);

    // 初始化路径
    try {
        if (plugin && plugin.path && plugin.path.plugin) {
            pluginRootPath = plugin.path.plugin;
            pluginDataPath = plugin.path.data;
            console.log("[BuyTheWay] [成功] 从插件对象获取插件路径:", { pluginRootPath, pluginDataPath }); // [Success] Plugin paths obtained from plugin object:
        } else if (typeof LiteLoader !== 'undefined' && LiteLoader.plugins && LiteLoader.plugins["buy_the_way"] && LiteLoader.plugins["buy_the_way"].path && LiteLoader.plugins["buy_the_way"].path.plugin) {
            console.log("[BuyTheWay] [信息] 尝试从 LiteLoader 全局获取路径。"); // [Info] Trying to get path from LiteLoader global.
            pluginRootPath = LiteLoader.plugins["buy_the_way"].path.plugin;
            pluginDataPath = LiteLoader.plugins["buy_the_way"].path.data;
            console.log("[BuyTheWay] [成功] 从 LiteLoader 全局获取插件路径:", { pluginRootPath, pluginDataPath }); // [Success] Plugin paths obtained from LiteLoader global:
        } else {
            console.warn("[BuyTheWay] [警告] 从插件对象或 LiteLoader 全局获取插件路径失败。对数据使用回退路径。"); // [Warning] Failed to get plugin path from plugin object or LiteLoader global. Using fallback path for data.
            pluginDataPath = path.join(process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + "/.config"), 'LiteLoaderQQNT', 'plugins_data', 'buy_the_way');
            pluginRootPath = null;
            console.warn("[BuyTheWay] 回退数据路径:", pluginDataPath); // Fallback data path:
            console.error("[BuyTheWay] [错误] 无法确定插件根路径！设置窗口可能无法加载。"); // [Error] Could not determine plugin root path! Settings window might fail to load.
        }

        if (pluginDataPath) {
            settingsPath = path.join(pluginDataPath, "settings.json");
            console.log("[BuyTheWay] 设置路径已设为:", settingsPath); // Settings path set to:
            loadOrInitSettings();
        } else {
            console.error("[BuyTheWay] [严重错误] 无法确定 pluginDataPath。设置将无法加载/保存。"); // [Critical Error] pluginDataPath could not be determined. Settings will not load/save.
            if (Notification.isSupported()) {
                new Notification({ title: 'BuyTheWay 严重错误', body: '无法确定插件数据路径，设置功能将无法使用。' }).show();
            }
        }

    } catch (error) {
        console.error("[BuyTheWay] [严重错误] 路径初始化期间出错:", error); // [Critical Error] Error during path initialization:
        pluginRootPath = null;
        if (Notification.isSupported()) {
            new Notification({ title: 'BuyTheWay 错误', body: `插件路径初始化失败: ${error.message}` }).show();
        }
    }
}

async function handleReceivedMessage(message) {
    // 新增：检查总开关
    if (!currentSettings || !currentSettings.pluginEnabled) {
        return; // 如果插件被禁用，则不处理任何消息
    }

    // 增加日志：记录当前处理消息时使用的 targetProducts
    console.log('[BuyTheWay] handleReceivedMessage: 使用 targetProducts:', JSON.stringify(currentSettings?.targetProducts || '未加载设置')); // Using targetProducts: Settings not loaded
    console.log('[BuyTheWay] 收到消息，开始处理:', JSON.stringify(message).substring(0, 100) + '...');

    if (!currentSettings) {
        console.warn('[BuyTheWay] 当前设置为空，无法处理消息');
        return;
    }

    // 检查是否在监控群组中 (从 Raw 提取数字) - 优化：使用 Set 提升性能
    const monitoredGroupsRaw = currentSettings.monitoredGroupsRaw || currentSettings.monitoredGroups || []; // Fallback for older configs // 旧配置回退
    console.log('[BuyTheWay] 监控列表原始数据:', monitoredGroupsRaw);
    
    const monitoredGroupIds = monitoredGroupsRaw.map(extractNumbers).filter(Boolean); // Extract IDs on the fly // 动态提取ID
    console.log('[BuyTheWay] 监控列表:', monitoredGroupIds);
    
    // 使用 Set 优化查找性能
    const monitoredGroupSet = new Set(monitoredGroupIds);

    // --- 新增：查找带注释的来源 --- 
    let senderIdentifierWithComment = message.chatType === 'group' ? message.peerUid : message.senderUid;
    const senderIdForLookup = senderIdentifierWithComment; // Use the numeric ID for lookup // 使用数字ID进行查找

    const foundSourceLine = monitoredGroupsRaw.find(line => {
        const extractedNum = extractNumbers(line);
        return extractedNum && extractedNum === String(senderIdForLookup);
    });

    if (foundSourceLine) {
        senderIdentifierWithComment = foundSourceLine.trim(); // Use the full line with comment // 使用带注释的完整行
    }
    // --- 查找结束 ---

    const senderName = message.chatType === 'group' ? message.peerName : message.senderName;
    const messageTime = new Date(message.msgTime * 1000).toLocaleString();    // 使用优化的 Set 进行快速查找
    if (!monitoredGroupSet.has(String(senderIdForLookup))) {
        console.log(`[BuyTheWay] 消息来源 ${senderIdForLookup} (${senderName}) 不在监控列表 [${monitoredGroupIds.join(', ')}] 中，跳过处理`);
        return;
    }
    console.log(`[BuyTheWay] 消息来源 ${senderIdForLookup} (${senderName}) 在监控列表 [${monitoredGroupIds.join(', ')}] 中`);

    // 提取文本内容
    let content = '';
    if (message.elements && message.elements.length > 0) {
        content = message.elements.map(el => {
            if (el.elementType === 1 && el.textElement) { // 文本元素
                return el.textElement.content;
            }
            // 可以根据需要添加对其他元素类型（如图片、@）的处理
            return ''; // 其他元素暂时忽略
        }).join('').trim();
    }

    if (!content) {
        console.log('[BuyTheWay] 消息内容为空或非纯文本，跳过处理');
        return;
    }
    console.log(`[BuyTheWay] 提取到的文本内容: "${content}"`);    // 关键词匹配 - 优化：使用 Set 提升性能
    const keywords = currentSettings.targetProducts || [];
    console.log(`[BuyTheWay] 开始匹配关键词，共 ${keywords.length} 个关键词`);
    let matched = false;
    if (keywords.length > 0) {
        // 创建关键词 Set，提升查找性能
        const keywordSet = new Set(keywords.map(keyword => keyword.trim().toLowerCase()).filter(Boolean));
        
        const lowerContent = content.toLowerCase();
        
        // 优化的关键词匹配：对于每个关键词，检查内容是否包含它
        matched = [...keywordSet].some(keyword => {
            const isMatch = lowerContent.includes(keyword);
            console.log(`[BuyTheWay] 检查消息 ("${lowerContent}") 是否包含关键词 ("${keyword}"): ${isMatch ? '是' : '否'}`);
            return isMatch;
        });

        if (!matched) {
            console.log('[BuyTheWay] 未匹配到任何关键词，跳过处理');
            return;
        }
    } else {
        console.log('[BuyTheWay] 无关键词配置，处理所有消息');
        matched = true; // 没有关键词则默认匹配所有消息
    }

    if (!matched) return; // 如果最终没有匹配，则退出

    console.log('[BuyTheWay] 消息匹配成功，准备执行转发');

    try {
        // 获取选择的模板并格式化消息
        const template = currentSettings.messageFormatTemplate || 'default';
        console.log(`[BuyTheWay] 使用消息模板: ${template}`);
        // 使用 senderIdentifierWithComment 替换 senderName 和 senderIdentifier 的组合
        const { msgBody, emailHtmlBody } = formatMessage(template, senderIdentifierWithComment, content, messageTime);

        // 1. 邮件转发
        if (currentSettings.emailConfig && currentSettings.emailConfig.enabled) {
            console.log('[BuyTheWay] 邮件转发已启用，准备发送邮件');
            try {
                // 邮件主题也使用带注释的来源
                const subject = `BuyTheWay 消息匹配: ${senderIdentifierWithComment}`;
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
                        from: `"BuyTheWay 机器人" <${emailConfig.auth.user}>`, // 修改机器人名称
                        to: emailConfig.to,
                        subject,
                        html: emailHtmlBody // 使用格式化后的 HTML 邮件正文
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

        // 打印当前转发配置状态 (显示原始行数)
        console.log('[BuyTheWay] 当前转发配置:', JSON.stringify({
            emailEnabled: currentSettings.emailConfig?.enabled || false,
            toUsers: {
                enabled: currentSettings.forwardConfig?.toUsers?.enabled || false,
                // 显示原始行数，或旧配置的用户数
                count: (currentSettings.forwardConfig?.toUsers?.usersRaw || currentSettings.forwardConfig?.toUsers?.users || []).length
            },
            toGroups: {
                enabled: currentSettings.forwardConfig?.toGroups?.enabled || false,
                // 显示原始行数，或旧配置的群组数
                count: (currentSettings.forwardConfig?.toGroups?.groupsRaw || currentSettings.forwardConfig?.toGroups?.groups || []).length
            }
        }));

        // 2. 转发到用户 (从 Raw 提取数字)
        const forwardToUsersConfig = currentSettings.forwardConfig?.toUsers;
        if (forwardToUsersConfig && forwardToUsersConfig.enabled) {
            const usersRaw = forwardToUsersConfig.usersRaw || forwardToUsersConfig.users || []; // Fallback //回退
            const userIdsToForward = usersRaw.map(extractNumbers).filter(Boolean); // Extract IDs //提取ID
            if (userIdsToForward.length > 0) {
                console.log(`[BuyTheWay] 准备转发到 ${userIdsToForward.length} 个QQ用户:`, userIdsToForward);
                let windowsCount = 0;
                BrowserWindow.getAllWindows().forEach(window => {
                    try {
                        window.webContents.send("buy_the_way.forwardToUsers", {
                            users: userIdsToForward, // 发送提取后的 ID 列表
                            content: msgBody // msgBody 已包含带注释的来源
                        });
                        windowsCount++;
                    } catch (sendErr) {
                        console.error('[BuyTheWay] 向窗口发送QQ转发消息失败:', sendErr);
                    }
                });
                console.log(`[BuyTheWay] 已向 ${windowsCount} 个窗口发送QQ转发请求`);
            } else {
                console.log('[BuyTheWay] QQ用户转发已启用，但未找到有效的用户ID');
            }
        } else {
            console.log('[BuyTheWay] QQ用户转发未启用或目标用户列表为空');
        }

        // 3. 转发到群 (从 Raw 提取数字)
        const forwardToGroupsConfig = currentSettings.forwardConfig?.toGroups;
        if (forwardToGroupsConfig && forwardToGroupsConfig.enabled) {
            const groupsRaw = forwardToGroupsConfig.groupsRaw || forwardToGroupsConfig.groups || []; // Fallback //回退
            const groupIdsToForward = groupsRaw.map(extractNumbers).filter(Boolean); // Extract IDs //提取ID
            if (groupIdsToForward.length > 0) {
                console.log(`[BuyTheWay] 准备转发到 ${groupIdsToForward.length} 个QQ群:`, groupIdsToForward);
                let windowsCount = 0;
                BrowserWindow.getAllWindows().forEach(window => {
                    try {
                        window.webContents.send("buy_the_way.forwardToGroups", {
                            groups: groupIdsToForward, // 发送提取后的 ID 列表
                            content: msgBody // msgBody 已包含带注释的来源
                        });
                        windowsCount++;
                    } catch (sendErr) {
                        console.error('[BuyTheWay] 向窗口发送群转发消息失败:', sendErr);
                    }
                });
                console.log(`[BuyTheWay] 已向 ${windowsCount} 个窗口发送群转发请求`);
            } else {
                console.log('[BuyTheWay] QQ群转发已启用，但未找到有效的群ID');
            }
        } else {
            console.log('[BuyTheWay] QQ群转发未启用或目标群列表为空');
        }

        // 本地通知(如果没有任何转发或配置不正确时)
        if ((!currentSettings.emailConfig || !currentSettings.emailConfig.enabled) &&
            (!forwardToUsersConfig || !forwardToUsersConfig.enabled || (forwardToUsersConfig.usersRaw || forwardToUsersConfig.users || []).map(extractNumbers).filter(Boolean).length === 0) && // Check extracted IDs //检查提取的ID
            (!forwardToGroupsConfig || !forwardToGroupsConfig.enabled || (forwardToGroupsConfig.groupsRaw || forwardToGroupsConfig.groups || []).map(extractNumbers).filter(Boolean).length === 0)) { // Check extracted IDs //检查提取的ID
            console.log('[BuyTheWay] 所有转发方式均未启用或无有效目标，显示本地通知');
            if (Notification.isSupported()) {
                // 本地通知也使用带注释的来源 (通过 msgBody)
                new Notification({ title: `BuyTheWay 消息匹配: ${senderIdentifierWithComment}`, body: msgBody }).show();
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
    console.log("[BuyTheWay] 插件已卸载。"); // Plugin unloaded.
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