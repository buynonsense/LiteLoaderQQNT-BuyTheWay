// 测试路径标准化修复
// 这个脚本用于验证双斜线路径标准化问题的修复

function normalizePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
        return filePath;
    }

    // 处理Windows路径
    if (filePath.includes('\\')) {
        // 将多个连续的反斜杠替换为单个反斜杠
        return filePath.replace(/\\+/g, '\\');
    } else {
        // 处理Unix路径
        return filePath.replace(/\/+/g, '/');
    }
}

// 测试案例：用户报告的问题路径
const testPaths = [
    'C:\\Users\\buynonsense\\Documents\\Tencent Files\\1044746809\\nt_qq\\nt_data\\Pic\\2025-05\\Thumb\\cfdc7beb03ea3b03ef98d9947e765f40_0.png',
    'C:\\\\Users\\\\buynonsense\\\\Documents\\\\Tencent Files\\\\1044746809\\\\nt_qq\\\\nt_data\\\\Pic\\\\2025-05\\\\Thumb\\\\cfdc7beb03ea3b03ef98d9947e765f40_0.png',
    'C:\\Users\\buynonsense\\Documents\\\\Tencent Files\\1044746809\\nt_qq\\nt_data\\\\Pic\\2025-05\\Thumb\\cfdc7beb03ea3b03ef98d9947e765f40_720.png'
];

console.log('=== 路径标准化测试 ===');
testPaths.forEach((path, index) => {
    console.log(`\n测试 ${index + 1}:`);
    console.log(`原始路径: ${path}`);
    console.log(`标准化后: ${normalizePath(path)}`);
    console.log(`长度变化: ${path.length} -> ${normalizePath(path).length}`);
});

console.log('\n=== 测试完成 ===');
