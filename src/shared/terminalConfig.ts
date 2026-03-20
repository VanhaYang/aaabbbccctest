export const TERMINAL_HISTORY_LIMIT = 50
export const DEFAULT_COMMAND_TIMEOUT_MS = 30000
/** git clone 等长耗时命令使用的超时（5 分钟），避免大仓库未传 timeout 时被默认 30s 杀掉 */
export const GIT_CLONE_TIMEOUT_MS = 300000
export const KILL_GRACE_PERIOD_MS = 3000
export const WINDOWS_FALLBACK_ENCODING = 'gbk'
