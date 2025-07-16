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
