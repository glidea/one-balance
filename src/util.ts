export function isValidAuthKey(toCheck: string, authKeysStr: string): boolean {
    if (!authKeysStr) {
        return false
    }

    const keys = authKeysStr
        .split(',')
        .map(key => key.trim())
        .filter(key => key.length > 0)
    return keys.includes(toCheck)
}

export function getSecondsUntilMidnightPT(): number {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false,
    })

    const parts = formatter.formatToParts(now)
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10)
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10)
    const second = parseInt(parts.find(p => p.type === 'second')?.value || '0', 10)

    const secondsPassed = hour * 3600 + minute * 60 + second
    return 24 * 60 * 60 - secondsPassed
}
