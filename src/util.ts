type AuthKey = {
    key: string
    unrestricted: boolean
    allowed?: {
        providers: Set<string>
        models: Set<string>
    }
    expiresAt?: number // unix timestamp in seconds
}

const parseCache = new Map<string, AuthKey[]>()

function parseAuthKeys(authKeysStr: string): AuthKey[] {
    if (parseCache.has(authKeysStr)) {
        return parseCache.get(authKeysStr)!
    }

    if (!authKeysStr) {
        const result: AuthKey[] = []
        parseCache.set(authKeysStr, result)
        return result
    }

    const keys: AuthKey[] = []
    const keyDefinitions = authKeysStr.split(';').map(s => s.trim())

    for (const definition of keyDefinitions) {
        if (!definition) continue

        const parts = definition.split('=')
        const keyPart = parts[0]
        const permissionsPart = parts.length > 1 ? parts[1] : null

        const keyMatch = keyPart.match(/^([^()]+)(?:\((\d+)\))?$/)
        if (!keyMatch) continue

        const key = keyMatch[1]
        const expiresAt = keyMatch[2] ? parseInt(keyMatch[2], 10) : undefined

        if (!permissionsPart) {
            keys.push({ key, unrestricted: true, expiresAt })
            continue
        }

        const allowed: AuthKey['allowed'] = {
            providers: new Set(),
            models: new Set()
        }

        const providersAndModels = permissionsPart.split('&')
        for (const pm of providersAndModels) {
            const [provider, ...models] = pm.split(',')
            if (provider) {
                allowed.providers.add(provider)
            }
            if (models.length > 0) {
                models.forEach(m => allowed.models.add(m))
            }
        }

        keys.push({ key, unrestricted: false, allowed, expiresAt })
    }

    parseCache.set(authKeysStr, keys)
    return keys
}

function findAuthKey(toCheck: string, parsedKeys: AuthKey[]): AuthKey | undefined {
    const now = Date.now() / 1000
    for (const authKey of parsedKeys) {
        if (authKey.key === toCheck) {
            if (authKey.expiresAt && authKey.expiresAt < now) {
                return undefined // expired
            }
            return authKey
        }
    }
    return undefined
}

function isApiAllowed(authKey: AuthKey, provider: string, model: string): boolean {
    if (authKey.unrestricted) {
        return true
    }

    if (!authKey.allowed) {
        return false // should not happen if not unrestricted
    }
    const { providers, models } = authKey.allowed

    if (providers.size > 0 && !providers.has(provider)) {
        return false
    }
    if (models.size > 0 && !models.has(model)) {
        return false
    }

    return true
}

function isWebUiAllowed(authKey: AuthKey): boolean {
    return authKey.unrestricted
}

export function isApiRequestAllowed(authKey: string, authKeysStr: string, provider: string, model: string): boolean {
    if (!authKey || !authKeysStr) {
        return false
    }

    const parsedKeys = parseAuthKeys(authKeysStr)
    const foundKey = findAuthKey(authKey, parsedKeys)
    if (!foundKey) {
        return false
    }

    return isApiAllowed(foundKey, provider, model)
}

export function isWebUiRequestAllowed(authKey: string, authKeysStr: string): boolean {
    if (!authKey || !authKeysStr) {
        return false
    }

    const parsedKeys = parseAuthKeys(authKeysStr)
    const foundKey = findAuthKey(authKey, parsedKeys)
    if (!foundKey) {
        return false
    }

    return isWebUiAllowed(foundKey)
}

export function getSecondsUntilMidnightPT(): number {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false
    })

    const parts = formatter.formatToParts(now)
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10)
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10)
    const second = parseInt(parts.find(p => p.type === 'second')?.value || '0', 10)

    const secondsPassed = hour * 3600 + minute * 60 + second
    return 24 * 60 * 60 - secondsPassed
}
