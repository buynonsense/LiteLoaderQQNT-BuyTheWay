/**
 * 测试脚本：验证 v1.1.5 的智能图片处理增强功能
 * 
 * 测试场景：
 * 1. 文件完整性检测
 * 2. 文件写入状态检测  
 * 3. 自适应重试策略
 * 4. 增强错误诊断
 */

const fs = require('fs').promises;
const path = require('path');

// 模拟 checkFileExists 函数 (基于 v1.1.5 的增强版本)
async function checkFileExists(filePath) {
    try {
        if (!filePath || typeof filePath !== 'string') {
            console.warn("checkFileExists: 无效的文件路径", filePath);
            return { exists: false, error: "无效的文件路径" };
        }

        console.log(`检查文件存在性: ${filePath}`);

        try {
            await fs.access(filePath, fs.constants.F_OK | fs.constants.R_OK);
            
            // 获取文件统计信息以确保文件完整性
            const stats = await fs.stat(filePath);
            
            // 检查文件大小是否合理
            if (stats.size === 0) {
                console.warn(`文件大小为0，可能正在写入中: ${filePath}`);
                return { exists: false, error: "文件大小为0，可能正在写入中", size: 0 };
            }

            // 检查文件是否最近被修改
            const now = new Date();
            const modifiedTime = stats.mtime;
            const timeDiffMs = now - modifiedTime;
            
            if (timeDiffMs < 100) {
                console.warn(`文件最近被修改(${timeDiffMs}ms前)，可能正在写入中: ${filePath}`);
                return { exists: false, error: "文件最近被修改，可能正在写入中", recentlyModified: true };
            }

            console.log(`文件访问成功: ${filePath} (大小: ${stats.size}字节, 修改时间: ${modifiedTime.toISOString()})`);
            return { 
                exists: true, 
                size: stats.size, 
                mtime: modifiedTime,
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory()
            };
            
        } catch (accessError) {
            console.warn(`文件访问失败: ${filePath}`, {
                code: accessError.code,
                errno: accessError.errno,
                message: accessError.message
            });
            
            try {
                const stats = await fs.stat(filePath);
                console.log(`文件存在但无法访问:`, {
                    size: stats.size,
                    isFile: stats.isFile(),
                    mode: stats.mode,
                    atime: stats.atime,
                    mtime: stats.mtime
                });
                
                return { 
                    exists: false, 
                    error: accessError.code || accessError.message,
                    fileExists: true,
                    possibleCause: "权限问题或文件被锁定"
                };
            } catch (statError) {
                console.warn(`文件不存在: ${filePath}`);
                return { 
                    exists: false, 
                    error: accessError.code || accessError.message,
                    fileExists: false
                };
            }
        }
    } catch (error) {
        console.error("检查文件存在性时出错:", error);
        return { exists: false, error: error.message };
    }
}

// 模拟智能重试策略
async function smartRetryStrategy(pathVariants, maxWaitTime = 10000) {
    const startTime = Date.now();
    let attempt = 0;
    const initialDelay = 300;
    const maxDelay = 1500;
    
    console.log(`开始智能重试策略，最大等待时间: ${maxWaitTime}ms`);
    console.log(`待检查的路径变体:`, pathVariants);

    while (Date.now() - startTime < maxWaitTime) {
        attempt++;

        for (let i = 0; i < pathVariants.length; i++) {
            const path = pathVariants[i];
            
            const result = await checkFileExists(path);
            
            if (result.exists) {
                console.log(`✅ 文件就绪 (尝试 ${attempt}, 变体 ${i+1}/${pathVariants.length}): ${path}`);
                return path;
            } else if (result.recentlyModified || result.size === 0) {
                console.log(`📝 文件正在写入中，快速重试: ${path}`);
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const retryResult = await checkFileExists(path);
                if (retryResult.exists) {
                    console.log(`✅ 快速重试成功: ${path}`);
                    return path;
                }
            }
        }

        const elapsed = Date.now() - startTime;
        const remaining = maxWaitTime - elapsed;
        
        if (remaining > 0) {
            let delay;
            if (attempt <= 3) {
                delay = initialDelay;
            } else if (attempt <= 8) {
                delay = initialDelay + 200;
            } else {
                delay = Math.min(initialDelay + (attempt - 8) * 300, maxDelay);
            }
            
            const actualDelay = Math.min(delay, remaining);
            
            console.log(`文件暂未就绪，等待 ${actualDelay}ms 后重试... (尝试 ${attempt}, 已用时 ${elapsed}ms)`);
            await new Promise(resolve => setTimeout(resolve, actualDelay));
        }
    }

    console.warn(`⏰ 重试超时，尝试次数: ${attempt}`);
    return null;
}

// 测试函数
async function runTests() {
    console.log('='.repeat(60));
    console.log('LiteLoaderQQNT-BuyTheWay v1.1.5 智能图片处理测试');
    console.log('='.repeat(60));

    // 测试1：正常文件检测
    console.log('\n📋 测试1：正常文件检测');
    console.log('-'.repeat(40));
    const testFile = './package.json'; // 使用一个确实存在的文件
    const result1 = await checkFileExists(testFile);
    console.log('测试结果:', result1);

    // 测试2：不存在的文件
    console.log('\n📋 测试2：不存在文件的处理');
    console.log('-'.repeat(40));
    const result2 = await checkFileExists('./nonexistent.jpg');
    console.log('测试结果:', result2);

    // 测试3：空路径处理
    console.log('\n📋 测试3：无效路径处理');
    console.log('-'.repeat(40));
    const result3 = await checkFileExists('');
    console.log('测试结果:', result3);

    // 测试4：智能重试策略模拟
    console.log('\n📋 测试4：智能重试策略模拟');
    console.log('-'.repeat(40));
    const testPaths = [
        './nonexistent1.jpg',
        './nonexistent2.jpg', 
        './package.json'  // 最后一个存在，模拟最终找到
    ];
    const result4 = await smartRetryStrategy(testPaths, 5000);
    console.log('智能重试结果:', result4);

    console.log('\n' + '='.repeat(60));
    console.log('测试完成！v1.1.5 智能增强功能验证结束');
    console.log('='.repeat(60));
}

// 运行测试
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = {
    checkFileExists,
    smartRetryStrategy,
    runTests
};
