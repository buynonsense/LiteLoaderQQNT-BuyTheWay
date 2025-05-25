// src/renderer.js

// 获取插件路径
const PLUGIN_PATH = LiteLoader.plugins["buy_the_way"].path.plugin;

// 全局状态
const globalState = {
    observer: null,
    isObserving: false,
    // 使用 Set 来跟踪已处理的消息 ID，防止重复发送
    processedMessageIds: new Set(),
    // 简单的缓存，避免短时间内重复处理相同节点
    nodeCache: new Map()
};

// --- Euphony 增强图片处理工具 (内嵌版本) ---

/**
 * 图片路径处理和验证工具类
 * 用于解决 QQ 后台运行时图片文件访问问题
 */
class ImagePathResolver {
    constructor() {
        this.retryCount = 3;
        this.retryDelay = 1000; // 1秒
        this.maxWaitTime = 10000; // 最大等待10秒
    }

    /**
     * 验证文件是否存在且可读
     */
    async isFileAccessible(filePath) {
        try {
            if (!filePath || typeof filePath !== 'string') {
                return false;
            }

            // 使用 main 进程的文件系统 API 检查文件
            if (window.buy_the_way_api && window.buy_the_way_api.checkFileExists) {
                const result = await window.buy_the_way_api.checkFileExists(filePath);
                return result.exists;
            }

            // 如果没有 API，暂时返回 true，让后续处理决定
            return true;
        } catch (error) {
            console.warn(`[BuyTheWay] 检查文件访问性时出错 (${filePath}):`, error);
            return false;
        }
    }    /**
     * 生成可能的图片路径变体
     */    generatePathVariants(originalPath) {
        if (!originalPath || typeof originalPath !== 'string') {
            return [];
        }

        console.log(`[BuyTheWay] 开始生成路径变体，原始路径: ${originalPath}`);

        const variants = [];

        try {
            // 处理Windows路径，统一使用反斜杠
            const isWindowsPath = originalPath.includes('\\');
            const pathSeparator = isWindowsPath ? '\\' : '/';

            // 分离路径和文件名
            const lastSeparatorIndex = originalPath.lastIndexOf(pathSeparator);
            if (lastSeparatorIndex === -1) {
                console.warn(`[BuyTheWay] 路径中没有找到分隔符: ${originalPath}`);
                return [originalPath];
            }

            const dirPath = originalPath.substring(0, lastSeparatorIndex);
            const fileName = originalPath.substring(lastSeparatorIndex + 1);

            // 分离文件名和扩展名
            const dotIndex = fileName.lastIndexOf('.');
            if (dotIndex === -1) {
                console.warn(`[BuyTheWay] 文件名中没有找到扩展名: ${fileName}`);
                return [originalPath];
            }

            const baseName = fileName.substring(0, dotIndex);
            const fileExt = fileName.substring(dotIndex); // 包含点号
            console.log(`[BuyTheWay] 路径解析 - 目录: "${dirPath}", 文件名: "${baseName}", 扩展名: "${fileExt}"`);

            // QQ图片存储逻辑：图片随机存储在Ori或Thumb目录
            // Ori目录：原始文件名（如 xxxxx.jpg）
            // Thumb目录：只有 xxxxx_0 和 xxxxx_720 两个变体

            // 策略1：优先检查原始路径（最常见的情况）
            variants.push(originalPath);
            console.log(`[BuyTheWay] 添加原始路径作为第一选择: ${originalPath}`);

            // 策略2：如果是Ori路径，生成对应的Thumb路径变体
            if (dirPath.includes(`${pathSeparator}Ori`)) {
                // 找到Ori目录的位置并替换为Thumb
                const oriPattern = `${pathSeparator}Ori`;
                const oriIndex = dirPath.lastIndexOf(oriPattern);
                if (oriIndex !== -1) {
                    const beforeOri = dirPath.substring(0, oriIndex);
                    const afterOri = dirPath.substring(oriIndex + oriPattern.length);
                    const thumbDir = beforeOri + `${pathSeparator}Thumb` + afterOri;

                    console.log(`[BuyTheWay] 检测到Ori路径，生成Thumb变体: "${dirPath}" -> "${thumbDir}"`);

                    // 只生成QQ实际使用的两个Thumb变体：_0 和 _720
                    // 支持.jpg和.png两种扩展名（QQ可能转换格式）
                    const thumbExtensions = ['.jpg', '.png'];
                    const resolutions = ['_0', '_720']; // 只生成QQ实际使用的变体

                    for (const resolution of resolutions) {
                        for (const thumbExt of thumbExtensions) {
                            variants.push(`${thumbDir}${pathSeparator}${baseName}${resolution}${thumbExt}`);
                        }
                    }

                    console.log(`[BuyTheWay] 生成的Thumb路径变体: ${resolutions.length * thumbExtensions.length}个`);
                }
            }
            // 策略3：如果是Thumb路径，生成其他分辨率变体
            else if (dirPath.includes(`${pathSeparator}Thumb`)) {
                console.log(`[BuyTheWay] 检测到Thumb路径，生成其他分辨率变体`);

                const thumbExtensions = ['.jpg', '.png'];
                const resolutions = ['_0', '_720']; // 只生成QQ实际使用的变体

                for (const resolution of resolutions) {
                    for (const thumbExt of thumbExtensions) {
                        const variant = `${dirPath}${pathSeparator}${baseName}${resolution}${thumbExt}`;
                        // 避免重复添加（原始路径可能已经是某个变体）
                        if (variant !== originalPath) {
                            variants.push(variant);
                        }
                    }
                }

                console.log(`[BuyTheWay] 生成的Thumb变体数量: ${variants.length - 1}个（不含原始）`);
            }
            // 策略4：其他情况的基本处理
            else {
                console.log(`[BuyTheWay] 其他路径类型，生成基本变体`);

                const thumbExtensions = ['.jpg', '.png'];
                const resolutions = ['_0', '_720'];

                for (const resolution of resolutions) {
                    for (const thumbExt of thumbExtensions) {
                        const variant = `${dirPath}${pathSeparator}${baseName}${resolution}${thumbExt}`;
                        if (variant !== originalPath) {
                            variants.push(variant);
                        }
                    }
                }
            }

        } catch (error) {
            console.error(`[BuyTheWay] 路径解析错误:`, error);
            variants.push(originalPath);
        }

        // 去除重复项
        const uniqueVariants = [...new Set(variants)];
        console.log(`[BuyTheWay] 最终生成 ${uniqueVariants.length} 个路径变体:`, uniqueVariants);

        return uniqueVariants;
    }

    /**
     * 等待文件变为可访问状态
     */
    async waitForFileAccess(pathVariants, maxWaitTime = this.maxWaitTime) {
        const startTime = Date.now();
        let attempt = 0;

        while (Date.now() - startTime < maxWaitTime) {
            attempt++;

            // 检查所有路径变体
            for (const path of pathVariants) {
                if (await this.isFileAccessible(path)) {
                    console.log(`[BuyTheWay] 图片文件就绪 (尝试 ${attempt}): ${path}`);
                    return path;
                }
            }

            // 等待后重试
            if (Date.now() - startTime < maxWaitTime) {
                console.log(`[BuyTheWay] 图片文件暂未就绪，等待后重试... (尝试 ${attempt})`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
            }
        }

        console.warn(`[BuyTheWay] 等待图片文件超时 (${maxWaitTime}ms)，所有路径变体都不可访问:`, pathVariants);
        return null;
    }

    /**
     * 解析图片路径，优先使用缩略图并处理延迟问题
     */
    async resolveImagePath(originalPath) {
        try {
            if (!originalPath) {
                console.warn('[BuyTheWay] resolveImagePath: 没有提供图片路径');
                return null;
            }

            console.log(`[BuyTheWay] 开始解析图片路径: ${originalPath}`);

            // 生成路径变体
            const pathVariants = this.generatePathVariants(originalPath);
            console.log(`[BuyTheWay] 生成的路径变体:`, pathVariants);

            // 立即检查是否有可用路径
            for (const path of pathVariants) {
                if (await this.isFileAccessible(path)) {
                    console.log(`[BuyTheWay] 立即找到可用图片路径: ${path}`);
                    return path;
                }
            }

            // 如果没有立即可用的路径，等待文件就绪
            console.log('[BuyTheWay] 没有立即可用的图片，等待文件就绪...');
            const resolvedPath = await this.waitForFileAccess(pathVariants);

            if (resolvedPath) {
                console.log(`[BuyTheWay] 成功解析图片路径: ${resolvedPath}`);
                return resolvedPath;
            } else {
                // 如果所有尝试都失败，返回最优先的路径（让上层处理）
                console.warn(`[BuyTheWay] 无法访问任何图片路径变体，返回首选路径: ${pathVariants[0] || originalPath}`);
                return pathVariants[0] || originalPath;
            }

        } catch (error) {
            console.error('[BuyTheWay] resolveImagePath 处理出错:', error);
            return originalPath; // 出错时返回原路径
        }
    }
}

/**
 * 消息链增强处理器
 * 用于改进 Euphony MessageChain 的处理，特别是图片处理
 */
class MessageChainProcessor {
    constructor() {
        this.imageResolver = new ImagePathResolver();
        this.processingTimeout = 15000; // 15秒超时
    }

    /**
     * 处理消息链，提取文本和图片路径
     */
    async processMessageChain(messageChain) {
        let textContent = "";
        let imagePaths = [];

        try {
            if (!messageChain || typeof messageChain.get !== 'function') {
                console.warn('[BuyTheWay] MessageChain 对象无效');
                return { textContent: "无法解析的消息内容", imagePaths: [] };
            }

            console.log('[BuyTheWay] 开始处理 MessageChain...');
            const imagePromises = [];

            // 遍历消息链中的每个元素
            for (let i = 0; ; i++) {
                const element = messageChain.get(i);
                if (element === undefined) {
                    break;
                }

                if (element instanceof window.euphony.PlainText) {
                    textContent += element.getContent();
                } else if (element instanceof window.euphony.Image) {
                    // 异步处理图片路径解析
                    const imagePromise = this.processImageElement(element);
                    imagePromises.push(imagePromise);
                } else if (element instanceof window.euphony.At) {
                    textContent += `@${element.getUin()} `;
                } else if (element instanceof window.euphony.AtAll) {
                    textContent += `${element.getContent()} `;
                } else {
                    console.log(`[BuyTheWay] 遇到未处理的消息元素类型:`, element.constructor.name);
                }
            }

            // 等待所有图片处理完成
            if (imagePromises.length > 0) {
                console.log(`[BuyTheWay] 等待 ${imagePromises.length} 个图片处理完成...`);

                try {
                    const resolvedPaths = await Promise.allSettled(imagePromises);

                    for (const result of resolvedPaths) {
                        if (result.status === 'fulfilled' && result.value) {
                            imagePaths.push(result.value);
                        } else if (result.status === 'rejected') {
                            console.warn('[BuyTheWay] 图片路径解析失败:', result.reason);
                        }
                    }
                } catch (error) {
                    console.error('[BuyTheWay] 图片批量处理出错:', error);
                }
            }

            // 如果只有图片没有文本，设置默认文本
            if (imagePaths.length > 0 && !textContent.trim()) {
                textContent = "[图片消息]";
            }

            console.log(`[BuyTheWay] MessageChain 处理完成 - 文本: ${textContent.substring(0, 50)}${textContent.length > 50 ? '...' : ''}, 图片数量: ${imagePaths.length}`);

            return { textContent, imagePaths };

        } catch (error) {
            console.error('[BuyTheWay] processMessageChain 出错:', error);
            return {
                textContent: textContent || "消息处理出错",
                imagePaths: imagePaths || []
            };
        }
    }

    /**
     * 处理单个图片元素
     */
    async processImageElement(imageElement) {
        try {
            let originalPath = imageElement.getPath();
            if (!originalPath) {
                console.warn('[BuyTheWay] 图片元素没有返回路径');
                return null;
            }

            console.log(`[BuyTheWay] 处理图片元素，原始路径: ${originalPath}`);

            // 使用图片路径解析器
            const resolvedPath = await this.imageResolver.resolveImagePath(originalPath);

            if (resolvedPath) {
                console.log(`[BuyTheWay] 图片元素处理完成: ${resolvedPath}`);
                return resolvedPath;
            } else {
                console.warn('[BuyTheWay] 图片元素路径解析失败');
                return null;
            }

        } catch (error) {
            console.error('[BuyTheWay] processImageElement 出错:', error);
            return null;
        }
    }
}

// 导出工具类到全局
window.BuyTheWayImageUtils = {
    ImagePathResolver,
    MessageChainProcessor
};

console.log('[BuyTheWay] 内嵌 Euphony 增强工具已加载');

// --- Euphony 消息监听实现 ---
function startEuphonyMessageListener() {
    console.log('[BuyTheWay] 开始初始化 Euphony 消息监听器（使用内嵌增强工具）');
    initializeEuphonyListener();
}

// 移除动态加载函数，直接使用内嵌工具
function loadEuphonyUtils() {
    // 工具已经内嵌，直接返回 resolved promise
    return Promise.resolve();
}

// 初始化 Euphony 监听器
function initializeEuphonyListener() {
    try {
        if (typeof window.euphony === 'undefined' || typeof window.euphony.EventChannel === 'undefined' || typeof window.euphony.Image === 'undefined') {
            console.error('[BuyTheWay] Euphony 库或其必要组件未加载，无法使用消息监听功能');
            // 尝试加载 utils/euphony.js (如果它负责初始化 Euphony)
            // 这取决于你的项目结构，如果 euphony.js 应该由 preload.js 注入或在 renderer.html 中加载
            // 例如: if (typeof window.loadEuphony === 'function') { window.loadEuphony(); }
            // 确保 window.euphony.Image 等类型可用
            return;
        }

        console.log('[BuyTheWay] 开始初始化 Euphony 消息监听器');

        const eventChannel = window.euphony.EventChannel.withTriggers();

        if (!eventChannel) {
            console.error('[BuyTheWay] 创建 Euphony 事件通道失败');
            return;
        } eventChannel.subscribeEvent('receive-message', async (messageChain, source) => { // message 参数现在是 messageChain
            try {
                const contact = source.getContact();
                const senderId = contact.getId(); // 这是数字 ID
                const time = new Date().toLocaleString();

                let msgTextContent = "";
                let msgImagePaths = [];                // 使用增强的 MessageChainProcessor 来处理消息链
                if (messageChain && typeof messageChain.get === 'function' && typeof messageChain.contentToString === 'function') {
                    console.log('[BuyTheWay] 开始使用增强的 MessageChainProcessor 处理消息');

                    // 检查是否有 BuyTheWayImageUtils 可用
                    if (window.BuyTheWayImageUtils && window.BuyTheWayImageUtils.MessageChainProcessor) {
                        try {
                            const processor = new window.BuyTheWayImageUtils.MessageChainProcessor();
                            const result = await processor.processMessageChain(messageChain);

                            msgTextContent = result.textContent || "";
                            msgImagePaths = result.imagePaths || [];

                            console.log(`[BuyTheWay] 增强处理器完成 - 文本: ${msgTextContent.substring(0, 50)}${msgTextContent.length > 50 ? '...' : ''}, 图片: ${msgImagePaths.length}张`);
                        } catch (processorError) {
                            console.error('[BuyTheWay] 增强处理器失败，回退到简单处理:', processorError);
                            // 回退到简单处理逻辑
                            await fallbackMessageProcessing();
                        }
                    } else {
                        console.warn('[BuyTheWay] BuyTheWayImageUtils 不可用，使用简单处理逻辑');
                        await fallbackMessageProcessing();
                    }

                    // 简化的回退处理逻辑
                    async function fallbackMessageProcessing() {
                        // 遍历消息链中的每个元素
                        for (let i = 0; ; i++) {
                            const element = messageChain.get(i);
                            if (element === undefined) {
                                break;
                            }

                            if (element instanceof window.euphony.PlainText) {
                                msgTextContent += element.getContent();
                            } else if (element instanceof window.euphony.Image) {
                                let picPath = element.getPath();
                                if (picPath) {
                                    // 简化的图片处理：直接使用缩略图路径
                                    if (picPath.includes("\\Ori\\")) {
                                        picPath = picPath.replace("\\Ori\\", "\\Thumb\\");
                                    }
                                    msgImagePaths.push(picPath);
                                    console.log(`[BuyTheWay] 简单处理图片路径: ${picPath}`);
                                } else {
                                    console.warn('[BuyTheWay] 图片元素未返回路径');
                                }
                            } else if (element instanceof window.euphony.At) {
                                msgTextContent += `@${element.getUin()} `;
                            } else if (element instanceof window.euphony.AtAll) {
                                msgTextContent += `${element.getContent()} `;
                            }
                        }

                        // 如果只有图片，且没有文本内容，可以设置一个默认文本
                        if (msgImagePaths.length > 0 && !msgTextContent.trim()) {
                            msgTextContent = "[图片消息]";
                        }
                    }

                } else {
                    console.warn('[BuyTheWay] Euphony messageChain 对象与预期不符或元素无法迭代。图片捕获可能会失败。');
                    // Fallback to a simpler text extraction if possible, though likely insufficient
                    if (messageChain && typeof messageChain.contentToString === 'function') {
                        msgTextContent = messageChain.contentToString();
                    } else {
                        msgTextContent = "无法解析的消息内容";
                    }
                }

                // Load config to get monitoredGroupsRaw for comment lookup
                let config = null;
                if (window.buy_the_way_api && window.buy_the_way_api.loadConfig) {
                    const result = await window.buy_the_way_api.loadConfig();
                    if (result.success) {
                        config = result.config;
                    } else {
                        console.error('[BuyTheWay] Euphony: 加载配置以查找来源备注失败:', result.error);
                        // Continue without comments if config load fails
                    }
                }

                const monitoredGroupsRaw = config?.monitoredGroupsRaw || [];
                const senderWithComment = findSourceWithComment(senderId, monitoredGroupsRaw) || senderId;


                console.log(`[BuyTheWay] 收到消息 - 来源 (带备注): ${senderWithComment}, 内容预览: ${msgTextContent.substring(0, 50)}...`, msgImagePaths.length > 0 ? `图片数量: ${msgImagePaths.length}` : '无图片');

                await handleMessage(senderId, msgTextContent, time, msgImagePaths, senderWithComment); // Pass senderWithComment

            } catch (error) {
                console.error('[BuyTheWay] Euphony 消息处理出错:', error);
            }
        });

        console.log('[BuyTheWay] Euphony 消息监听器初始化完成');

    } catch (error) {
        console.error('[BuyTheWay] 初始化 Euphony 消息监听器出错:', error);
    }
}

// --- 新增：查找带注释的来源 ---
function findSourceWithComment(id, rawList) {
    // 如果没有列表或 ID，则返回原始 ID
    if (!id || !rawList || rawList.length === 0) {
        return id; // 如果没有列表或 ID，则返回原始 ID
    }
    const idStr = String(id);
    for (const item of rawList) {
        if (typeof item === 'string' && item.includes(idStr)) {
            // 基本检查：如果原始字符串项包含 ID。
            // 更可靠的方法：从项目中提取数字并进行比较。
            const extractedNum = extractNumbers(item);
            if (extractedNum === idStr) {
                return item.trim(); // 返回完整的原始字符串（带注释）
            }
        }
    }
    return id; // 如果未找到匹配项，则回退到原始 ID
}

// --- 新增：格式化消息函数 ---
function formatMessage(template, senderWithComment, content, time, imagePaths = []) { // sender is now senderWithComment
    let msgBody = '';
    let emailHtmlBody = '';
    let plainTextForChain = ''; // 新增：用于 MessageChain 的纯文本

    const escapeHtml = (unsafe) => {
        if (typeof unsafe !== 'string') return unsafe;
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };
    const escapedContent = escapeHtml(content);
    const escapedSenderWithComment = escapeHtml(senderWithComment); // Use senderWithComment
    const escapedTime = escapeHtml(time);

    const imageTextHint = (imagePaths.length > 0) ? `\n[包含 ${imagePaths.length} 张图片]` : "";

    // 为 emailHtmlBody 添加图片预览 (使用 cid)
    let imageHtmlForEmail = "";
    if (imagePaths.length > 0) {
        imageHtmlForEmail += "<p><b>图片内容:</b></p>";
        imagePaths.forEach((imgPath, index) => {
            imageHtmlForEmail += `<p><img src="cid:image_${index}" alt="附件图片 ${index + 1}" style="max-width: 100%; height: auto; border: 1px solid #ddd; padding: 2px;"/></p>`;
        });
    }

    const preFormattedContent = `<pre style="white-space: pre-wrap; word-wrap: break-word; margin: 0;">${escapedContent}</pre>`;

    switch (template) {
        case 'emoji':
            plainTextForChain = `🔢 来源：${senderWithComment}\n📝 内容：${content}\n⏰ 时间：${time}`;
            msgBody = plainTextForChain + imageTextHint;
            emailHtmlBody = `<p>🔢 来源：${escapedSenderWithComment}</p><p>📝 内容：</p>${preFormattedContent}${imageHtmlForEmail}<p>⏰ 时间：${escapedTime}</p>`;
            break;
        case 'brackets':
            plainTextForChain = `【来源】『${senderWithComment}』\n【内容】「${content}」\n【时间】『${time}』`;
            msgBody = plainTextForChain + imageTextHint;
            emailHtmlBody = `<p>【来源】『${escapedSenderWithComment}』</p><p>【内容】「${preFormattedContent}」</p>${imageHtmlForEmail}<p>【时间】『${escapedTime}』</p>`;
            break;
        case 'symbols':
            plainTextForChain = `✦ 来源：${senderWithComment}\n✧ 内容：${content}\n✦ 时间：${time}`;
            msgBody = plainTextForChain + imageTextHint;
            emailHtmlBody = `<p>✦ 来源：${escapedSenderWithComment}</p><p>✧ 内容：</p>${preFormattedContent}${imageHtmlForEmail}<p>✦ 时间：${escapedTime}</p>`;
            break;
        case 'markdown_lines':
            plainTextForChain = `---\n### 来源\n${senderWithComment}\n\n### 内容\n${content}\n\n### 时间\n${time}\n---`;
            // msgBody 在 plainTextForChain 的基础上，在最后一个 "---" 前加入图片提示
            msgBody = plainTextForChain.substring(0, plainTextForChain.lastIndexOf('\n---')) + imageTextHint + plainTextForChain.substring(plainTextForChain.lastIndexOf('\n---'));
            emailHtmlBody = `<hr><h3>来源</h3><p>${escapedSenderWithComment}</p><h3>内容</h3>${preFormattedContent}${imageHtmlForEmail}<h3>时间</h3><p>${escapedTime}</p><hr>`;
            break;
        case 'markdown_bold':
            plainTextForChain = `**来源**：${senderWithComment}\n**内容**：${content}\n**时间**：${time}`;
            msgBody = plainTextForChain + imageTextHint;
            emailHtmlBody = `<p><b>来源</b>：${escapedSenderWithComment}</p><p><b>内容</b>：</p>${preFormattedContent}${imageHtmlForEmail}<p><b>时间</b>：${escapedTime}</p>`;
            break;
        case 'markdown_table':
            plainTextForChain = `| 项目 | 内容       |\n|------|------------|\n| 来源 | ${senderWithComment}   |\n| 内容 | ${content}     |\n| 时间 | ${time}    |`;
            msgBody = `| 项目 | 内容       |\n|------|------------|\n| 来源 | ${senderWithComment}   |\n| 内容 | ${content}${imageTextHint} |\n| 时间 | ${time}    |`;
            emailHtmlBody = `<table border="1" style="border-collapse: collapse; width: 100%;">\r\n                             <thead><tr><th style="padding: 5px; text-align: left;">项目</th><th style="padding: 5px; text-align: left;">内容</th></tr></thead>\r\n                             <tbody>\r\n                               <tr><td style="padding: 5px;">来源</td><td style="padding: 5px;">${escapedSenderWithComment}</td></tr>\r\n                               <tr><td style="padding: 5px;">内容</td><td style="padding: 5px;">${preFormattedContent}${imageHtmlForEmail}</td></tr>\r\n                               <tr><td style="padding: 5px;">时间</td><td style="padding: 5px;">${escapedTime}</td></tr>\r\n                             </tbody>\r\n                           </table>`;
            break;
        case 'default':
        default:
            plainTextForChain = `来源: ${senderWithComment}\n内容: ${content}\n时间: ${time}`;
            msgBody = plainTextForChain + imageTextHint;
            emailHtmlBody = `<p><b>来源</b>: ${escapedSenderWithComment}</p><p><b>内容</b>：</p>${preFormattedContent}${imageHtmlForEmail}<p><b>时间</b>: ${escapedTime}</p>`;
            break;
    }

    return { msgBody, emailHtmlBody, plainTextForChain };
}

// --- 新增：提取数字的辅助函数 ---
const extractNumbers = (str) => {
    if (typeof str !== 'string') return null;
    const match = str.match(/\d+/); // 查找第一个数字序列
    return match ? match[0] : null; // 返回第一个匹配项或 null

};

// 处理接收到的消息
async function handleMessage(senderId, content, time, imagePaths = [], senderWithComment = null) {
    try {
        // 加载配置
        let config = null;
        if (window.buy_the_way_api && window.buy_the_way_api.loadConfig) {
            const result = await window.buy_the_way_api.loadConfig();
            if (result.success) {
                config = result.config;
            } else {
                console.error('[BuyTheWay] 处理消息时加载配置失败:', result.error);
                return;
            }
        } else {
            console.error('[BuyTheWay] buy_the_way_api.loadConfig 不可用');
            return;
        }

        // --- 新增：检查总开关 ---
        if (!config.pluginEnabled) {
            // console.log('[BuyTheWay] 插件已通过配置禁用。跳过渲染器中的消息处理。'); // 可以取消注释以进行调试
            return; // 如果插件在配置中被禁用，则直接返回
        }
        // --- 总开关检查结束 ---

        // 检查是否需要监控此消息来源 (使用 Raw 数据并提取数字)
        const monitoredGroupsRaw = config.monitoredGroups || []; // 备选方案
        const senderIdNumeric = parseInt(senderId);
        const monitoredGroupIds = monitoredGroupsRaw.map(extractNumbers).filter(Boolean);

        // 使用 senderId（数字）检查它是否在监控列表中
        const isMonitored = config.monitoredGroupsRaw && config.monitoredGroupsRaw.some(group => {
            const groupNumericPart = parseInt(group.match(/\d+/)?.[0]);
            return !isNaN(groupNumericPart) && groupNumericPart === senderIdNumeric;
        });

        // 如果未传递 senderWithComment（例如来自较早的调用或不同来源），请尝试查找它
        if (!senderWithComment && isMonitored) {
            senderWithComment = getOriginalSenderId(senderId, config.monitoredGroupsRaw) || senderId.toString();
        } else if (!senderWithComment) {
            senderWithComment = senderId.toString(); // 如果不在监控列表且没有提供，则默认为 senderId
        }

        console.log(`[BuyTheWay] 消息来源 ${senderId} (显示为: ${senderWithComment}) 在监控列表 [${monitoredGroupIds.join(', ')}] 中`);

        // 关键词匹配 - 修复逻辑
        const keywords = config.targetProducts || [];
        console.log(`[BuyTheWay] 关键词列表: ${JSON.stringify(keywords)}`);
        console.log(`[BuyTheWay] 消息内容: "${content}"`);

        let matched = false;
        if (keywords.length > 0) {
            // 将消息内容转为小写，用于不区分大小写的比较
            const lowerContent = content.toLowerCase();

            matched = keywords.some(keyword => {
                // 去除关键词两端的空格并转为小写
                const lowerKeyword = keyword.trim().toLowerCase();
                if (!lowerKeyword) return false; // 跳过空关键词

                // 正确的匹配：检查消息内容是否包含关键词
                const isMatch = lowerContent.includes(lowerKeyword);
                console.log(`[BuyTheWay] 检查消息 ("${lowerContent}") 是否包含关键词 ("${lowerKeyword}"): ${isMatch ? '是' : '否'}`);
                return isMatch;
            });

            if (!matched) {
                console.log('[BuyTheWay] 未匹配到任何关键词，跳过处理');
                return;
            } else {
                console.log('[BuyTheWay] 匹配到关键词，将处理消息转发');
            }
        } else {
            console.log('[BuyTheWay] 无关键词配置，处理所有消息');
            // 如果没有关键词，默认视为匹配成功，处理所有消息
            matched = true;
        }

        // 如果需要转发 (matched 为 true)
        if (matched) {
            const template = config.messageFormatTemplate || 'default';
            console.log(`[BuyTheWay] 使用消息模板: ${template}`);

            // Use finalSenderToDisplay for formatting
            const { msgBody, emailHtmlBody, plainTextForChain } = formatMessage(template, senderWithComment, content, time, imagePaths);

            // 转发到QQ好友
            const forwardToUsersConfig = config.forwardConfig?.toUsers;
            if (forwardToUsersConfig?.enabled) {
                const usersRaw = forwardToUsersConfig.usersRaw || forwardToUsersConfig.users || [];
                const userIdsToForward = usersRaw.map(extractNumbers).filter(Boolean);

                if (userIdsToForward.length > 0) {
                    console.log(`[BuyTheWay] 准备转发到 ${userIdsToForward.length} 个QQ好友:`, userIdsToForward);
                    for (const userId of userIdsToForward) {
                        try {
                            const friend = window.euphony.Friend.fromUin(userId);
                            if (friend) {
                                if (imagePaths.length > 0 && window.euphony.MessageChain && window.euphony.PlainText && window.euphony.Image) {
                                    // 使用 MessageChain 发送图文混合消息
                                    try {
                                        const messageChain = new window.euphony.MessageChain();
                                        if (plainTextForChain.trim()) {
                                            messageChain.append(new window.euphony.PlainText(plainTextForChain));
                                        }
                                        for (const imgPath of imagePaths) {
                                            messageChain.append(new window.euphony.Image(imgPath));
                                        }

                                        if (messageChain.get(0) !== undefined) { // 确保链不为空
                                            await friend.sendMessage(messageChain);
                                            console.log(`[BuyTheWay] 成功通过 MessageChain 转发给好友 ${userId}`);
                                        } else {
                                            console.log(`[BuyTheWay] MessageChain 为空 (无文本和图片), 未发送给好友 ${userId}`);
                                        }
                                    } catch (chainError) {
                                        console.error(`[BuyTheWay] 使用 MessageChain 转发给好友 ${userId} 失败:`, chainError, ". 尝试仅发送文本.");
                                        // Fallback: 仅发送文本 (msgBody 包含图片提示)
                                        if (msgBody.trim()) {
                                            await friend.sendMessage(new window.euphony.PlainText(msgBody));
                                            console.log(`[BuyTheWay] Fallback: 成功转发纯文本给好友 ${userId}`);
                                        }
                                    }
                                } else {
                                    // 无图片或 MessageChain 组件不可用，仅发送文本 (msgBody 可能包含图片提示)
                                    if (msgBody.trim()) {
                                        await friend.sendMessage(new window.euphony.PlainText(msgBody));
                                        console.log(`[BuyTheWay] 成功转发纯文本消息给好友 ${userId} (无图片或MessageChain不可用)`);
                                    }
                                }
                            } else {
                                console.warn(`[BuyTheWay] 未找到好友 ${userId}，无法转发`);
                            }
                        } catch (err) {
                            // Find the original line for logging context
                            const originalLine = usersRaw.find(line => extractNumbers(line) === userId) || userId;
                            console.error(`[BuyTheWay] 转发到好友 ${originalLine} (ID: ${userId}) 失败:`, err);
                        }
                    }
                } else {
                    console.log('[BuyTheWay] QQ用户转发已启用，但未找到有效的用户ID');
                }
            } else {
                console.log('[BuyTheWay] QQ用户转发未启用');
            }


            // 转发到QQ群 (修改：使用 groupsRaw 并提取数字)
            const forwardToGroupsConfig = config.forwardConfig?.toGroups;
            if (forwardToGroupsConfig?.enabled) {
                const groupsRaw = forwardToGroupsConfig.groupsRaw || forwardToGroupsConfig.groups || [];
                const groupIdsToForward = groupsRaw.map(extractNumbers).filter(Boolean);

                if (groupIdsToForward.length > 0) {
                    console.log(`[BuyTheWay] 准备转发到 ${groupIdsToForward.length} 个QQ群:`, groupIdsToForward);
                    for (const groupId of groupIdsToForward) {
                        try {
                            const groupObj = window.euphony.Group.make(groupId);
                            if (groupObj) {
                                if (imagePaths.length > 0 && window.euphony.MessageChain && window.euphony.PlainText && window.euphony.Image) {
                                    // 使用 MessageChain 发送图文混合消息
                                    try {
                                        const messageChain = new window.euphony.MessageChain();
                                        if (plainTextForChain.trim()) {
                                            messageChain.append(new window.euphony.PlainText(plainTextForChain));
                                        }
                                        for (const imgPath of imagePaths) {
                                            messageChain.append(new window.euphony.Image(imgPath));
                                        }

                                        if (messageChain.get(0) !== undefined) { // 确保链不为空
                                            await groupObj.sendMessage(messageChain);
                                            console.log(`[BuyTheWay] 成功通过 MessageChain 转发给群 ${groupId}`);
                                        } else {
                                            console.log(`[BuyTheWay] MessageChain 为空 (无文本和图片), 未发送给群 ${groupId}`);
                                        }
                                    } catch (chainError) {
                                        console.error(`[BuyTheWay] 使用 MessageChain 转发给群 ${groupId} 失败:`, chainError, ". 尝试仅发送文本.");
                                        // Fallback: 仅发送文本 (msgBody 包含图片提示)
                                        if (msgBody.trim()) {
                                            await groupObj.sendMessage(new window.euphony.PlainText(msgBody));
                                            console.log(`[BuyTheWay] Fallback: 成功转发纯文本给群 ${groupId}`);
                                        }
                                    }
                                } else {
                                    // 无图片或 MessageChain 组件不可用，仅发送文本 (msgBody 可能包含图片提示)
                                    if (msgBody.trim()) {
                                        await groupObj.sendMessage(new window.euphony.PlainText(msgBody));
                                        console.log(`[BuyTheWay] 成功转发纯文本消息给群 ${groupId} (无图片或MessageChain不可用)`);
                                    }
                                }
                            } else {
                                console.warn(`[BuyTheWay] 未找到群 ${groupId}，无法转发`);
                            }
                        } catch (err) {
                            // Find the original line for logging context
                            const originalLine = groupsRaw.find(line => extractNumbers(line) === groupId) || groupId;
                            console.error(`[BuyTheWay] 转发到群 ${originalLine} (ID: ${groupId}) 失败:`, err);
                        }
                    }
                } else {
                    console.log('[BuyTheWay] QQ群转发已启用，但未找到有效的群ID');
                }
            } else {
                console.log('[BuyTheWay] QQ群转发未启用');
            }


            // 转发到Email (这部分逻辑之前似乎没问题，保持不变)
            if (config.emailConfig && config.emailConfig.enabled) {
                console.log('[BuyTheWay] 准备通过邮件转发消息, 图片数量:', imagePaths.length);
                const emailConfig = config.emailConfig;
                const subject = `BuyTheWay 消息匹配: ${senderWithComment}`; // 在主题中使用 senderWithComment

                if (!window.buy_the_way_api || !window.buy_the_way_api.sendEmail) {
                    console.error('[BuyTheWay] 邮件发送接口不可用');
                    return; // 修正：应该是 return; 而不是 continue; (因为不在循环中)
                }

                try {
                    // 将 imagePaths 传递给 sendEmail API
                    const result = await window.buy_the_way_api.sendEmail(
                        emailConfig,
                        subject,
                        emailHtmlBody, // emailHtmlBody 已包含图片 cid 引用
                        imagePaths      // 传递原始图片路径列表
                    );

                    if (result.success) {
                        console.log('[BuyTheWay] 邮件发送成功:', result.messageId);
                    } else {
                        console.error('[BuyTheWay] 邮件发送失败:', result.error);
                    }
                } catch (err) {
                    console.error('[BuyTheWay] 发送邮件时出错:', err);
                }
            } else {
                console.log('[BuyTheWay] 邮件转发未启用');
            }
        }

    } catch (error) {
        console.error('[BuyTheWay] 处理消息时出错:', error);
    }
}

// 在页面加载完成后初始化 Euphony 消息监听
window.addEventListener('DOMContentLoaded', () => {
    console.log('[BuyTheWay] 页面加载完成，启动 Euphony 监听器');
    // 稍微延迟，确保 Euphony 已加载
    setTimeout(startEuphonyMessageListener, 2000);
});

// 尝试立即启动一次（如果页面已经加载完成）
setTimeout(startEuphonyMessageListener, 500);

// --- 消息转发功能 ---
// 转发消息到指定QQ
async function forwardMessageToUsers(data) {
    try {
        console.log('[BuyTheWay] 收到转发到QQ用户的请求:', data ?
            `包含 ${data.users?.length || 0} 个目标用户` : '数据为空');

        if (!data || !data.users || !data.users.length || !data.content) {
            console.error('[BuyTheWay] 转发到QQ的数据格式不正确:', data);
            return;
        }

        console.log('[BuyTheWay] 准备转发消息到以下QQ:', data.users.join(', '));
        console.log('[BuyTheWay] 待转发内容:', data.content);

        // 执行转发操作
        for (const userId of data.users) {
            try {
                console.log(`[BuyTheWay] 尝试转发消息到QQ: ${userId}`);

                // 查找聊天列表元素
                const chatListItems = document.querySelectorAll('.chat-item, .list-item, .contact-item, .list-item-container');
                console.log(`[BuyTheWay] 找到 ${chatListItems.length} 个可能的聊天列表项`);

                // 输出所有可能的列表项，帮助调试
                let itemsInfo = [];
                chatListItems.forEach((item, index) => {
                    const text = item.textContent || '';
                    const classes = Array.from(item.classList).join(', ');
                    const id = item.id || 'no-id';
                    const dataAttr = Object.keys(item.dataset).map(k => `data-${k}="${item.dataset[k]}"`).join(' ');
                    itemsInfo.push(`[${index}] 类: ${classes}, ID: ${id}, data属性: ${dataAttr}, 文本: ${text.substring(0, 30)}...`);
                });
                console.log('[BuyTheWay] 可能的聊天列表项详情:', itemsInfo.join('\n'));

                // 尝试查找并点击目标QQ的聊天列表项
                let found = false;
                for (const item of chatListItems) {
                    // 检查列表项中是否包含用户ID
                    const itemText = item.textContent || '';
                    const dataUin = item.getAttribute('data-uin') || '';
                    const dataId = item.getAttribute('data-id') || '';

                    if (itemText.includes(userId) || dataUin === userId || dataId === userId) {
                        console.log(`[BuyTheWay] 找到可能的目标QQ列表项: ${itemText.substring(0, 20)}...`);

                        // 尝试点击
                        try {
                            console.log('[BuyTheWay] 尝试点击QQ聊天项');
                            item.click();
                            console.log(`[BuyTheWay] 已点击QQ聊天项: ${userId}`);
                            found = true;

                            // 等待聊天窗口打开
                            setTimeout(() => {
                                try {
                                    // 查找输入框
                                    console.log('[BuyTheWay] 正在查找输入框元素');
                                    const inputBoxes = document.querySelectorAll('.text-box, .chat-input, .text-input, .editor, [contenteditable="true"]');
                                    console.log(`[BuyTheWay] 找到 ${inputBoxes.length} 个可能的输入框`);

                                    // 记录找到的输入框元素
                                    let inputBoxInfo = [];
                                    inputBoxes.forEach((box, index) => {
                                        const tag = box.tagName;
                                        const classes = Array.from(box.classList).join(', ');
                                        const editable = box.getAttribute('contenteditable') || 'false';
                                        inputBoxInfo.push(`[${index}] 标签: ${tag}, 类: ${classes}, contenteditable: ${editable}`);
                                    });
                                    console.log('[BuyTheWay] 输入框详情:', inputBoxInfo.join('\n'));

                                    let inputBox = null;
                                    for (const box of inputBoxes) {
                                        if (box.isContentEditable || box.getAttribute('contenteditable') === 'true' ||
                                            box.tagName === 'TEXTAREA' || box.tagName === 'INPUT') {
                                            inputBox = box;
                                            break;
                                        }
                                    }

                                    if (inputBox) {
                                        console.log('[BuyTheWay] 找到输入框，正在输入消息');

                                        // 设置输入框内容
                                        if (inputBox.isContentEditable || inputBox.getAttribute('contenteditable') === 'true') {
                                            // contenteditable div
                                            inputBox.innerHTML = data.content;
                                            console.log('[BuyTheWay] 已设置消息内容到contenteditable元素');

                                            // 模拟输入事件
                                            const inputEvent = new Event('input', { bubbles: true });
                                            inputBox.dispatchEvent(inputEvent);
                                            console.log('[BuyTheWay] 已触发input事件');

                                            // 模拟focus事件
                                            const focusEvent = new Event('focus', { bubbles: true });
                                            inputBox.dispatchEvent(focusEvent);
                                            console.log('[BuyTheWay] 已触发focus事件');
                                        } else {
                                            // 普通input/textarea
                                            inputBox.value = data.content;
                                            console.log('[BuyTheWay] 已设置消息内容到input/textarea元素');

                                            // 模拟输入事件
                                            const inputEvent = new Event('input', { bubbles: true });
                                            inputBox.dispatchEvent(inputEvent);

                                            // 模拟change事件
                                            const changeEvent = new Event('change', { bubbles: true });
                                            inputBox.dispatchEvent(changeEvent);
                                        }

                                        // 查找并点击发送按钮
                                        setTimeout(() => {
                                            console.log('[BuyTheWay] 开始查找发送按钮');
                                            const sendButtons = document.querySelectorAll('.send-btn, .btn-send, [data-action="send"], .send-button');

                                            if (sendButtons.length > 0) {
                                                console.log(`[BuyTheWay] 找到 ${sendButtons.length} 个可能的发送按钮`);

                                                // 记录找到的发送按钮
                                                let buttonInfo = [];
                                                sendButtons.forEach((btn, index) => {
                                                    const tag = btn.tagName;
                                                    const classes = Array.from(btn.classList).join(', ');
                                                    const text = btn.textContent || '';
                                                    buttonInfo.push(`[${index}] 标签: ${tag}, 类: ${classes}, 文本: ${text}`);
                                                });
                                                console.log('[BuyTheWay] 发送按钮详情:', buttonInfo.join('\n'));

                                                try {
                                                    console.log('[BuyTheWay] 尝试点击第一个发送按钮');
                                                    sendButtons[0].click();
                                                    console.log('[BuyTheWay] 已点击发送按钮');
                                                } catch (btnErr) {
                                                    console.error('[BuyTheWay] 点击发送按钮失败:', btnErr);
                                                }
                                            } else {
                                                // 尝试模拟回车键发送
                                                console.log('[BuyTheWay] 未找到发送按钮，尝试模拟回车键');
                                                try {
                                                    const enterEvent = new KeyboardEvent('keydown', {
                                                        bubbles: true,
                                                        cancelable: true,
                                                        key: 'Enter',
                                                        code: 'Enter',
                                                        keyCode: 13,
                                                        which: 13
                                                    });
                                                    inputBox.dispatchEvent(enterEvent);
                                                    console.log('[BuyTheWay] 已模拟发送回车键');
                                                } catch (enterErr) {
                                                    console.error('[BuyTheWay] 模拟回车键失败:', enterErr);
                                                }
                                            }
                                        }, 500);
                                    } else {
                                        console.error('[BuyTheWay] 未找到合适的消息输入框');
                                    }
                                } catch (inputErr) {
                                    console.error('[BuyTheWay] 尝试输入消息时出错:', inputErr);
                                }
                            }, 1000);

                            break;
                        } catch (clickErr) {
                            console.error('[BuyTheWay] 点击聊天项时出错:', clickErr);
                        }
                    }
                }

                if (!found) {
                    console.warn(`[BuyTheWay] 未找到目标QQ: ${userId} 的聊天列表项`);
                }

            } catch (err) {
                console.error(`[BuyTheWay] 转发到QQ ${userId} 时出错:`, err);
            }
        }
        console.log('[BuyTheWay] 完成QQ转发请求处理');
    } catch (error) {
        console.error('[BuyTheWay] 处理QQ转发请求时出错:', error);
    }
}

// 转发消息到指定群聊
async function forwardMessageToGroups(data) {
    try {
        console.log('[BuyTheWay] 收到转发到QQ群的请求:', data ?
            `包含 ${data.groups?.length || 0} 个目标群` : '数据为空');

        if (!data || !data.groups || !data.groups.length || !data.content) {
            console.error('[BuyTheWay] 转发到群聊的数据格式不正确:', data);
            return;
        }

        console.log('[BuyTheWay] 准备转发消息到以下群聊:', data.groups.join(', '));
        console.log('[BuyTheWay] 待转发内容:', data.content);

        // 执行转发操作
        for (const groupId of data.groups) {
            try {
                console.log(`[BuyTheWay] 尝试转发消息到群聊: ${groupId}`);

                // 查找群聊列表元素
                const groupListItems = document.querySelectorAll('.chat-item, .list-item, .group-item, .list-item-container');
                console.log(`[BuyTheWay] 找到 ${groupListItems.length} 个可能的群聊列表项`);

                // 输出所有可能的列表项，帮助调试
                let itemsInfo = [];
                groupListItems.forEach((item, index) => {
                    const text = item.textContent || '';
                    const classes = Array.from(item.classList).join(', ');
                    const id = item.id || 'no-id';
                    const dataAttr = Object.keys(item.dataset).map(k => `data-${k}="${item.dataset[k]}"`).join(' ');
                    itemsInfo.push(`[${index}] 类: ${classes}, ID: ${id}, data属性: ${dataAttr}, 文本: ${text.substring(0, 30)}...`);
                });
                console.log('[BuyTheWay] 可能的群聊列表项详情:', itemsInfo.join('\n'));

                // 尝试查找并点击目标群的聊天列表项
                let found = false;
                for (const item of groupListItems) {
                    // 检查列表项中是否包含群ID
                    const itemText = item.textContent || '';
                    const dataUin = item.getAttribute('data-uin') || '';
                    const dataId = item.getAttribute('data-id') || '';

                    if (itemText.includes(groupId) || dataUin === groupId || dataId === groupId) {
                        console.log(`[BuyTheWay] 找到可能的目标群列表项: ${itemText.substring(0, 20)}...`);

                        // 尝试点击
                        try {
                            console.log('[BuyTheWay] 尝试点击群聊项');
                            item.click();
                            console.log(`[BuyTheWay] 已点击群聊项: ${groupId}`);
                            found = true;

                            // 等待聊天窗口打开
                            setTimeout(() => {
                                try {
                                    // 查找输入框
                                    console.log('[BuyTheWay] 正在查找输入框元素');
                                    const inputBoxes = document.querySelectorAll('.text-box, .chat-input, .text-input, .editor, [contenteditable="true"]');
                                    console.log(`[BuyTheWay] 找到 ${inputBoxes.length} 个可能的输入框`);

                                    // 记录找到的输入框元素
                                    let inputBoxInfo = [];
                                    inputBoxes.forEach((box, index) => {
                                        const tag = box.tagName;
                                        const classes = Array.from(box.classList).join(', ');
                                        const editable = box.getAttribute('contenteditable') || 'false';
                                        inputBoxInfo.push(`[${index}] 标签: ${tag}, 类: ${classes}, contenteditable: ${editable}`);
                                    });
                                    console.log('[BuyTheWay] 输入框详情:', inputBoxInfo.join('\n'));

                                    let inputBox = null;
                                    for (const box of inputBoxes) {
                                        if (box.isContentEditable || box.getAttribute('contenteditable') === 'true' ||
                                            box.tagName === 'TEXTAREA' || box.tagName === 'INPUT') {
                                            inputBox = box;
                                            break;
                                        }
                                    }

                                    if (inputBox) {
                                        console.log('[BuyTheWay] 找到输入框，正在输入消息');

                                        // 设置输入框内容
                                        if (inputBox.isContentEditable || inputBox.getAttribute('contenteditable') === 'true') {
                                            // contenteditable div
                                            inputBox.innerHTML = data.content;
                                            console.log('[BuyTheWay] 已设置消息内容到contenteditable元素');

                                            // 模拟输入事件
                                            const inputEvent = new Event('input', { bubbles: true });
                                            inputBox.dispatchEvent(inputEvent);
                                            console.log('[BuyTheWay] 已触发input事件');

                                            // 模拟focus事件
                                            const focusEvent = new Event('focus', { bubbles: true });
                                            inputBox.dispatchEvent(focusEvent);
                                            console.log('[BuyTheWay] 已触发focus事件');
                                        } else {
                                            // 普通input/textarea
                                            inputBox.value = data.content;
                                            console.log('[BuyTheWay] 已设置消息内容到input/textarea元素');

                                            // 模拟输入事件
                                            const inputEvent = new Event('input', { bubbles: true });
                                            inputBox.dispatchEvent(inputEvent);

                                            // 模拟change事件
                                            const changeEvent = new Event('change', { bubbles: true });
                                            inputBox.dispatchEvent(changeEvent);
                                        }

                                        // 查找并点击发送按钮
                                        setTimeout(() => {
                                            console.log('[BuyTheWay] 开始查找发送按钮');
                                            const sendButtons = document.querySelectorAll('.send-btn, .btn-send, [data-action="send"], .send-button');

                                            if (sendButtons.length > 0) {
                                                console.log(`[BuyTheWay] 找到 ${sendButtons.length} 个可能的发送按钮`);

                                                // 记录找到的发送按钮
                                                let buttonInfo = [];
                                                sendButtons.forEach((btn, index) => {
                                                    const tag = btn.tagName;
                                                    const classes = Array.from(btn.classList).join(', ');
                                                    const text = btn.textContent || '';
                                                    buttonInfo.push(`[${index}] 标签: ${tag}, 类: ${classes}, 文本: ${text}`);
                                                });
                                                console.log('[BuyTheWay] 发送按钮详情:', buttonInfo.join('\n'));

                                                try {
                                                    console.log('[BuyTheWay] 尝试点击第一个发送按钮');
                                                    sendButtons[0].click();
                                                    console.log('[BuyTheWay] 已点击发送按钮');
                                                } catch (btnErr) {
                                                    console.error('[BuyTheWay] 点击发送按钮失败:', btnErr);
                                                }
                                            } else {
                                                // 尝试模拟回车键发送
                                                console.log('[BuyTheWay] 未找到发送按钮，尝试模拟回车键');
                                                try {
                                                    const enterEvent = new KeyboardEvent('keydown', {
                                                        bubbles: true,
                                                        cancelable: true,
                                                        key: 'Enter',
                                                        code: 'Enter',
                                                        keyCode: 13,
                                                        which: 13
                                                    });
                                                    inputBox.dispatchEvent(enterEvent);
                                                    console.log('[BuyTheWay] 已模拟发送回车键');
                                                } catch (enterErr) {
                                                    console.error('[BuyTheWay] 模拟回车键失败:', enterErr);
                                                }
                                            }
                                        }, 500);
                                    } else {
                                        console.error('[BuyTheWay] 未找到合适的消息输入框');
                                    }
                                } catch (inputErr) {
                                    console.error('[BuyTheWay] 尝试输入消息时出错:', inputErr);
                                }
                            }, 1000);

                            break;
                        } catch (clickErr) {
                            console.error('[BuyTheWay] 点击群聊项时出错:', clickErr);
                        }
                    }
                }

                if (!found) {
                    console.warn(`[BuyTheWay] 未找到目标群: ${groupId} 的聊天列表项`);
                }

            } catch (err) {
                console.error(`[BuyTheWay] 转发到群聊 ${groupId} 时出错:`, err);
            }
        }
        console.log('[BuyTheWay] 完成群聊转发请求处理');
    } catch (error) {
        console.error('[BuyTheWay] 处理群聊转发请求时出错:', error);
    }
}

// 从消息元素中提取详细信息
// 警告：以下选择器是基于推测和常见模式，需要针对实际 QQNT DOM 结构进行调试和调整！
function extractChatMessageDetails(node) {
    try {
        // 尝试获取消息 ID (通常在 data-* 属性或 id 中)
        const messageId = node.getAttribute('data-element-id') || node.id || node.getAttribute('data-id');
        if (!messageId || globalState.processedMessageIds.has(messageId)) {
            // 如果没有 ID 或已处理，则跳过
            return null;
        }

        // 尝试获取发送者信息
        const senderElement = node.querySelector('.q-sender-name, .sender-nick, .user-nick, .nick'); // 更多可能的选择器
        const sender = senderElement ? senderElement.textContent.trim() : '未知发送者';

        // 尝试获取消息内容 (处理文本、图片 Alt、表情 Title 等)
        const contentElement = node.querySelector('.q-message-content, .message-content, .content, .text-content'); // 更多可能的选择器
        let content = '';
        if (contentElement) {
            // 尝试获取所有文本片段，包括图片 alt 和表情 title
            content = Array.from(contentElement.childNodes)
                .map(child => {
                    if (child.nodeType === Node.TEXT_NODE) {
                        return child.textContent;
                    } else if (child.nodeType === Node.ELEMENT_NODE) {
                        // 尝试获取图片 alt 或表情 title/data-key
                        return child.getAttribute('alt') || child.getAttribute('title') || child.getAttribute('data-key') || child.textContent;
                    }
                    return '';
                })
                .join('')
                .trim();
        }
        if (!content) content = '（非文本消息）'; // 如果无法提取文本，给个标记

        // 尝试获取时间戳 (可能在特定属性或邻近元素)
        const timeElement = node.querySelector('.q-message-time, .message-time, .time'); // 更多可能的选择器
        // QQNT 的时间显示可能不标准，这里仅作示例
        const time = timeElement ? timeElement.textContent.trim() : new Date().toLocaleTimeString();

        // === 获取 chatId 和消息类型 (关键且困难) ===
        let chatId = 'unknown_chat';
        let type = '未知消息';
        let groupName = '';

        // 尝试从父级聊天窗口容器获取 chatId (data-chat-id, data-peer-uin 等)
        const chatContainer = node.closest('.chat-container, .chat-area, .chat-content, .root'); // 更多可能的选择器
        if (chatContainer) {
            chatId = chatContainer.getAttribute('data-chat-id')
                || chatContainer.getAttribute('data-peer-uin')
                || chatContainer.getAttribute('peer-uin')
                || chatContainer.id // 有时容器 ID 可能包含 chatId
                || 'unknown_chat_id';

            // 尝试根据容器类名判断类型
            if (chatContainer.classList.contains('group') || chatContainer.classList.contains('group-chat')) {
                type = '群消息';
                // 尝试获取群名称 (可能在聊天窗口标题)
                // 注意：在 MutationObserver 中直接获取标题可能不准确，最好由 main 进程管理当前聊天信息
                const groupTitleElement = document.querySelector('.chat-info__title, .title-container .name, .chat-title .name'); // 更多可能的选择器
                groupName = groupTitleElement ? groupTitleElement.textContent.trim() : '未知群聊';
            } else if (chatContainer.classList.contains('private') || chatContainer.classList.contains('c2c-chat')) {
                type = '私聊消息';
            }
        }
        // ==========================================

        // 过滤掉不完整的消息
        if (!chatId || chatId === 'unknown_chat_id') {
            console.warn('[BuyTheWay] 无法确定消息节点的 chatId:', node);
            // return null; // 暂时不过滤，方便调试
        }

        const messageData = {
            id: messageId,
            type: type,
            chatId: chatId,
            groupName: groupName, // 可能为空
            sender: sender,
            time: time, // 注意：时间格式和准确性待定
            content: content,
            timestamp: Date.now() // 添加一个处理时的时间戳
        };

        // 标记为已处理
        globalState.processedMessageIds.add(messageId);
        // 清理旧的已处理 ID，防止内存无限增长 (例如保留最近 1000 条)
        if (globalState.processedMessageIds.size > 1000) {
            const oldestId = globalState.processedMessageIds.values().next().value;
            globalState.processedMessageIds.delete(oldestId);
        }

        return messageData;

    } catch (error) {
        console.error('[BuyTheWay] Error extracting message details:', error, node);
        return null;
    }
}


// 处理 DOM 变动
function handleMutations(mutationsList) {
    const now = Date.now();
    let newMessagesFound = false;

    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach(node => {
                // 仅处理元素节点
                if (node.nodeType !== Node.ELEMENT_NODE) return;

                // 检查节点是否已在短时间内处理过
                if (globalState.nodeCache.has(node) && (now - globalState.nodeCache.get(node) < 500)) {
                    return;
                }
                globalState.nodeCache.set(node, now);

                // 查找消息节点 (自身或子孙)
                const messageNodes = [];
                // 检查自身是否是消息节点
                // 增加更多可能的选择器
                if (node.matches('.message, .chat-item, .message-container, .msg-bubble-item, .q-message-recalled-item-node, .q-message-item-node')) {
                    messageNodes.push(node);
                }
                // 查找子孙消息节点
                // 增加更多可能的选择器
                messageNodes.push(...node.querySelectorAll('.message, .chat-item, .message-container, .msg-bubble-item, .q-message-recalled-item-node, .q-message-item-node'));

                if (messageNodes.length > 0) {
                    newMessagesFound = true;
                    messageNodes.forEach(msgNode => {
                        // 再次检查缓存，因为 querySelectorAll 可能返回已处理的父节点下的子节点
                        if (globalState.nodeCache.has(msgNode) && (now - globalState.nodeCache.get(msgNode) < 500)) {
                            return;
                        }
                        globalState.nodeCache.set(msgNode, now);

                        const messageData = extractChatMessageDetails(msgNode);
                        if (messageData) {
                            // console.log('[BuyTheWay] Detected message:', messageData);
                            // 发送消息到主进程
                            if (window.buy_the_way_api && window.buy_the_way_api.sendMessageToMain) {
                                window.buy_the_way_api.sendMessageToMain(messageData);
                            } else {
                                console.error('[BuyTheWay] API buy_the_way_api.sendMessageToMain not found!');
                            }
                        }
                    });
                }
            });
        }
    }
    // 清理节点缓存中超过 5 秒的条目
    for (const [node, timestamp] of globalState.nodeCache.entries()) {
        if (now - timestamp > 5000) {
            globalState.nodeCache.delete(node);
        }
    }
}

// 开始监听
function startObserver() {
    if (globalState.isObserving) {
        console.log('[BuyTheWay] 观察者已在运行。');
        return;
    }

    // 沿用 qqMessageSave 的方式，监听整个文档
    // 优点：简单，不易错过目标
    // 缺点：性能开销可能较大
    const targetNode = document.documentElement;

    if (!targetNode) {
        console.error('[BuyTheWay] 找不到 document.documentElement。观察者无法启动。');
        return;
    }

    // 配置 MutationObserver
    const config = {
        childList: true, // 监听子节点的添加或删除
        subtree: true    // 监听后代节点的变化
    };

    // 创建并启动观察者
    globalState.observer = new MutationObserver(handleMutations);
    globalState.observer.observe(targetNode, config);
    globalState.isObserving = true;

    console.log('[BuyTheWay] 消息观察者已在 document.documentElement 上启动。');
}

// 停止监听
function stopObserver() {
    if (globalState.observer) {
        globalState.observer.disconnect();
        globalState.observer = null;
        globalState.isObserving = false;
        globalState.processedMessageIds.clear(); // 清空已处理 ID
        globalState.nodeCache.clear(); // 清空节点缓存
        console.log('[BuyTheWay] 消息观察者已停止。');
    }
}

// --- 仅处理关键词、邮件和监控群设置 ---
function getSettingsFromForm(view) {
    return {
        pluginEnabled: view.querySelector('#pluginEnabled').checked,
        targetProducts: view.querySelector('#targetProducts').value.split('\n').map(s => s.trim()).filter(Boolean), // Keywords still need filtering
        emailConfig: {
            enabled: view.querySelector('#emailEnabled').checked,
            host: view.querySelector('#emailHost').value.trim(),
            port: parseInt(view.querySelector('#emailPort').value, 10) || 465,
            secure: view.querySelector('#emailSecure').checked,
            auth: {
                user: view.querySelector('#emailUser').value.trim(),
                pass: view.querySelector('#emailPass').value.trim()
            },
            to: view.querySelector('#emailTo').value.trim()
        },
        // 保存原始文本，按行分割
        monitoredGroupsRaw: view.querySelector('#monitoredGroups').value.split('\n'),
        forwardConfig: {
            toUsers: {
                enabled: view.querySelector('#forwardToUsersEnabled')?.checked || false,
                // 保存原始文本
                usersRaw: view.querySelector('#forwardToUsers')?.value.split('\n') || []
            },
            toGroups: {
                enabled: view.querySelector('#forwardToGroupsEnabled')?.checked || false,
                // 保存原始文本
                groupsRaw: view.querySelector('#forwardToGroups')?.value.split('\n') || []
            }
        },
        messageFormatTemplate: view.querySelector('#messageFormatTemplate')?.value || 'default'
    };
}

// --- 辅助函数：防抖 ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- 自动保存设置 ---
async function autoSaveSettings(view) {
    console.log('[BuyTheWay] Settings changed, triggering auto-save...');
    const newConfig = getSettingsFromForm(view);
    console.log('[BuyTheWay] 正在自动保存设置:', newConfig);
    if (window.buy_the_way_api && window.buy_the_way_api.saveConfig) {
        try {
            const result = await window.buy_the_way_api.saveConfig(newConfig);
            if (result.success) {
                console.log('[BuyTheWay] 设置自动保存成功。');
            } else {
                console.error('[BuyTheWay] 自动保存配置失败:', result.error);
                if (window.buy_the_way_api.showToast) {
                    window.buy_the_way_api.showToast(`自动保存配置失败: ${result.error}`, 'error');
                }
            }
        } catch (error) {
            console.error('[BuyTheWay] 调用 saveConfig 时出错:', error);
            if (window.buy_the_way_api.showToast) {
                window.buy_the_way_api.showToast('自动保存配置时出错', 'error');
            }
        }
    } else {
        console.error('[BuyTheWay] API saveConfig 未找到!');
    }
}

// --- 填充关键词、邮件和监控群设置 ---
function setSettingsToForm(view, config = {}) {
    view.querySelector('#pluginEnabled').checked = config.pluginEnabled === undefined ? true : config.pluginEnabled;
    view.querySelector('#targetProducts').value = (config.targetProducts || []).join('\n');
    const emailConfig = config.emailConfig || {};
    view.querySelector('#emailEnabled').checked = emailConfig.enabled || false;
    view.querySelector('#emailHost').value = emailConfig.host || '';
    view.querySelector('#emailPort').value = emailConfig.port || 465;
    view.querySelector('#emailSecure').checked = emailConfig.secure === undefined ? true : emailConfig.secure;
    view.querySelector('#emailUser').value = emailConfig.auth?.user || '';
    view.querySelector('#emailPass').value = emailConfig.auth?.pass || '';
    view.querySelector('#emailTo').value = emailConfig.to || '';
    // 填充监控群组 (使用原始文本)
    // 使用 config.monitoredGroupsRaw，如果不存在则 fallback 到旧的 config.monitoredGroups 或空数组
    view.querySelector('#monitoredGroups').value = (config.monitoredGroupsRaw || config.monitoredGroups || []).join('\n');

    // 设置转发配置
    const forwardConfig = config.forwardConfig || {};
    const toUsers = forwardConfig.toUsers || {};
    if (view.querySelector('#forwardToUsersEnabled')) {
        view.querySelector('#forwardToUsersEnabled').checked = toUsers.enabled || false;
    }
    if (view.querySelector('#forwardToUsers')) {
        // 填充转发用户 (使用原始文本)
        view.querySelector('#forwardToUsers').value = (toUsers.usersRaw || toUsers.users || []).join('\n');
    }
    const toGroups = forwardConfig.toGroups || {};
    if (view.querySelector('#forwardToGroupsEnabled')) {
        view.querySelector('#forwardToGroupsEnabled').checked = toGroups.enabled || false;
    }
    if (view.querySelector('#forwardToGroups')) {
        // 填充转发群组 (使用原始文本)
        view.querySelector('#forwardToGroups').value = (toGroups.groupsRaw || toGroups.groups || []).join('\n');
    }

    // 设置消息格式模板
    if (view.querySelector('#messageFormatTemplate')) {
        view.querySelector('#messageFormatTemplate').value = config.messageFormatTemplate || 'default';
    }

    // 控制可见性
    toggleEmailConfigVisibility(view, emailConfig.enabled || false);
    toggleForwardSectionVisibility(view);
}

// --- 辅助函数：切换邮件配置区域可见性 ---
function toggleEmailConfigVisibility(view, enabled) {
    const emailDetailsSection = view.querySelector('#emailDetailsSection');
    // 始终显示邮件服务器配置区域，不受复选框控制
    if (emailDetailsSection) {
        emailDetailsSection.classList.remove('hidden');
    }
}

// --- 辅助函数：切换转发配置区域可见性 ---
function toggleForwardSectionVisibility(view) {
    // QQ转发配置区域
    const forwardToUsersEnabled = view.querySelector('#forwardToUsersEnabled');
    const forwardToUsersSection = view.querySelector('#forwardToUsersSection');

    if (forwardToUsersEnabled && forwardToUsersSection) {
        if (forwardToUsersEnabled.checked) {
            forwardToUsersSection.classList.remove('hidden');
        } else {
            forwardToUsersSection.classList.add('hidden');
        }

        // 添加变更监听
        forwardToUsersEnabled.addEventListener('change', () => {
            if (forwardToUsersEnabled.checked) {
                forwardToUsersSection.classList.remove('hidden');
            } else {
                forwardToUsersSection.classList.add('hidden');
            }
        });
    }

    // 群聊转发配置区域
    const forwardToGroupsEnabled = view.querySelector('#forwardToGroupsEnabled');
    const forwardToGroupsSection = view.querySelector('#forwardToGroupsSection');

    if (forwardToGroupsEnabled && forwardToGroupsSection) {
        if (forwardToGroupsEnabled.checked) {
            forwardToGroupsSection.classList.remove('hidden');
        } else {
            forwardToGroupsSection.classList.add('hidden');
        }

        // 添加变更监听
        forwardToGroupsEnabled.addEventListener('change', () => {
            if (forwardToGroupsEnabled.checked) {
                forwardToGroupsSection.classList.remove('hidden');
            } else {
                forwardToGroupsSection.classList.add('hidden');
            }
        });
    }
}

// 打开设置界面时触发
export async function onSettingWindowCreated(view) {
    console.log('[BuyTheWay] Settings window created.');

    // 创建防抖版的自动保存函数
    const debouncedAutoSave = debounce(() => autoSaveSettings(view), 500); // 500ms 延迟

    // 2. 加载 HTML 内容
    try {
        // 使用 PLUGIN_PATH 别名加载 settings.html
        const settingsHtmlPath = `local:///${PLUGIN_PATH.replace(/\\/g, '/')}/src/settings.html`;
        console.log(`[BuyTheWay] Fetching settings HTML from: ${settingsHtmlPath}`);
        const response = await fetch(settingsHtmlPath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for ${settingsHtmlPath}`);
        }
        const settingsHtml = await response.text();
        view.innerHTML = settingsHtml; // 将加载的 HTML 注入视图

        // 3. 加载初始设置 (确保在 DOM 更新后执行)
        if (window.buy_the_way_api && window.buy_the_way_api.loadConfig) {
            try {
                const result = await window.buy_the_way_api.loadConfig();
                if (result.success) {
                    console.log("[BuyTheWay] Config loaded:", result.config);
                    setSettingsToForm(view, result.config); // 使用加载的配置填充表单
                } else {
                    console.error('[BuyTheWay] 加载配置失败:', result.error);
                    if (window.buy_the_way_api.showToast) {
                        window.buy_the_way_api.showToast('加载配置失败', 'error');
                    }
                    setSettingsToForm(view, {}); // 加载失败也尝试用默认值填充
                }
            } catch (error) {
                console.error('[BuyTheWay] 调用 loadConfig 时出错:', error);
                if (window.buy_the_way_api.showToast) {
                    window.buy_the_way_api.showToast('加载配置时出错', 'error');
                }
                setSettingsToForm(view, {}); // 出错也尝试用默认值填充
            }
        } else {
            console.error('[BuyTheWay] API loadConfig 未找到!');
            setSettingsToForm(view, {}); // API 缺失也尝试用默认值填充
        }

        // 4. 添加事件监听器 (确保在 DOM 更新后执行)

        // --- 新增：导入/导出所有配置 ---
        const exportAllBtn = view.querySelector('#exportAllSettingsButton');
        const importAllBtn = view.querySelector('#importAllSettingsButton');
        const importAllInput = view.querySelector('#importAllSettingsInput');

        if (exportAllBtn) {
            exportAllBtn.addEventListener('click', () => {
                try {
                    const currentConfig = getSettingsFromForm(view);
                    const configJson = JSON.stringify(currentConfig, null, 4); // Pretty print JSON
                    const blob = new Blob([configJson], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'buytheway_settings.json'; // Suggest filename
                    a.click();
                    URL.revokeObjectURL(url);
                    console.log('[BuyTheWay] All settings exported.');
                    if (window.buy_the_way_api?.showToast) {
                        window.buy_the_way_api.showToast('所有配置已导出', 'success');
                    }
                } catch (error) {
                    console.error('[BuyTheWay] Error exporting all settings:', error);
                    if (window.buy_the_way_api?.showToast) {
                        window.buy_the_way_api.showToast(`导出配置失败: ${error.message}`, 'error');
                    }
                }
            });
        }

        if (importAllBtn && importAllInput) {
            importAllBtn.addEventListener('click', () => importAllInput.click()); // Trigger file input

            importAllInput.addEventListener('change', (event) => {
                const file = event.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const importedConfig = JSON.parse(e.target.result);
                        console.log('[BuyTheWay] Importing settings:', importedConfig);
                        setSettingsToForm(view, importedConfig); // Update the form fields
                        debouncedAutoSave(); // Trigger auto-save for the imported settings
                        console.log('[BuyTheWay] All settings imported and applied.');
                        if (window.buy_the_way_api?.showToast) {
                            window.buy_the_way_api.showToast('配置已成功导入并应用', 'success');
                        }
                    } catch (error) {
                        console.error('[BuyTheWay] Error importing settings:', error);
                        if (window.buy_the_way_api?.showToast) {
                            window.buy_the_way_api.showToast(`导入配置失败: ${error.message}`, 'error');
                        }
                    } finally {
                        // Reset file input to allow importing the same file again
                        importAllInput.value = '';
                    }
                };
                reader.onerror = (error) => {
                    console.error('[BuyTheWay] Error reading import file:', error);
                    if (window.buy_the_way_api?.showToast) {
                        window.buy_the_way_api.showToast(`读取导入文件失败: ${error.message}`, 'error');
                    }
                    importAllInput.value = ''; // Reset file input
                };
                reader.readAsText(file);
            });
        }
        // --- 导入/导出所有配置结束 ---

        // 为所有输入元素添加自动保存监听器
        const inputs = view.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            const eventType = (input.type === 'checkbox' || input.type === 'radio' || input.tagName === 'SELECT') ? 'change' : 'input';
            input.addEventListener(eventType, debouncedAutoSave);
        });

        // 邮件启用复选框 (已包含在上面的 inputs 监听中，但保留 toggleEmailConfigVisibility 的逻辑)
        const emailEnabledCheckbox = view.querySelector('#emailEnabled');
        if (emailEnabledCheckbox) {
            emailEnabledCheckbox.addEventListener('change', (event) => {
                toggleEmailConfigVisibility(view, event.target.checked);
            });
        }

        // 导入导出关键词和群ID
        const exportKeywordsBtn = view.querySelector('#exportTargetProductsButton');
        const importKeywordsBtn = view.querySelector('#importTargetProductsButton');
        const importKeywordsInput = view.querySelector('#importTargetProductsInput');
        exportKeywordsBtn.addEventListener('click', () => {
            const lines = view.querySelector('#targetProducts').value.split('\n').filter(Boolean);
            const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'keywords.txt'; a.click(); URL.revokeObjectURL(url);
        });
        importKeywordsBtn.addEventListener('click', () => importKeywordsInput.click());
        importKeywordsInput.addEventListener('change', e => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader(); reader.onload = ev => {
                view.querySelector('#targetProducts').value = ev.target.result.trim();
                debouncedAutoSave(); // 导入后触发自动保存
            }; reader.readAsText(file);
            importKeywordsInput.value = '';
        });

        const exportGroupsBtn = view.querySelector('#exportMonitoredGroupsButton');
        const importGroupsBtn = view.querySelector('#importMonitoredGroupsButton');
        const importGroupsInput = view.querySelector('#importMonitoredGroupsInput');
        exportGroupsBtn.addEventListener('click', () => {
            const lines = view.querySelector('#monitoredGroups').value.split('\n').filter(Boolean);
            const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'groups.txt'; a.click(); URL.revokeObjectURL(url);
        });
        importGroupsBtn.addEventListener('click', () => importGroupsInput.click());
        importGroupsInput.addEventListener('change', e => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader(); reader.onload = ev => {
                view.querySelector('#monitoredGroups').value = ev.target.result.trim();
                debouncedAutoSave(); // 导入后触发自动保存
            }; reader.readAsText(file);
            importGroupsInput.value = '';
        });

        // 添加转发用户列表的导入导出
        const exportForwardUsersBtn = view.querySelector('#exportForwardToUsersButton');
        const importForwardUsersBtn = view.querySelector('#importForwardToUsersButton');
        const importForwardUsersInput = view.querySelector('#importForwardToUsersInput');
        if (exportForwardUsersBtn) {
            exportForwardUsersBtn.addEventListener('click', () => {
                const lines = view.querySelector('#forwardToUsers').value.split('\n').filter(Boolean);
                const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = 'forward_users.txt'; a.click(); URL.revokeObjectURL(url);
            });
        }
        if (importForwardUsersBtn && importForwardUsersInput) {
            importForwardUsersBtn.addEventListener('click', () => importForwardUsersInput.click());
            importForwardUsersInput.addEventListener('change', e => {
                const file = e.target.files[0]; if (!file) return;
                const reader = new FileReader(); reader.onload = ev => {
                    view.querySelector('#forwardToUsers').value = ev.target.result.trim();
                    debouncedAutoSave(); // 导入后触发自动保存
                }; reader.readAsText(file);
                importForwardUsersInput.value = '';
            });
        }

        // 添加转发群组列表的导入导出
        const exportForwardGroupsBtn = view.querySelector('#exportForwardToGroupsButton');
        const importForwardGroupsBtn = view.querySelector('#importForwardToGroupsButton');
        const importForwardGroupsInput = view.querySelector('#importForwardToGroupsInput');
        if (exportForwardGroupsBtn) {
            exportForwardGroupsBtn.addEventListener('click', () => {
                const lines = view.querySelector('#forwardToGroups').value.split('\n').filter(Boolean);
                const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = 'forward_groups.txt'; a.click(); URL.revokeObjectURL(url);
            });
        }
        if (importForwardGroupsBtn && importForwardGroupsInput) {
            importForwardGroupsBtn.addEventListener('click', () => importForwardGroupsInput.click());
            importForwardGroupsInput.addEventListener('change', e => {
                const file = e.target.files[0]; if (!file) return;
                const reader = new FileReader(); reader.onload = ev => {
                    view.querySelector('#forwardToGroups').value = ev.target.result.trim();
                    debouncedAutoSave(); // 导入后触发自动保存
                }; reader.readAsText(file);
                importForwardGroupsInput.value = '';
            });
        }

        // 测试发送邮件按钮
        const testEmailBtn = view.querySelector('#testEmailButton');
        if (testEmailBtn) {
            testEmailBtn.addEventListener('click', async () => {
                const { emailConfig } = getSettingsFromForm(view);
                if (!emailConfig.enabled) {
                    return window.buy_the_way_api.showToast('请先启用邮件通知并填写邮箱配置', 'warning');
                }
                const subject = 'BuyTheWay 测试邮件';
                const body = '<p>这是一封测试邮件，请忽略。</p>';
                try {
                    const result = await window.buy_the_way_api.sendEmail(emailConfig, subject, body);
                    if (result.success) {
                        window.buy_the_way_api.showToast('测试邮件已发送', 'success');
                    } else {
                        window.buy_the_way_api.showToast(`测试邮件发送失败：${result.error}`, 'error');
                    }
                } catch (error) {
                    window.buy_the_way_api.showToast(`测试邮件发送异常：${error.message}`, 'error');
                }
            });
        }

        // 初始化转发设置区域的可见性
        toggleForwardSectionVisibility(view);

    } catch (error) {
        console.error('[BuyTheWay] Error loading or processing settings HTML:', error);
        view.innerHTML = `<p style="color: red;">错误：加载设置界面失败。详情请查看控制台。</p><p>${error.message || error}</p>`;
    }
}

// 注册转发相关的监听器
function registerForwardListeners() {
    // 检查是否已注册过
    if (window._buyTheWayListenersRegistered) {
        console.log('[BuyTheWay] 转发监听器已注册，跳过');
        return;
    }

    if (window.buy_the_way_api) {
        console.log('[BuyTheWay] 开始注册转发监听器...');
        if (window.buy_the_way_api.onForwardToUsers) {
            window.buy_the_way_api.onForwardToUsers(forwardMessageToUsers);
            console.log('[BuyTheWay] 已注册转发到QQ消息的监听器');
        } else {
            console.error('[BuyTheWay] onForwardToUsers API 不存在');
        }

        if (window.buy_the_way_api.onForwardToGroups) {
            window.buy_the_way_api.onForwardToGroups(forwardMessageToGroups);
            console.log('[BuyTheWay] 已注册转发到群聊消息的监听器');
        } else {
            console.error('[BuyTheWay] onForwardToGroups API 不存在');
        }

        // 标记已注册
        window._buyTheWayListenersRegistered = true;
        console.log('[BuyTheWay] 转发监听器注册完成');
    } else {
        console.error('[BuyTheWay] buy_the_way_api 不存在，无法注册转发监听器');
        // 稍后再尝试
        setTimeout(registerForwardListeners, 1000);
    }
}

// 确保在页面加载完成后注册监听器
window.addEventListener('DOMContentLoaded', () => {
    console.log('[BuyTheWay] 页面加载完成，尝试注册监听器');
    setTimeout(registerForwardListeners, 1000);
});

// 即使已经加载完成，也尝试立即注册一次
setTimeout(registerForwardListeners, 0);

// Vue组件挂载时触发 (参考 qqMessageSave)
export function onVueComponentMount(component) {
    // 可以在这里根据 component 的类型判断是否是聊天窗口相关的组件
    // 但为了简单起见，只要有 Vue 组件挂载就尝试启动监听器
    console.log('[BuyTheWay] onVueComponentMount triggered. Ensuring observer is running.');
    // 使用 setTimeout 确保 DOM 结构稳定
    setTimeout(startObserver, 1000);

    // 组件挂载时也尝试注册转发监听器
    registerForwardListeners();
}

// Vue组件卸载时触发
export function onVueComponentUnmount(component) {
    // console.log('[BuyTheWay] onVueComponentUnmount triggered.');
    // 暂时不在组件卸载时停止监听，因为可能只是切换了聊天窗口
    // stopObserver(); // 如果需要，可以在这里停止
}