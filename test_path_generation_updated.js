// 测试路径生成逻辑（支持.jpg和.png扩展名）
function generatePathVariants(originalPath) {
    if (!originalPath || typeof originalPath !== 'string') {
        return [];
    }

    console.log(`开始生成路径变体，原始路径: ${originalPath}`);

    const variants = [];
    
    try {
        // 处理Windows路径，统一使用反斜杠
        const isWindowsPath = originalPath.includes('\\');
        const pathSeparator = isWindowsPath ? '\\' : '/';
        
        // 分离路径和文件名
        const lastSeparatorIndex = originalPath.lastIndexOf(pathSeparator);
        if (lastSeparatorIndex === -1) {
            console.warn(`路径中没有找到分隔符: ${originalPath}`);
            return [originalPath];
        }

        const dirPath = originalPath.substring(0, lastSeparatorIndex);
        const fileName = originalPath.substring(lastSeparatorIndex + 1);
        
        // 分离文件名和扩展名
        const dotIndex = fileName.lastIndexOf('.');
        if (dotIndex === -1) {
            console.warn(`文件名中没有找到扩展名: ${fileName}`);
            return [originalPath];
        }

        const baseName = fileName.substring(0, dotIndex);
        const fileExt = fileName.substring(dotIndex); // 包含点号
        
        console.log(`路径解析 - 目录: "${dirPath}", 文件名: "${baseName}", 扩展名: "${fileExt}"`);

        // 重要: Thumb目录下的缩略图可能是.jpg或.png格式
        const thumbExtensions = ['.jpg', '.png'];  // 支持两种扩展名
        
        // 检查是否是Ori路径
        if (dirPath.includes(`${pathSeparator}Ori`)) {
            // 找到Ori目录的位置并替换为Thumb
            const oriPattern = `${pathSeparator}Ori`;
            const oriIndex = dirPath.lastIndexOf(oriPattern);
            if (oriIndex !== -1) {
                const beforeOri = dirPath.substring(0, oriIndex);
                const afterOri = dirPath.substring(oriIndex + oriPattern.length);
                const thumbDir = beforeOri + `${pathSeparator}Thumb` + afterOri;
                
                console.log(`Ori->Thumb 路径转换: "${dirPath}" -> "${thumbDir}"`);
                
                // 生成缩略图路径变体（按优先级排序，同时支持.jpg和.png）
                const resolutions = ['_720', '_0', '_200', '_480', ''];
                const thumbPaths = [];
                
                for (const resolution of resolutions) {
                    for (const thumbExt of thumbExtensions) {
                        thumbPaths.push(`${thumbDir}${pathSeparator}${baseName}${resolution}${thumbExt}`);
                    }
                }
                
                variants.push(...thumbPaths);
                console.log(`生成的Thumb路径（包含jpg和png变体）:`, thumbPaths);
            }
        } else if (dirPath.includes(`${pathSeparator}Thumb`)) {
            // 如果已经是Thumb路径，生成不同分辨率的变体
            const resolutions = ['_720', '_0', '_200', ''];
            const thumbPaths = [];
            
            for (const resolution of resolutions) {
                for (const thumbExt of thumbExtensions) {
                    thumbPaths.push(`${dirPath}${pathSeparator}${baseName}${resolution}${thumbExt}`);
                }
            }
            
            variants.push(...thumbPaths);
            console.log(`已是Thumb路径，生成变体（包含jpg和png）:`, thumbPaths);
        } else {
            // 其他情况，尝试在当前目录查找
            const resolutions = ['_720', '_0'];
            for (const resolution of resolutions) {
                for (const thumbExt of thumbExtensions) {
                    variants.push(`${dirPath}${pathSeparator}${baseName}${resolution}${thumbExt}`);
                }
            }
            console.log(`其他路径类型，生成基本变体（包含jpg和png）`);
        }

        // 总是添加原始路径作为最后的备选
        variants.push(originalPath);

    } catch (error) {
        console.error(`路径解析错误:`, error);
        variants.push(originalPath);
    }

    // 去除重复项
    const uniqueVariants = [...new Set(variants)];
    console.log(`最终生成 ${uniqueVariants.length} 个路径变体:`, uniqueVariants);
    
    return uniqueVariants;
}

// 测试用例
const testPath = "C:\\Users\\buynonsense\\Documents\\Tencent Files\\1044746809\\nt_qq\\nt_data\\Pic\\2025-05\\Ori\\3ae4c853e167f6cca265cf06ef880913.jpg";
console.log("=== 测试路径生成逻辑（支持.jpg和.png） ===");
const result = generatePathVariants(testPath);
console.log("\n=== 预期结果 ===");
console.log("现在应该生成以下路径（每个分辨率包含.jpg和.png两个变体）:");
console.log("1. C:\\Users\\buynonsense\\Documents\\Tencent Files\\1044746809\\nt_qq\\nt_data\\Pic\\2025-05\\Thumb\\3ae4c853e167f6cca265cf06ef880913_720.jpg");
console.log("2. C:\\Users\\buynonsense\\Documents\\Tencent Files\\1044746809\\nt_qq\\nt_data\\Pic\\2025-05\\Thumb\\3ae4c853e167f6cca265cf06ef880913_720.png");
console.log("3. C:\\Users\\buynonsense\\Documents\\Tencent Files\\1044746809\\nt_qq\\nt_data\\Pic\\2025-05\\Thumb\\3ae4c853e167f6cca265cf06ef880913_0.jpg");
console.log("4. C:\\Users\\buynonsense\\Documents\\Tencent Files\\1044746809\\nt_qq\\nt_data\\Pic\\2025-05\\Thumb\\3ae4c853e167f6cca265cf06ef880913_0.png");
console.log("等等...");
