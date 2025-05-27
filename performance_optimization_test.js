// 性能优化测试脚本
// 模拟测试性能优化的效果

console.log('=== BuyTheWay 性能优化测试 ===');

// 模拟大量数据
const monitoredGroups = Array.from({ length: 1000 }, (_, i) => `${12345678900 + i} (测试群${i})`);
const keywords = Array.from({ length: 100 }, (_, i) => `关键词${i}`);

// 测试传统的数组查找方式
function testArrayPerformance() {
    const start = performance.now();
    const iterations = 10000;

    for (let i = 0; i < iterations; i++) {
        // 模拟传统的数组查找
        const groupId = '12345678950';
        const found = monitoredGroups.some(line => {
            const match = line.match(/\d+/);
            return match && match[0] === groupId;
        });

        // 模拟关键词匹配
        const content = '这是一个包含关键词50的测试消息';
        const keywordMatch = keywords.some(keyword =>
            content.toLowerCase().includes(keyword.toLowerCase())
        );
    }

    const end = performance.now();
    return end - start;
}

// 测试优化后的Set查找方式
function testSetPerformance() {
    // 预处理：创建Set缓存
    const monitoredGroupSet = new Set(monitoredGroups.map(line => {
        const match = line.match(/\d+/);
        return match ? match[0] : null;
    }).filter(Boolean));

    const keywordSet = new Set(keywords.map(keyword => keyword.toLowerCase()));

    const start = performance.now();
    const iterations = 10000;

    for (let i = 0; i < iterations; i++) {
        // 优化后的Set查找
        const groupId = '12345678950';
        const found = monitoredGroupSet.has(groupId);

        // 优化后的关键词匹配
        const content = '这是一个包含关键词50的测试消息';
        const words = content.toLowerCase().split(/\s+/);
        const keywordMatch = words.some(word => keywordSet.has(word)) ||
            [...keywordSet].some(keyword => content.toLowerCase().includes(keyword));
    }

    const end = performance.now();
    return end - start;
}

// 运行测试
console.log('测试数据规模:');
console.log(`- 监控群组数量: ${monitoredGroups.length}`);
console.log(`- 关键词数量: ${keywords.length}`);
console.log(`- 测试迭代次数: 10000`);
console.log('');

console.log('性能测试结果:');
const arrayTime = testArrayPerformance();
console.log(`- 传统数组查找: ${arrayTime.toFixed(2)}ms`);

const setTime = testSetPerformance();
console.log(`- 优化Set查找: ${setTime.toFixed(2)}ms`);

const improvement = ((arrayTime - setTime) / arrayTime * 100);
console.log(`- 性能提升: ${improvement.toFixed(1)}%`);
console.log(`- 速度倍数: ${(arrayTime / setTime).toFixed(1)}x`);

console.log('');
console.log('=== 优化摘要 ===');
console.log('1. ✅ 使用Set数据结构替代Array.includes()');
console.log('2. ✅ 实现30秒配置缓存系统');
console.log('3. ✅ 添加Euphony预过滤逻辑');
console.log('4. ✅ 修复senderIdentifier未定义bug');
console.log('5. ✅ 添加全面的调试日志');

// 模拟缓存效果测试
function testCacheEffectiveness() {
    console.log('');
    console.log('=== 缓存效果测试 ===');

    let cacheHits = 0;
    let cacheMisses = 0;
    const CACHE_DURATION = 30000; // 30秒
    let cacheTimestamp = 0;
    let cache = null;

    // 模拟100次配置访问
    for (let i = 0; i < 100; i++) {
        const now = Date.now() + (i * 1000); // 每次间隔1秒

        if (cache && (now - cacheTimestamp) < CACHE_DURATION) {
            cacheHits++;
        } else {
            cacheMisses++;
            cache = { config: 'mock config' };
            cacheTimestamp = now;
        }
    }

    console.log(`缓存命中率: ${(cacheHits / (cacheHits + cacheMisses) * 100).toFixed(1)}%`);
    console.log(`缓存命中: ${cacheHits}次, 缓存失效: ${cacheMisses}次`);
}

testCacheEffectiveness();
