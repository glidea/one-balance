import { execSync } from 'child_process'
import * as fs from 'fs'

function run(command, options = {}) {
    console.log(`> ${command}`)
    execSync(command, { stdio: 'inherit', ...options })
}

function getOutput(command, options = {}) {
    console.log(`> ${command}`)
    return execSync(command, { encoding: 'utf-8', ...options })
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
    const d1DatabasesOutput = getOutput('wrangler d1 list --json')
    const existingDatabases = JSON.parse(d1DatabasesOutput)
    const existingDatabaseNames = new Set(existingDatabases.map(db => db.name))

    for (const db of config.d1_databases) {
        if (!existingDatabaseNames.has(db.database_name)) {
            console.log(`Creating D1 database '${db.database_name}'...`)
            run(`wrangler d1 create ${db.database_name}`)
        } else {
            console.log(`D1 database '${db.database_name}' already exists.`)
        }
    }

    console.log('Refreshing D1 database list to sync IDs...')
    const finalD1ListRaw = getOutput('wrangler d1 list --json')
    const finalD1List = JSON.parse(finalD1ListRaw)
    const dbNameToId = new Map(finalD1List.map(db => [db.name, db.uuid]))

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
