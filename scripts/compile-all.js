const { execSync } = require('child_process');
// macOS 可打 win/linux/mac，Windows/Linux 只能打本机 + 可交叉的（不含 mac）
const platforms = process.platform === 'darwin' ? ['--win', '--linux', '--mac'] : ['--win', '--linux'];
const cmd = `npx electron-builder ${platforms.join(' ')} --publish never`;
console.log('Building for:', platforms.join(', '));
execSync(cmd, { stdio: 'inherit' });
