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

// --- Euphony 消息监听实现 ---
function startEuphonyMessageListener() {
    try {
        if (typeof window.euphony === 'undefined') {
            console.error('[BuyTheWay] Euphony 库未加载，无法使用消息监听功能');
            return;
        }

        console.log('[BuyTheWay] 开始初始化 Euphony 消息监听器');

        // 使用 Euphony 的事件通道监听消息
        const eventChannel = window.euphony.EventChannel.withTriggers();

        if (!eventChannel) {
            console.error('[BuyTheWay] 创建 Euphony 事件通道失败');
            return;
        }

        // 订阅消息接收事件
        eventChannel.subscribeEvent('receive-message', async (message, source) => {
            try {
                // 获取消息文本内容
                const msgContent = message.contentToString();

                // 获取消息来源
                const contact = source.getContact();
                const sender = contact.getId(); // 发送者QQ号或群号
                const time = new Date().toLocaleString();

                console.log(`[BuyTheWay] 收到消息 - 来源: ${sender}, 内容: ${msgContent.substring(0, 30)}...`);

                // 处理消息
                await handleMessage(sender, msgContent, time);

            } catch (error) {
                console.error('[BuyTheWay] Euphony 消息处理出错:', error);
            }
        });

        console.log('[BuyTheWay] Euphony 消息监听器初始化完成');

    } catch (error) {
        console.error('[BuyTheWay] 初始化 Euphony 消息监听器出错:', error);
    }
}

// 处理接收到的消息
async function handleMessage(sender, content, time) {
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

        // 检查是否需要监控此消息来源
        const monitoredGroups = config.monitoredGroups || [];
        console.log(`[BuyTheWay] 监控列表: ${JSON.stringify(monitoredGroups)}`);
        if (!monitoredGroups.includes(sender)) {
            console.log(`[BuyTheWay] 消息来源 ${sender} 不在监控列表中`);
            return;
        }
        console.log(`[BuyTheWay] 消息来源 ${sender} 在监控列表中`);

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
            // 准备消息内容
            const matchInfo = `来源: ${sender}`;
            const timeInfo = `时间: ${time}`;
            const contentInfo = `内容: ${content}`;

            const msgBody = `${matchInfo}\n${timeInfo}\n${contentInfo}`;
            const emailHtmlBody = `<p><b>${matchInfo}</b></p><p>${timeInfo}</p><p>内容：</p><pre>${content}</pre>`;

            // 转发到QQ好友
            if (config.forwardConfig?.toUsers?.enabled &&
                config.forwardConfig?.toUsers?.users?.length > 0) {

                const users = config.forwardConfig.toUsers.users;
                console.log(`[BuyTheWay] 准备转发到 ${users.length} 个QQ好友`);

                for (const user of users) {
                    try {
                        const friend = window.euphony.Friend.fromUin(user);
                        if (friend) {
                            const msgObj = new window.euphony.PlainText(msgBody);
                            friend.sendMessage(msgObj);
                            console.log(`[BuyTheWay] 成功转发到好友 ${user}`);
                        } else {
                            console.warn(`[BuyTheWay] 未找到好友 ${user}，无法转发`);
                        }
                    } catch (err) {
                        console.error(`[BuyTheWay] 转发到好友 ${user} 失败:`, err);
                    }
                }
            }

            // 转发到QQ群
            if (config.forwardConfig?.toGroups?.enabled &&
                config.forwardConfig?.toGroups?.groups?.length > 0) {

                const groups = config.forwardConfig.toGroups.groups;
                console.log(`[BuyTheWay] 准备转发到 ${groups.length} 个QQ群`);

                for (const group of groups) {
                    try {
                        const groupObj = window.euphony.Group.make(group);
                        if (groupObj) {
                            const msgObj = new window.euphony.PlainText(msgBody);
                            groupObj.sendMessage(msgObj);
                            console.log(`[BuyTheWay] 成功转发到群 ${group}`);
                        } else {
                            console.warn(`[BuyTheWay] 未找到群 ${group}，无法转发`);
                        }
                    } catch (err) {
                        console.error(`[BuyTheWay] 转发到群 ${group} 失败:`, err);
                    }
                }
            }

            // 转发到Email
            if (config.emailConfig && config.emailConfig.enabled) {
                console.log('[BuyTheWay] 准备通过邮件转发消息');

                const emailConfig = config.emailConfig;
                const subject = `BuyTheWay 消息匹配: ${sender}`;

                if (!window.buy_the_way_api || !window.buy_the_way_api.sendEmail) {
                    console.error('[BuyTheWay] 邮件发送接口不可用');
                    return;
                }

                try {
                    const result = await window.buy_the_way_api.sendEmail(
                        emailConfig,
                        subject,
                        emailHtmlBody
                    );

                    if (result.success) {
                        console.log('[BuyTheWay] 邮件发送成功:', result.messageId);
                    } else {
                        console.error('[BuyTheWay] 邮件发送失败:', result.error);
                    }
                } catch (err) {
                    console.error('[BuyTheWay] 发送邮件时出错:', err);
                }
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
            console.warn('[BuyTheWay] Could not determine chatId for message node:', node);
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
        console.log('[BuyTheWay] Observer already running.');
        return;
    }

    // 沿用 qqMessageSave 的方式，监听整个文档
    // 优点：简单，不易错过目标
    // 缺点：性能开销可能较大
    const targetNode = document.documentElement;

    if (!targetNode) {
        console.error('[BuyTheWay] Cannot find document.documentElement. Observer cannot start.');
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

    console.log('[BuyTheWay] Message observer started on document.documentElement.');
}

// 停止监听
function stopObserver() {
    if (globalState.observer) {
        globalState.observer.disconnect();
        globalState.observer = null;
        globalState.isObserving = false;
        globalState.processedMessageIds.clear(); // 清空已处理 ID
        globalState.nodeCache.clear(); // 清空节点缓存
        console.log('[BuyTheWay] Message observer stopped.');
    }
}

// --- 仅处理关键词、邮件和监控群设置 ---
function getSettingsFromForm(view) {
    return {
        targetProducts: view.querySelector('#targetProducts').value.split('\n').map(s => s.trim()).filter(Boolean),
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
        monitoredGroups: view.querySelector('#monitoredGroups').value.split('\n').map(s => s.trim()).filter(Boolean),
        // 添加转发配置
        forwardConfig: {
            toUsers: {
                enabled: view.querySelector('#forwardToUsersEnabled')?.checked || false,
                users: view.querySelector('#forwardToUsers')?.value.split('\n').map(s => s.trim()).filter(Boolean) || []
            },
            toGroups: {
                enabled: view.querySelector('#forwardToGroupsEnabled')?.checked || false,
                groups: view.querySelector('#forwardToGroups')?.value.split('\n').map(s => s.trim()).filter(Boolean) || []
            }
        }
    };
}

// --- 填充关键词、邮件和监控群设置 ---
function setSettingsToForm(view, config = {}) {
    view.querySelector('#targetProducts').value = (config.targetProducts || []).join('\n');
    const emailConfig = config.emailConfig || {};
    view.querySelector('#emailEnabled').checked = emailConfig.enabled || false;
    view.querySelector('#emailHost').value = emailConfig.host || '';
    view.querySelector('#emailPort').value = emailConfig.port || 465;
    view.querySelector('#emailSecure').checked = emailConfig.secure === undefined ? true : emailConfig.secure;
    view.querySelector('#emailUser').value = emailConfig.auth?.user || '';
    view.querySelector('#emailPass').value = emailConfig.auth?.pass || '';
    view.querySelector('#emailTo').value = emailConfig.to || '';
    view.querySelector('#monitoredGroups').value = (config.monitoredGroups || []).join('\n');

    // 设置转发配置
    const forwardConfig = config.forwardConfig || {};

    // 转发到QQ配置
    const toUsers = forwardConfig.toUsers || {};
    if (view.querySelector('#forwardToUsersEnabled')) {
        view.querySelector('#forwardToUsersEnabled').checked = toUsers.enabled || false;
    }
    if (view.querySelector('#forwardToUsers')) {
        view.querySelector('#forwardToUsers').value = (toUsers.users || []).join('\n');
    }

    // 转发到群组配置
    const toGroups = forwardConfig.toGroups || {};
    if (view.querySelector('#forwardToGroupsEnabled')) {
        view.querySelector('#forwardToGroupsEnabled').checked = toGroups.enabled || false;
    }
    if (view.querySelector('#forwardToGroups')) {
        view.querySelector('#forwardToGroups').value = (toGroups.groups || []).join('\n');
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

        // 邮件启用复选框
        const emailEnabledCheckbox = view.querySelector('#emailEnabled');
        if (emailEnabledCheckbox) {
            emailEnabledCheckbox.addEventListener('change', (event) => {
                toggleEmailConfigVisibility(view, event.target.checked);
            });
        }

        // 保存按钮
        const saveButton = view.querySelector('#saveSettingsButton');
        if (saveButton) {
            saveButton.addEventListener('click', async () => {
                const newConfig = getSettingsFromForm(view);
                console.log('[BuyTheWay] 正在保存设置:', newConfig);
                if (window.buy_the_way_api && window.buy_the_way_api.saveConfig) {
                    try {
                        const result = await window.buy_the_way_api.saveConfig(newConfig);
                        if (result.success) {
                            console.log('[BuyTheWay] 设置保存成功。');
                            if (window.buy_the_way_api.showToast) {
                                window.buy_the_way_api.showToast('设置已保存', 'success');
                            }
                        } else {
                            console.error('[BuyTheWay] 保存配置失败:', result.error);
                            if (window.buy_the_way_api.showToast) {
                                window.buy_the_way_api.showToast(`保存配置失败: ${result.error}`, 'error');
                            }
                        }
                    } catch (error) {
                        console.error('[BuyTheWay] 调用 saveConfig 时出错:', error);
                        if (window.buy_the_way_api.showToast) {
                            window.buy_the_way_api.showToast('保存配置时出错', 'error');
                        }
                    }
                } else {
                    console.error('[BuyTheWay] API saveConfig 未找到!');
                }
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
                }; reader.readAsText(file);
                importForwardGroupsInput.value = '';
            });
        }

        // 测试关键词按钮
        const testKeywordsBtn = view.querySelector('#testKeywordsButton');
        if (testKeywordsBtn) {
            testKeywordsBtn.addEventListener('click', () => {
                const { targetProducts } = getSettingsFromForm(view);
                const list = targetProducts.join(', ') || '无关键词';
                if (window.buy_the_way_api.showToast) {
                    window.buy_the_way_api.showToast(`当前关键词：${list}`, 'info');
                }
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