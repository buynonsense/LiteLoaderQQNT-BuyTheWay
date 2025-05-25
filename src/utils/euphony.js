// utils/euphony.js - Euphony 图片处理增强模块

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
     * @param {string} filePath - 文件路径
     * @returns {Promise<boolean>} 文件是否可访问
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
    }

    /**
     * 生成可能的图片路径变体
     * @param {string} originalPath - 原始路径
     * @returns {string[]} 路径变体数组，按优先级排序
     */
    generatePathVariants(originalPath) {
        if (!originalPath || typeof originalPath !== 'string') {
            return [];
        }

        const variants = [];
        const dir = originalPath.substring(0, originalPath.lastIndexOf('/') + 1) ||
            originalPath.substring(0, originalPath.lastIndexOf('\\') + 1);
        let filename = originalPath.substring(originalPath.lastIndexOf('/') + 1) ||
            originalPath.substring(originalPath.lastIndexOf('\\') + 1);

        const dotIndex = filename.lastIndexOf('.');
        if (dotIndex === -1) {
            return [originalPath]; // 没有扩展名，直接返回原路径
        }

        const name = filename.substring(0, dotIndex);
        const ext = filename.substring(dotIndex);

        // 1. 优先尝试缩略图路径
        if (originalPath.includes("\\Ori\\") || originalPath.includes("/Ori/")) {
            const thumbPath = originalPath.replace(/[\\\/]Ori[\\\/]/g, function (match) {
                return match.replace('Ori', 'Thumb');
            });

            // 尝试不同分辨率的缩略图
            const thumbDir = thumbPath.substring(0, thumbPath.lastIndexOf('/') + 1) ||
                thumbPath.substring(0, thumbPath.lastIndexOf('\\') + 1);

            // 720p 缩略图（高优先级）
            if (!/_\d{3,4}$/.test(name)) {
                variants.push(`${thumbDir}${name}_720${ext}`);
            }

            // 原始缩略图文件名
            variants.push(thumbPath);

            // 其他常见缩略图分辨率
            if (!/_\d{3,4}$/.test(name)) {
                variants.push(`${thumbDir}${name}_0${ext}`); // 最小缩略图
                variants.push(`${thumbDir}${name}_200${ext}`);
                variants.push(`${thumbDir}${name}_480${ext}`);
                variants.push(`${thumbDir}${name}_1080${ext}`);
            }
        }

        // 2. 尝试原始路径
        variants.push(originalPath);

        // 3. 如果不是缩略图路径，尝试生成缩略图路径
        if (!originalPath.includes("\\Thumb\\") && !originalPath.includes("/Thumb/")) {
            const possibleThumbPath = originalPath.replace(/[\\\/]([^\\\/]+)[\\\/]/g, function (match, folder) {
                if (folder !== 'Thumb' && folder !== 'Ori') {
                    return match.replace(folder, 'Thumb');
                }
                return match;
            });

            if (possibleThumbPath !== originalPath) {
                const thumbDir = possibleThumbPath.substring(0, possibleThumbPath.lastIndexOf('/') + 1) ||
                    possibleThumbPath.substring(0, possibleThumbPath.lastIndexOf('\\') + 1);

                if (!/_\d{3,4}$/.test(name)) {
                    variants.push(`${thumbDir}${name}_720${ext}`);
                    variants.push(`${thumbDir}${name}_0${ext}`);
                }
                variants.push(possibleThumbPath);
            }
        }

        // 去重并保持顺序
        return [...new Set(variants)];
    }

    /**
     * 等待文件变为可访问状态
     * @param {string[]} pathVariants - 路径变体数组
     * @param {number} maxWaitTime - 最大等待时间（毫秒）
     * @returns {Promise<string|null>} 可访问的文件路径，如果都不可访问则返回 null
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
     * @param {string} originalPath - Euphony 提供的原始路径
     * @returns {Promise<string|null>} 最终可用的图片路径
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
     * @param {Object} messageChain - Euphony MessageChain 对象
     * @returns {Promise<{textContent: string, imagePaths: string[]}>} 处理结果
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
     * @param {Object} imageElement - Euphony Image 元素
     * @returns {Promise<string|null>} 解析后的图片路径
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

/**
 * 延迟重试机制
 * 用于处理 QQ 后台运行时消息捕获延迟的问题
 */
class DelayedRetryProcessor {
    constructor() {
        this.pendingMessages = new Map();
        this.retryInterval = 5000; // 5秒重试间隔
        this.maxRetries = 3;
        this.maxAge = 30000; // 消息最大生存时间 30秒

        // 启动定期清理
        this.startCleanupTimer();
    }

    /**
     * 添加待重试的消息
     * @param {string} messageId - 消息ID
     * @param {Object} messageData - 消息数据
     * @param {Function} retryCallback - 重试回调函数
     */
    addPendingMessage(messageId, messageData, retryCallback) {
        const now = Date.now();
        this.pendingMessages.set(messageId, {
            data: messageData,
            callback: retryCallback,
            retryCount: 0,
            createdAt: now,
            lastRetry: now
        });

        console.log(`[BuyTheWay] 添加待重试消息: ${messageId}`);
    }

    /**
     * 处理重试逻辑
     */
    async processRetries() {
        const now = Date.now();
        const toRemove = [];

        for (const [messageId, messageInfo] of this.pendingMessages) {
            try {
                // 检查消息是否过期
                if (now - messageInfo.createdAt > this.maxAge) {
                    console.log(`[BuyTheWay] 消息过期，移除: ${messageId}`);
                    toRemove.push(messageId);
                    continue;
                }

                // 检查是否需要重试
                if (now - messageInfo.lastRetry < this.retryInterval) {
                    continue;
                }

                // 检查重试次数
                if (messageInfo.retryCount >= this.maxRetries) {
                    console.log(`[BuyTheWay] 消息重试次数已达上限，移除: ${messageId}`);
                    toRemove.push(messageId);
                    continue;
                }

                // 执行重试
                console.log(`[BuyTheWay] 重试处理消息: ${messageId} (第 ${messageInfo.retryCount + 1} 次)`);
                messageInfo.retryCount++;
                messageInfo.lastRetry = now;

                const success = await messageInfo.callback(messageInfo.data);
                if (success) {
                    console.log(`[BuyTheWay] 消息重试成功: ${messageId}`);
                    toRemove.push(messageId);
                }

            } catch (error) {
                console.error(`[BuyTheWay] 消息重试处理出错 (${messageId}):`, error);
                messageInfo.retryCount++;
                messageInfo.lastRetry = now;
            }
        }

        // 移除已完成或过期的消息
        for (const messageId of toRemove) {
            this.pendingMessages.delete(messageId);
        }
    }

    /**
     * 启动清理定时器
     */
    startCleanupTimer() {
        setInterval(() => {
            this.processRetries();
        }, this.retryInterval);
    }

    /**
     * 获取待处理消息数量
     */
    getPendingCount() {
        return this.pendingMessages.size;
    }
}

// 导出工具类
window.BuyTheWayImageUtils = {
    ImagePathResolver,
    MessageChainProcessor,
    DelayedRetryProcessor
};

console.log('[BuyTheWay] Euphony 增强工具已加载');