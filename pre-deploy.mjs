import { execSync } from 'child_process'
import * as fs from 'fs'

function run(command, options = {}) {
    console.log(`> ${command}`)
    execSync(command, { stdio: 'inherit', ...options })
}

function exec(command, options = {}) {
    console.log(`> ${command}`)
    return execSync(command, { encoding: 'utf-8', ...options })
}

function extractValidJson(output) {
    const arrMatch = output.match(/\[[\s\S]*?\]/)
    if (arrMatch) {
        return JSON.parse(arrMatch[0])
    }
    const objMatch = output.match(/\{[\s\S]*\}/)
    if (objMatch) {
        return JSON.parse(objMatch[0])
    }
}

function json(command, options = {}) {
    return extractValidJson(exec(command, options))
}

function commandExists(command) {
    const checkCmd = process.platform === 'win32' ? 'where' : 'command -v'
    try {
        execSync(`${checkCmd} ${command}`, { stdio: 'ignore' })
        return true
    } catch (e) {
        return false
    }
}

function getWranglerConfig() {
    return JSON.parse(fs.readFileSync('wrangler.jsonc', 'utf-8'))
}

async function main() {
    if (!commandExists('wrangler')) {
        console.error('Wrangler is not installed. Please install it by running: pnpm add -g wrangler')
        process.exit(1)
    }
    try {
        run('wrangler whoami')
    } catch (e) {
        console.error("You are not logged in. Please run 'wrangler login'.")
        process.exit(1)
    }

    const authKey = process.env.AUTH_KEY
    const config = getWranglerConfig()

    if (authKey) {
        console.log(`Setting AUTH_KEY to '${authKey}'...`)
        config.vars.AUTH_KEY = authKey
    }

    // TODO: auto create ai gateway when wrangler supports it

    console.log('Checking for D1 databases...')
    let dbs = json('wrangler d1 list --json')
    const existingDBNames = new Set(dbs.map(db => db.name))

    for (const db of config.d1_databases) {
        if (!existingDBNames.has(db.database_name)) {
            console.log(`Creating D1 database '${db.database_name}'...`)
            run(`wrangler d1 create ${db.database_name}`)
        } else {
            console.log(`D1 database '${db.database_name}' already exists.`)
        }
    }

    console.log('Refreshing D1 database list to sync IDs...')
    dbs = json('wrangler d1 list --json')
    const dbNameToId = new Map(dbs.map(db => [db.name, db.uuid]))

    for (const dbConfig of config.d1_databases) {
        const dbId = dbNameToId.get(dbConfig.database_name)
        if (dbId) {
            dbConfig.database_id = dbId
        }
    }

    console.log('Writing updated configuration to wrangler.jsonc...')
    fs.writeFileSync('wrangler.jsonc', JSON.stringify(config, null, 4))
}

await main()
