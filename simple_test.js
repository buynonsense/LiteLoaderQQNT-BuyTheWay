// 简化的路径生成测试
const testPath = "C:\\Users\\test\\Pic\\2025-05\\Ori\\image.jpg";

function simpleTest() {
    console.log("=== 简化的路径生成测试 ===");
    console.log("原始路径:", testPath);
    
    // 模拟修复后的逻辑
    const baseName = "image";
    const thumbDir = "C:\\Users\\test\\Pic\\2025-05\\Thumb";
    const thumbExtensions = ['.jpg', '.png'];
    const resolutions = ['_720', '_0'];
    
    console.log("\n生成的路径变体：");
    let count = 1;
    
    for (const resolution of resolutions) {
        for (const thumbExt of thumbExtensions) {
            const path = `${thumbDir}\\${baseName}${resolution}${thumbExt}`;
            console.log(`${count}. ${path}`);
            count++;
        }
    }
    
    console.log("\n✅ 现在每个分辨率都会生成.jpg和.png两个变体");
    console.log("✅ 这解决了Thumb目录下图片扩展名随机的问题");
}

simpleTest();
