const fs = require('fs');
const path = require('path');

function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) {
        console.log(`⚠️  CLI source not found at ${src}`);
        return false;
    }

    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        const files = fs.readdirSync(src);
        for (const file of files) {
            copyRecursive(path.join(src, file), path.join(dest, file));
        }
    } else {
        // Only copy JavaScript files (not .d.ts or .map files)
        if (path.extname(src) === '.js') {
            // Check if destination exists as directory, remove it first
            if (fs.existsSync(dest) && fs.statSync(dest).isDirectory()) {
                fs.rmSync(dest, { recursive: true, force: true });
            }
            fs.copyFileSync(src, dest);
        }
    }
    return true;
}

async function bundleCLI() {
    console.log('🚀 Bundling Carbonara CLI into extension...');
    
    const cliSrcPath = path.resolve(__dirname, '../../../packages/cli/dist');
    const cliDestPath = path.resolve(__dirname, '../dist/cli');
    
    // Check if CLI is built
    if (!fs.existsSync(cliSrcPath)) {
        console.log('📦 CLI not built yet, attempting to build...');
        const { spawn } = require('child_process');
        
        return new Promise((resolve, reject) => {
            const buildProcess = spawn('npm', ['run', 'build'], {
                cwd: path.resolve(__dirname, '../../../packages/cli'),
                stdio: 'inherit'
            });
            
            buildProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ CLI built successfully');
                    if (copyRecursive(cliSrcPath, cliDestPath)) {
                        console.log('✅ CLI bundled successfully into extension');
                        resolve();
                    } else {
                        reject(new Error('Failed to copy CLI files'));
                    }
                } else {
                    console.log('⚠️  CLI build failed, extension will use fallback detection');
                    resolve(); // Don't fail the build, just warn
                }
            });
        });
    } else {
        // CLI already built, just copy it
        if (copyRecursive(cliSrcPath, cliDestPath)) {
            console.log('✅ CLI bundled successfully into extension');
        } else {
            console.log('⚠️  Failed to bundle CLI, extension will use fallback detection');
        }
    }
}

bundleCLI().catch(console.error); 