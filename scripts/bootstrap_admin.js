import { spawnSync } from 'node:child_process'
import { log } from 'mentie'

const args = process.argv.slice( 2 )
const read_arg = name => {
    const index = args.indexOf( `--${ name }` )
    return index >= 0 ? args[ index + 1 ] : null
}

const escape_sql = value => `${ value }`.replaceAll( `'`, `''` )

/**
 * Builds the one-time admin bootstrap SQL statement.
 * @param {String} email - Admin email
 * @returns {String} SQL command
 */
export function build_bootstrap_sql( email ) {

    const normalized_email = escape_sql( `${ email }`.trim().toLocaleLowerCase() )

    return `
        UPDATE users
        SET
            status = 'accepted',
            role = 'admin',
            review_message = NULL,
            approved_at = datetime( 'now' ),
            updated_at = datetime( 'now' )
        WHERE email_normalized = '${ normalized_email }'
            AND NOT EXISTS (
                SELECT 1
                FROM users
                WHERE status = 'accepted'
                    AND role = 'admin'
                    AND email_normalized != '${ normalized_email }'
            );
    `.trim()
}

/**
 * Runs Wrangler to bootstrap the first admin.
 * @param {Object} options - Bootstrap options
 * @returns {Number} Exit code
 */
export function bootstrap_admin( options ) {

    const { email, database = `gratis-grapevine`, local = false } = options
    if( !email ) throw new Error( `Usage: npm run admin:bootstrap -- --email <email> [--local]` )

    const command = [
        `wrangler`,
        `d1`,
        `execute`,
        database,
        local ? `--local` : `--remote`,
        `--command`,
        build_bootstrap_sql( email ),
    ]

    const result = spawnSync( `npx`, command, { stdio: `inherit` } )
    return result.status || 0
}

if( import.meta.url === `file://${ process.argv[ 1 ] }` ) {
    try {
        const exit_code = bootstrap_admin( {
            email: read_arg( `email` ),
            database: read_arg( `database` ) || `gratis-grapevine`,
            local: args.includes( `--local` ),
        } )

        process.exitCode = exit_code
    } catch ( error ) {
        log.error( error.message )
        process.exitCode = 1
    }
}
