import { expect, test } from '@playwright/test'

const accepted_user = {
    id: `user_1`,
    name: `Ada`,
    email: `ada@example.test`,
    status: `accepted`,
    role: `member`,
    hub_id: `hub_amsterdam`,
    hub_name: `Amsterdam`,
}

const route_accepted_member = async page => {

    await page.route( `**/api/me`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, user: accepted_user } ),
    } ) )
    await page.route( `**/api/grapevine/latest`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( {
            ok: true,
            update: {
                id: `update_1`,
                period_start: `2026-06-01`,
                period_end: `2026-06-07`,
                generated_at: `2026-06-08T07:00:00.000Z`,
                generation_kind: `scheduled`,
                source_message_count: 4,
                model: `openai/gpt-4.1-mini`,
                summary_markdown: `## Amsterdam\nPeople are planning a shared dinner.`,
            },
        } ),
    } ) )
}

const route_empty_messages = async page => {

    await page.route( `**/api/messages`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, messages: [] } ),
    } ) )
}

const route_ask_filters = async ( page, filters = {} ) => {

    const {
        hubs = [],
        members = [],
    } = filters

    await page.route( `**/api/grapevine/filters`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, hubs, members } ),
    } ) )
}

const dispatch_install_prompt = async ( page, options = {} ) => {

    await page.evaluate( ( { should_reject } ) => {
        const event = new Event( `beforeinstallprompt`, { cancelable: true } )
        event.prompt = async () => {
            window.__install_prompted = true
            if( should_reject ) throw new Error( `install prompt failed` )
        }
        window.dispatchEvent( event )
    }, { should_reject: options.reject === true } )
}

const install_forced_update_test_hooks = async page => {

    await page.addInitScript( () => {
        const registration = {
            waiting: {
                postMessage: message => {
                    window.__pwa_skip_waiting_message = message
                },
            },
            update: async () => {
                window.__pwa_registration_updated = true
            },
            unregister: async () => {
                window.__pwa_registration_unregistered = true
                return true
            },
        }

        Object.defineProperty( navigator, `serviceWorker`, {
            configurable: true,
            value: {
                addEventListener: () => {},
                getRegistrations: async () => [ registration ],
                removeEventListener: () => {},
            },
        } )

        Object.defineProperty( window, `caches`, {
            configurable: true,
            value: {
                keys: async () => [ `workbox-precache-v2`, `runtime-wasm`, `transcription-models` ],
                delete: async cache_name => {
                    const deleted_caches = window.__pwa_deleted_caches || []
                    window.__pwa_deleted_caches = [ ...deleted_caches, cache_name ]
                    return true
                },
            },
        } )

        window.__grapevine_reload_app = () => {
            window.__pwa_reload_called = true
        }
    } )
}

const show_update_badge = async page => {

    await page.evaluate( async () => {
        const { use_pwa_store } = await import( `/src/stores/pwa_store.js` )

        use_pwa_store.getState().set_update_ready( true )
        use_pwa_store.getState().set_refresh_handler( () => {
            window.__pwa_refresh_handler_called = true
        } )
    } )
}

const assert_no_horizontal_overflow = async page => {

    await expect.poll( () => page.evaluate( () => Math.ceil( document.documentElement.scrollWidth - window.innerWidth ) ) ).toBeLessThanOrEqual( 1 )

    const dialog_box = await page.getByRole( `dialog` ).boundingBox()
    const inner_width = await page.evaluate( () => window.innerWidth )
    expect( dialog_box ).not.toBeNull()
    expect( dialog_box.x ).toBeGreaterThanOrEqual( -1 )
    expect( Math.ceil( dialog_box.x + dialog_box.width - inner_width ) ).toBeLessThanOrEqual( 1 )
}

test( `shows auth immediately for anonymous visitors`, async ( { page } ) => {
    await page.route( `**/api/me`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, user: null } ),
    } ) )

    await page.goto( `/` )

    await expect( page.getByRole( `heading`, { name: `Sandbox, Grapevine` } ) ).toBeVisible()
    await expect( page.getByText( `Grapevine is a community app where members share updates into one trusted place` ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Signup` } ) ).toBeVisible()
} )

test( `hides install badge until a user is logged in`, async ( { page } ) => {
    await page.route( `**/api/me`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, user: null } ),
    } ) )

    await page.goto( `/` )
    await dispatch_install_prompt( page )

    await expect( page.getByLabel( `Install prompt` ) ).not.toBeVisible()
} )

test( `shows install badge after accepted login`, async ( { page } ) => {
    await route_accepted_member( page )
    await route_empty_messages( page )

    await page.goto( `/` )
    await dispatch_install_prompt( page )

    const install_prompt = page.getByLabel( `Install prompt` )

    await expect( install_prompt.getByRole( `button`, { name: `Install App` } ) ).toBeVisible()
    await expect( install_prompt.getByRole( `button`, { name: `Dismiss install prompt` } ) ).toBeVisible()
} )

test( `dismissed install badge moves install action into the bottom bar`, async ( { page } ) => {
    await route_accepted_member( page )
    await route_empty_messages( page )

    await page.goto( `/` )
    await dispatch_install_prompt( page )

    await page.getByRole( `button`, { name: `Dismiss install prompt` } ).click()
    await expect( page.getByLabel( `Install prompt` ) ).not.toBeVisible()

    const action_bar = page.getByRole( `navigation`, { name: `Actions` } )
    const install_action = action_bar.getByRole( `button`, { name: `Install App` } )

    await expect( action_bar ).toHaveCSS( `justify-content`, `center` )
    await expect( action_bar ).toHaveCSS( `grid-template-columns`, `48px 48px 48px 48px` )
    await expect( install_action ).toBeVisible()
    await expect( install_action ).toBeFocused()
    await dispatch_install_prompt( page )
    await expect( page.getByLabel( `Install prompt` ) ).not.toBeVisible()
    await expect( install_action ).toBeVisible()
    await install_action.click()

    await expect.poll( () => page.evaluate( () => window.__install_prompted || false ) ).toBe( true )
    await expect( install_action ).not.toBeVisible()
} )

test( `install action clears rejected native prompts`, async ( { page } ) => {
    await route_accepted_member( page )
    await route_empty_messages( page )

    await page.goto( `/` )
    await dispatch_install_prompt( page, { reject: true } )

    await page.getByLabel( `Install prompt` ).getByRole( `button`, { name: `Install App` } ).click()
    await expect.poll( () => page.evaluate( () => window.__install_prompted || false ) ).toBe( true )
    await expect( page.getByLabel( `Install prompt` ) ).not.toBeVisible()
    await expect( page.getByRole( `navigation`, { name: `Actions` } ).getByRole( `button`, { name: `Install App` } ) ).not.toBeVisible()
} )

test( `update badge uses the stored refresh handler`, async ( { page } ) => {
    await route_accepted_member( page )
    await route_empty_messages( page )

    await page.goto( `/` )
    await show_update_badge( page )

    await page.getByRole( `button`, { name: `Update available. Click here to update app.` } ).click()
    await expect.poll( () => page.evaluate( () => window.__pwa_refresh_handler_called || false ) ).toBe( true )
} )

test( `profile update action flushes service workers and browser caches`, async ( { page } ) => {
    await install_forced_update_test_hooks( page )
    await route_accepted_member( page )
    await route_empty_messages( page )
    await page.route( `**/sw.js`, route => route.fulfill( {
        contentType: `application/javascript`,
        body: `self.addEventListener('install', () => {})`,
    } ) )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: `Profile` } ).click()

    const profile_dialog = page.getByRole( `dialog`, { name: `Profile` } )

    await profile_dialog.getByRole( `button`, { name: `Update app` } ).click()

    await expect.poll( () => page.evaluate( () => window.__pwa_registration_updated || false ) ).toBe( true )
    await expect.poll( () => page.evaluate( () => window.__pwa_registration_unregistered || false ) ).toBe( true )
    await expect.poll( () => page.evaluate( () => window.__pwa_skip_waiting_message ) ).toEqual( { type: `SKIP_WAITING` } )
    await expect.poll( () => page.evaluate( () => window.__pwa_deleted_caches || [] ) ).toEqual( [ `workbox-precache-v2`, `runtime-wasm`, `transcription-models` ] )
    await expect.poll( () => page.evaluate( () => window.__pwa_reload_called || false ) ).toBe( true )
} )

test( `profile update action keeps caches when the update source is unavailable`, async ( { page } ) => {
    await install_forced_update_test_hooks( page )
    await route_accepted_member( page )
    await route_empty_messages( page )
    await page.route( `**/sw.js`, route => route.fulfill( {
        status: 503,
        contentType: `application/javascript`,
        body: ``,
    } ) )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: `Profile` } ).click()
    await page.getByRole( `dialog`, { name: `Profile` } ).getByRole( `button`, { name: `Update app` } ).click()

    await expect( page.getByText( `The app update could not be reached right now.` ) ).toBeVisible()
    await expect.poll( () => page.evaluate( () => window.__pwa_registration_unregistered || false ) ).toBe( false )
    await expect.poll( () => page.evaluate( () => window.__pwa_deleted_caches || [] ) ).toEqual( [] )
    await expect.poll( () => page.evaluate( () => window.__pwa_reload_called || false ) ).toBe( false )
} )

test( `gates blocked accounts to review state`, async ( { page } ) => {
    await page.route( `**/api/me`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( {
            ok: true,
            user: { ...accepted_user, status: `blocked`, review_message: `Contact an admin.` },
        } ),
    } ) )

    await page.goto( `/` )

    await expect( page.getByRole( `heading`, { name: `Your account is not currently active.` } ) ).toBeVisible()
    await expect( page.getByText( `Contact an admin.` ) ).toBeVisible()
} )

test( `gates pending accounts to review state`, async ( { page } ) => {
    await page.route( `**/api/me`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( {
            ok: true,
            user: { ...accepted_user, status: `pending`, review_message: `We will review this soon.` },
        } ),
    } ) )

    await page.goto( `/` )

    await expect( page.getByRole( `heading`, { name: `Your account is being reviewed.` } ) ).toBeVisible()
    await expect( page.getByText( `We will review this soon.` ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Record update` } ) ).not.toBeVisible()
} )

test( `new members can sign up with password and land pending`, async ( { page } ) => {
    let signup_count = 0
    let passkey_options_count = 0

    await page.route( `**/api/me`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, user: null } ),
    } ) )
    await page.route( `**/api/auth/passkey/register/options`, route => {
        passkey_options_count += 1
        return route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( { ok: false, error: `unexpected_passkey_start` } ),
        } )
    } )
    await page.route( `**/api/signup`, async route => {
        signup_count += 1
        const body = route.request().postDataJSON()
        expect( body.email ).toBe( `new@example.test` )
        expect( body.password ).toBe( `verylongpassword` )

        return route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( {
                ok: true,
                user: {
                    ...accepted_user,
                    id: `new_user`,
                    name: body.name,
                    email: body.email,
                    status: `pending`,
                    role: `member`,
                    review_message: null,
                },
            } ),
        } )
    } )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: `Signup` } ).click()
    await expect( page.getByRole( `button`, { name: `What is a passkey?` } ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `What is a password?` } ) ).toBeVisible()
    await page.getByRole( `button`, { name: `What is a password?` } ).focus()
    await expect( page.getByText( `A password is a secret phrase you type when signing in.` ) ).toBeVisible()
    await page.getByLabel( `Name` ).fill( `New` )
    await page.getByLabel( `WhatsApp telephone` ).fill( `+31612345678` )
    await page.getByLabel( `Email` ).fill( `new@example.test` )
    await page.getByRole( `button`, { name: `Create with passkey` } ).click()
    await expect( page.getByRole( `dialog`, { name: `Add more of your name?` } ) ).toBeVisible()
    expect( passkey_options_count ).toBe( 0 )
    await page.getByRole( `button`, { name: `Go back and add last name` } ).click()
    await page.getByRole( `button`, { name: `Password`, exact: true } ).click()
    await page.locator( `input[name="password"]` ).fill( `verylongpassword` )
    await page.getByRole( `button`, { name: `Create account` } ).click()
    await expect( page.getByRole( `dialog`, { name: `Add more of your name?` } ) ).toBeVisible()
    expect( signup_count ).toBe( 0 )
    await page.getByRole( `button`, { name: `Go back and add last name` } ).click()
    await page.getByLabel( `Name` ).fill( `New Member` )
    await page.getByRole( `button`, { name: `Create account` } ).click()

    await expect( page.getByRole( `heading`, { name: `Your account is being reviewed.` } ) ).toBeVisible()
    expect( signup_count ).toBe( 1 )
} )

test( `single-name signup can continue anyway`, async ( { page } ) => {
    let signup_count = 0

    await page.route( `**/api/me`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, user: null } ),
    } ) )
    await page.route( `**/api/signup`, async route => {
        signup_count += 1
        const body = route.request().postDataJSON()
        expect( body.name ).toBe( `Solo` )
        expect( body.email ).toBe( `solo@example.test` )
        expect( body.password ).toBe( `verylongpassword` )

        return route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( {
                ok: true,
                user: {
                    ...accepted_user,
                    id: `solo_user`,
                    name: body.name,
                    email: body.email,
                    status: `pending`,
                    role: `member`,
                    review_message: null,
                },
            } ),
        } )
    } )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: `Signup` } ).click()
    await page.getByLabel( `Name` ).fill( `Solo` )
    await page.getByLabel( `WhatsApp telephone` ).fill( `+31612345678` )
    await page.getByLabel( `Email` ).fill( `solo@example.test` )
    await page.getByRole( `button`, { name: `Password`, exact: true } ).click()
    await page.locator( `input[name="password"]` ).fill( `verylongpassword` )
    await page.getByRole( `button`, { name: `Create account` } ).click()
    await expect( page.getByRole( `dialog`, { name: `Add more of your name?` } ) ).toBeVisible()
    await page.getByRole( `button`, { name: `Continue anyway` } ).click()

    await expect( page.getByRole( `heading`, { name: `Your account is being reviewed.` } ) ).toBeVisible()
    expect( signup_count ).toBe( 1 )
} )

test( `accepted members land on Grapevine actions`, async ( { page } ) => {
    await route_accepted_member( page )
    await route_empty_messages( page )

    await page.goto( `/` )

    await expect( page.getByRole( `heading`, { name: `What do you need from the Grapevine?` } ) ).toBeVisible()
    await expect( page.getByText( `People are planning a shared dinner.` ) ).not.toBeVisible()
    await expect( page.getByRole( `button`, { name: /Community bulletins/ } ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: /Ask about people/ } ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: /Ask about hubs/ } ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: /Ask a question/ } ) ).toBeVisible()
    await page.getByRole( `button`, { name: /Community bulletins/ } ).click()
    await expect( page ).toHaveURL( /\/bulletins$/ )
    await expect( page.getByRole( `heading`, { name: `Community bulletins` } ) ).toBeVisible()
    await expect( page.getByText( `People are planning a shared dinner.` ) ).toBeVisible()
    await expect( page.getByRole( `heading`, { name: `What do you need from the Grapevine?` } ) ).not.toBeVisible()
    await expect( page.getByRole( `heading`, { name: `Your updates` } ) ).not.toBeVisible()
    await expect( page.getByRole( `button`, { name: `Record update` } ) ).toBeVisible()

    const action_bar = page.getByRole( `navigation`, { name: `Actions` } )
    await expect( action_bar ).toHaveCSS( `justify-content`, `center` )
    await expect( action_bar ).toHaveCSS( `grid-template-columns`, `48px 48px 48px` )
    await expect( action_bar.getByRole( `link`, { name: `Home` } ) ).toBeVisible()
    await expect( action_bar.getByRole( `button`, { name: `Record update` } ) ).toHaveCSS( `background-color`, `rgb(217, 45, 32)` )
    await expect( action_bar.getByRole( `link`, { name: `Archive` } ) ).toBeVisible()
    await expect( action_bar.getByRole( `button`, { name: `Type update` } ) ).not.toBeVisible()
    await expect( action_bar.getByRole( `button`, { name: `Ask Grapevine` } ) ).not.toBeVisible()
} )

test( `accepted members see a silent bulletins page when there is no Grapevine`, async ( { page } ) => {
    await page.route( `**/api/me`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, user: accepted_user } ),
    } ) )
    await page.route( `**/api/grapevine/latest`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, update: null } ),
    } ) )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: /Community bulletins/ } ).click()

    await expect( page ).toHaveURL( /\/bulletins$/ )
    await expect( page.getByText( `The Grapevine is currently silent.` ) ).toBeVisible()
    await expect( page.locator( `article` ) ).toHaveCount( 0 )
} )

test( `accepted members record once and auto-submit a transcribed update`, async ( { page } ) => {
    await page.addInitScript( () => {
        window.__local_transcriber_called = false
        window.__grapevine_transcriber_factory = () => {
            window.__local_transcriber_called = true
            return async () => ( { text: `Local fallback should not run online.` } )
        }
    } )
    await route_accepted_member( page )

    let submitted_message = null
    let cloud_upload_seen = false
    await page.route( `**/api/transcriptions`, async route => {
        cloud_upload_seen = true
        const content_type = route.request().headers()[ `content-type` ] || ``
        const upload = route.request().postDataBuffer()
        const upload_text = upload.toString( `utf8` )

        expect( content_type ).toContain( `multipart/form-data` )
        expect( upload.byteLength ).toBeGreaterThan( 0 )
        expect( upload_text ).toContain( `duration_seconds` )
        await new Promise( resolve => setTimeout( resolve, 100 ) )

        return route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( {
                ok: true,
                transcript: {
                    text: `Automatic voice update.`,
                    model: `@cf/openai/whisper-large-v3-turbo`,
                },
            } ),
        } )
    } )
    await page.route( `**/api/messages`, async route => {
        if( route.request().method() === `POST` ) {
            submitted_message = route.request().postDataJSON()

            return route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    ok: true,
                    message: {
                        id: `message_voice`,
                        body: submitted_message.body,
                        source: submitted_message.source,
                        created_at: `2026-06-09T12:00:00.000Z`,
                        updated_at: `2026-06-09T12:00:00.000Z`,
                    },
                } ),
            } )
        }

        return route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( { ok: true, messages: [] } ),
        } )
    } )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: `Record update` } ).click()
    const record_dialog = page.getByRole( `dialog`, { name: `Record update` } )
    const record_button = record_dialog.getByRole( `button`, { name: `Record` } )
    await expect( record_dialog.getByText( `You can record an update here and submit it to the Grapevine so others can keep up with what matters in your life.` ) ).toBeVisible()
    await expect( page.locator( `#voice-transcription-disclosure` ) ).toHaveText( `Online recordings are sent to Cloudflare for transcription. The transcript is submitted automatically.` )
    await expect( record_button ).toHaveAttribute( `aria-describedby`, `voice-transcription-disclosure` )
    await expect( record_dialog.getByRole( `button`, { name: `Type instead` } ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Transcribe` } ) ).not.toBeVisible()

    await record_button.click()
    await page.waitForTimeout( 350 )
    await page.getByRole( `button`, { name: `Stop` } ).click()
    await expect( page.getByText( `Sending audio to Cloudflare for transcription.` ) ).toBeVisible()

    await expect( page.getByText( `Your message has been sent into the Grapevine.` ) ).toBeVisible()
    await expect( page.getByRole( `dialog`, { name: `Record update` } ) ).not.toBeVisible()
    await expect( page.getByRole( `textbox`, { name: `Transcript` } ) ).not.toBeVisible()

    await expect.poll( () => submitted_message?.body ).toBe( `Automatic voice update.` )
    expect( submitted_message.source ).toBe( `voice_transcript` )
    expect( cloud_upload_seen ).toBe( true )
    await expect.poll( () => page.evaluate( () => window.__local_transcriber_called || false ) ).toBe( false )
} )

test( `offline recording uses the local transcription fallback`, async ( { page } ) => {
    await page.addInitScript( () => {
        window.__local_transcriber_called = false
        window.__grapevine_transcriber_factory = ( { progress_callback } ) => {
            window.__local_transcriber_called = true
            progress_callback( { status: `ready` } )

            return async () => {
                progress_callback( { status: `transcribing` } )
                return { text: `Offline voice update.` }
            }
        }
    } )
    await route_accepted_member( page )
    await route_empty_messages( page )

    let cloud_upload_seen = false
    await page.route( `**/api/transcriptions`, route => {
        cloud_upload_seen = true
        return route.abort()
    } )

    await page.goto( `/` )
    await page.context().setOffline( true )
    await page.getByRole( `button`, { name: `Record update` } ).click()
    await page.getByRole( `dialog`, { name: `Record update` } ).getByRole( `button`, { name: `Record` } ).click()
    await expect( page.getByText( `Local model ready.` ) ).toBeVisible()
    await page.waitForTimeout( 350 )
    await page.getByRole( `button`, { name: `Stop` } ).click()

    await expect( page.getByText( `Your message will be sent into the Grapevine when you are back online.` ) ).toBeVisible()
    await expect( page.getByLabel( `Transcript` ) ).not.toBeVisible()
    await expect.poll( () => page.evaluate( () => window.__local_transcriber_called || false ) ).toBe( true )
    expect( cloud_upload_seen ).toBe( false )
    await page.context().setOffline( false )
} )

test( `recording failure keeps retry and manual transcript paths`, async ( { page } ) => {
    await route_accepted_member( page )
    await route_empty_messages( page )
    await page.route( `**/api/transcriptions`, route => route.fulfill( {
        status: 502,
        contentType: `application/json`,
        body: JSON.stringify( {
            ok: false,
            error: {
                code: `transcription_failed`,
                message: `Audio could not be transcribed right now.`,
            },
        } ),
    } ) )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: `Record update` } ).click()
    await page.getByRole( `dialog`, { name: `Record update` } ).getByRole( `button`, { name: `Record` } ).click()
    await page.waitForTimeout( 350 )
    await page.getByRole( `button`, { name: `Stop` } ).click()

    await expect( page.getByText( `Transcription failed. You can retry or type the transcript.` ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Retry transcription` } ) ).toBeVisible()
    await page.getByRole( `button`, { name: `Type transcript` } ).click()
    await expect( page.getByLabel( `Transcript` ) ).toBeVisible()
} )

test( `empty recording transcript keeps retry and manual transcript paths`, async ( { page } ) => {
    await route_accepted_member( page )
    await route_empty_messages( page )
    await page.route( `**/api/transcriptions`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( {
            ok: true,
            transcript: {
                text: ``,
                model: `@cf/test/transcriber`,
            },
        } ),
    } ) )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: `Record update` } ).click()
    await page.getByRole( `dialog`, { name: `Record update` } ).getByRole( `button`, { name: `Record` } ).click()
    await page.waitForTimeout( 350 )
    await page.getByRole( `button`, { name: `Stop` } ).click()

    await expect( page.getByText( `Transcription failed. You can retry or type the transcript.` ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Retry transcription` } ) ).toBeVisible()
    await expect( page.getByLabel( `Transcript` ) ).not.toBeVisible()
} )

test( `closing during recording discards the stopped recording`, async ( { page } ) => {
    await route_accepted_member( page )
    await route_empty_messages( page )

    let transcription_count = 0
    await page.route( `**/api/transcriptions`, route => {
        transcription_count += 1
        const transcript = transcription_count === 1
            ? `Second recording appears.`
            : `Dismissed recording should not appear.`

        return route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( {
                ok: true,
                transcript: { text: transcript, model: `@cf/test/transcriber` },
            } ),
        } )
    } )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: `Record update` } ).click()
    await page.getByRole( `dialog`, { name: `Record update` } ).getByRole( `button`, { name: `Record` } ).click()
    await page.waitForTimeout( 350 )
    await page.getByRole( `button`, { name: `Close` } ).click()
    await page.getByRole( `button`, { name: `Record update` } ).click()

    await expect( page.getByRole( `dialog`, { name: `Record update` } ).getByRole( `button`, { name: `Record` } ) ).toBeVisible()
    await page.getByRole( `dialog`, { name: `Record update` } ).getByRole( `button`, { name: `Record` } ).click()
    await page.waitForTimeout( 350 )
    await page.getByRole( `button`, { name: `Stop` } ).click()

    await expect( page.getByText( `Your message has been sent into the Grapevine.` ) ).toBeVisible()
    await expect( page.getByText( `Dismissed recording should not appear.` ) ).not.toBeVisible()
    expect( transcription_count ).toBe( 1 )
} )

test( `closing during cloud transcription ignores the delayed transcript`, async ( { page } ) => {
    await route_accepted_member( page )
    await route_empty_messages( page )

    await page.route( `**/api/transcriptions`, async route => {
        await new Promise( resolve => setTimeout( resolve, 500 ) )

        return route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( {
                ok: true,
                transcript: {
                    text: `Delayed cloud transcript should not appear.`,
                    model: `@cf/test/transcriber`,
                },
            } ),
        } ).catch( () => {} )
    } )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: `Record update` } ).click()
    await page.getByRole( `dialog`, { name: `Record update` } ).getByRole( `button`, { name: `Record` } ).click()
    await page.waitForTimeout( 350 )
    await page.getByRole( `button`, { name: `Stop` } ).click()
    await expect( page.getByText( `Sending audio to Cloudflare for transcription.` ) ).toBeVisible()
    await page.getByRole( `button`, { name: `Close` } ).click()
    await page.waitForTimeout( 650 )
    await page.getByRole( `button`, { name: `Record update` } ).click()

    await expect( page.getByRole( `dialog`, { name: `Record update` } ).getByRole( `button`, { name: `Record` } ) ).toBeVisible()
    await expect( page.getByText( `Delayed cloud transcript should not appear.` ) ).not.toBeVisible()
} )

test( `closing before microphone permission resolves prevents hidden recording`, async ( { page } ) => {
    await page.addInitScript( () => {
        window.__delayed_stream_started = false
        window.__grapevine_get_microphone_stream = async () => {
            const stream = await navigator.mediaDevices.getUserMedia( { audio: true } )
            await new Promise( resolve => window.setTimeout( resolve, 350 ) )
            window.__delayed_stream_started = true
            return stream
        }
    } )
    await route_accepted_member( page )
    await route_empty_messages( page )

    let transcription_count = 0
    await page.route( `**/api/transcriptions`, route => {
        transcription_count += 1

        return route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( {
                ok: true,
                transcript: { text: `Delayed recording should not appear.`, model: `@cf/test/transcriber` },
            } ),
        } )
    } )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: `Record update` } ).click()
    await page.getByRole( `dialog`, { name: `Record update` } ).getByRole( `button`, { name: `Record` } ).click()
    await page.getByRole( `button`, { name: `Close` } ).click()
    await expect.poll( () => page.evaluate( () => window.__delayed_stream_started || false ) ).toBe( true )
    await page.getByRole( `button`, { name: `Record update` } ).click()

    await expect( page.getByRole( `dialog`, { name: `Record update` } ).getByRole( `button`, { name: `Record` } ) ).toBeVisible()
    await expect( page.getByText( `Delayed recording should not appear.` ) ).not.toBeVisible()
    expect( transcription_count ).toBe( 0 )
} )

test( `accepted members can submit a typed update`, async ( { page } ) => {
    await route_accepted_member( page )

    const messages = []

    await page.route( `**/api/messages`, async route => {
        if( route.request().method() === `POST` ) {
            const body = route.request().postDataJSON()
            messages.push( {
                id: `message_typed`,
                body: body.body,
                source: body.source,
                created_at: `2026-06-07T12:00:00.000Z`,
                updated_at: `2026-06-07T12:00:00.000Z`,
            } )

            return route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { ok: true, message: messages[ 0 ] } ),
            } )
        }

        return route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( { ok: true, messages } ),
        } )
    } )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: `Record update` } ).click()
    await page.getByRole( `dialog`, { name: `Record update` } ).getByRole( `button`, { name: `Type instead` } ).click()
    await page.getByRole( `textbox`, { name: `Update` } ).fill( `Typed Grapevine update.` )
    await page.getByRole( `button`, { name: `Submit update` } ).click()

    await expect( page.getByText( `Update submitted.` ) ).toBeVisible()
    await page.goto( `/archive?kind=mine` )
    await expect( page.getByRole( `heading`, { name: `Your Updates Archive` } ) ).toBeVisible()
    await expect( page.getByText( `Typed Grapevine update.` ) ).toBeVisible()
} )

test( `accepted members can edit and delete their own updates`, async ( { page } ) => {
    await route_accepted_member( page )

    let message_body = `Original update text.`

    await page.route( `**/api/messages/message_1`, async route => {
        if( route.request().method() === `PATCH` ) {
            const body = route.request().postDataJSON()
            message_body = body.body

            return route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    ok: true,
                    message: {
                        id: `message_1`,
                        body: message_body,
                        source: `typed`,
                        created_at: `2026-06-07T12:00:00.000Z`,
                        updated_at: `2026-06-07T13:00:00.000Z`,
                    },
                } ),
            } )
        }

        return route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( { ok: true, deleted: true } ),
        } )
    } )

    await page.route( `**/api/messages`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( {
            ok: true,
            messages: [
                {
                    id: `message_1`,
                    body: message_body,
                    source: `typed`,
                    created_at: `2026-06-07T12:00:00.000Z`,
                    updated_at: `2026-06-07T12:00:00.000Z`,
                },
            ],
        } ),
    } ) )

    await page.goto( `/archive?kind=mine` )

    await expect( page.getByRole( `heading`, { name: `Your Updates Archive` } ) ).toBeVisible()
    await expect( page.getByText( `Original update text.` ) ).toBeVisible()

    await page.getByRole( `button`, { name: `Edit` } ).click()
    await page.getByLabel( `Edit update` ).fill( `Edited update text.` )
    await page.getByRole( `button`, { name: `Save` } ).click()

    await expect( page.getByText( `Edited update text.` ) ).toBeVisible()

    await page.getByRole( `button`, { name: `Delete` } ).click()
    await page.getByRole( `dialog`, { name: `Delete update` } ).getByRole( `button`, { name: `Delete` } ).click()

    await expect( page.getByText( `Edited update text.` ) ).not.toBeVisible()
} )

test( `archive landing lets members choose an archive`, async ( { page } ) => {
    await route_accepted_member( page )
    await route_empty_messages( page )
    await page.route( `**/api/grapevine/archive`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( {
            ok: true,
            updates: [
                {
                    id: `archive_1`,
                    period_start: `2026-06-01`,
                    period_end: `2026-06-07`,
                    generated_at: `2026-06-08T07:00:00.000Z`,
                    source_message_count: 4,
                },
            ],
        } ),
    } ) )

    await page.goto( `/archive` )

    await expect( page.getByText( `Choose which archive to open.` ) ).toBeVisible()
    await page.getByRole( `button`, { name: `Grapevine Archive` } ).click()
    await expect( page.getByText( `2026-06-01 to 2026-06-07` ) ).toBeVisible()

    await page.getByRole( `button`, { name: `Your Updates Archive` } ).click()
    await expect( page.getByRole( `heading`, { name: `Your Updates Archive` } ) ).toBeVisible()
    await expect( page.getByRole( `heading`, { name: `No submitted updates yet` } ) ).toBeVisible()
} )

test( `accepted members can adjust display settings`, async ( { page } ) => {
    await route_accepted_member( page )
    await page.route( `**/api/messages`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, messages: [] } ),
    } ) )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: `Profile` } ).click()
    await page.getByRole( `dialog`, { name: `Profile` } ).getByRole( `button`, { name: `Large`, exact: true } ).click()

    await expect.poll( () => page.evaluate( () => getComputedStyle( document.body ).fontSize ) ).toBe( `17.92px` )
} )

test( `mobile modals fit inside a narrow viewport`, async ( { page } ) => {
    await page.setViewportSize( { width: 320, height: 720 } )
    await route_accepted_member( page )
    await route_empty_messages( page )
    await route_ask_filters( page, {
        hubs: [ { id: `hub_amsterdam`, name: `Amsterdam` } ],
        members: [
            { id: `member_long`, name: `A very long member name that should wrap`, hub: `Amsterdam` },
        ],
    } )

    await page.goto( `/` )

    await page.getByRole( `button`, { name: `Record update` } ).click()
    await assert_no_horizontal_overflow( page )
    await page.getByRole( `dialog`, { name: `Record update` } ).getByRole( `button`, { name: `Type instead` } ).click()
    await assert_no_horizontal_overflow( page )
    await page.getByRole( `button`, { name: `Close` } ).click()

    await page.getByRole( `button`, { name: /Ask about people/ } ).click()
    await page.getByText( `A very long member name that should wrap · Amsterdam` ).click()
    await assert_no_horizontal_overflow( page )
    await page.getByRole( `button`, { name: `Close` } ).click()

    await page.getByRole( `button`, { name: `Profile` } ).click()
    await assert_no_horizontal_overflow( page )
} )

test( `member search keeps stale hub filters visible`, async ( { page } ) => {
    await route_accepted_member( page )

    const members = [
        {
            ...accepted_user,
            id: `member_ada`,
            name: `Ada`,
            hub: `Amsterdam`,
            whatsapp_telephone: `+31611111111`,
            whatsapp_telephone_digits: `31611111111`,
            whatsapp_url: `https://wa.me/31611111111`,
        },
        {
            ...accepted_user,
            id: `member_bruno`,
            name: `Bruno`,
            hub: `Berlin`,
            whatsapp_telephone: `+491711111111`,
            whatsapp_telephone_digits: `491711111111`,
            whatsapp_url: `https://wa.me/491711111111`,
        },
    ]

    await page.route( `**/api/members**`, route => {
        const { searchParams } = new URL( route.request().url() )
        const query = searchParams.get( `query` )
        const visible_members = query === `Ada` ? members.filter( member => member.name === `Ada` ) : members

        return route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( { ok: true, members: visible_members } ),
        } )
    } )

    await page.goto( `/members?hub=Berlin&query=Ada` )

    await expect( page.getByRole( `heading`, { name: `Members` } ) ).toBeVisible()
    await expect( page.getByLabel( `Hub` ) ).toHaveValue( `Berlin` )
    await expect( page.getByLabel( `Hub` ).locator( `option[value="Berlin"]` ) ).toHaveText( `Berlin` )
    await expect( page.getByText( `Try another search or clear the hub filter.` ) ).toBeVisible()
} )

test( `admins can approve pending members`, async ( { page } ) => {
    const admin_user = { ...accepted_user, role: `admin` }
    let status_update = null

    await page.route( `**/api/me`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, user: admin_user } ),
    } ) )
    await page.route( `**/api/admin/users`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( {
            ok: true,
            users: [
                {
                    id: `pending_1`,
                    name: `Pending Member`,
                    email: `pending@example.test`,
                    email_url: `mailto:pending@example.test`,
                    whatsapp_telephone: `+31612345678`,
                    whatsapp_url: `https://wa.me/31612345678`,
                    hub_id: `hub_amsterdam`,
                    hub_name: `Amsterdam`,
                    status: status_update?.status || `pending`,
                    role: `member`,
                    review_message: null,
                    created_at: `2026-06-07T12:00:00.000Z`,
                },
            ],
        } ),
    } ) )
    await page.route( `**/api/admin/users/pending_1/status`, async route => {
        status_update = route.request().postDataJSON()

        return route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( { ok: true, user: { id: `pending_1`, status: status_update.status } } ),
        } )
    } )
    await page.route( `**/api/admin/hubs`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, hubs: [ { id: `hub_amsterdam`, name: `Amsterdam` } ], requested_hubs: [] } ),
    } ) )
    await page.route( `**/api/admin/ai-requests`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, ai_requests: [], grapevine_updates: [] } ),
    } ) )
    await page.route( `**/api/admin/messages`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, messages: [] } ),
    } ) )
    await page.route( `**/api/grapevine/latest`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, update: null } ),
    } ) )
    await page.route( `**/api/messages`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, messages: [] } ),
    } ) )

    await page.goto( `/admin` )
    await expect( page.getByRole( `heading`, { name: `Admin` } ) ).toBeVisible()
    await page.getByRole( `button`, { name: `Approve` } ).click()

    await expect.poll( () => status_update?.status ).toBe( `accepted` )
} )

test( `accepted members can ask an open Grapevine question`, async ( { page } ) => {
    await route_accepted_member( page )
    await page.route( `**/api/messages`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, messages: [] } ),
    } ) )
    await route_ask_filters( page, {
        hubs: [ { id: `hub_amsterdam`, name: `Amsterdam` } ],
        members: [],
    } )
    await page.route( `**/api/grapevine/query`, async route => {
        await new Promise( resolve => setTimeout( resolve, 100 ) )

        return route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( {
                ok: true,
                answer: {
                    id: `answer_1`,
                    markdown: `Amsterdam is focused on shared meals.`,
                    source_message_count: 3,
                    time_window: `last_month`,
                    model: `openai/gpt-4.1-mini`,
                    filters: { hub_ids: [], user_ids: [] },
                },
            } ),
        } )
    } )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: /Ask a question/ } ).click()
    await expect( page.getByLabel( `Question` ) ).toBeVisible()
    await page.getByRole( `button`, { name: `Ask something else` } ).click()
    await expect( page.getByRole( `button`, { name: `Specific hubs` } ) ).toBeVisible()
    await page.getByRole( `button`, { name: `Open question` } ).click()
    await page.getByLabel( `Question` ).fill( `What themes are active in Amsterdam?` )
    await page.getByRole( `button`, { name: `Ask`, exact: true } ).click()

    await expect( page.getByText( `Asking Grapevine` ) ).toBeVisible()
    await expect( page.getByLabel( `Question` ) ).not.toBeVisible()
    await expect( page.getByText( `Amsterdam is focused on shared meals.` ) ).toBeVisible()
    await expect( page.getByText( `Answer details` ) ).not.toBeVisible()
    await page.getByRole( `button`, { name: `Back home` } ).click()
    await expect( page.getByRole( `dialog`, { name: `Ask Grapevine` } ) ).not.toBeVisible()
    await expect( page.getByRole( `heading`, { name: `What do you need from the Grapevine?` } ) ).toBeVisible()
} )

test( `scoped Ask ignores Enter without selected filters`, async ( { page } ) => {
    await route_accepted_member( page )
    await page.route( `**/api/messages`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, messages: [] } ),
    } ) )
    await route_ask_filters( page, {
        hubs: [ { id: `hub_amsterdam`, name: `Amsterdam` } ],
        members: [ { id: accepted_user.id, name: accepted_user.name, hub: accepted_user.hub_name } ],
    } )

    let query_count = 0
    await page.route( `**/api/grapevine/query`, route => {
        query_count += 1

        return route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( { ok: true, answer: null } ),
        } )
    } )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: /Ask about people/ } ).click()
    await expect( page.getByRole( `button`, { name: `Ask`, exact: true } ) ).toBeDisabled()

    const query_request = page.waitForRequest( `**/api/grapevine/query`, { timeout: 300 } )
        .then( () => true )
        .catch( () => false )

    await page.getByLabel( `Find people` ).fill( `Ada` )
    await page.getByLabel( `Find people` ).press( `Enter` )

    await expect( query_request ).resolves.toBe( false )
    expect( query_count ).toBe( 0 )
} )

test( `scoped Ask clears duplicate member names by selected id`, async ( { page } ) => {
    await route_accepted_member( page )
    await page.route( `**/api/messages`, route => route.fulfill( {
        contentType: `application/json`,
        body: JSON.stringify( { ok: true, messages: [] } ),
    } ) )
    await route_ask_filters( page, {
        hubs: [],
        members: [
            { id: `member_sam_1`, name: `Sam`, hub: `Amsterdam` },
            { id: `member_sam_2`, name: `Sam`, hub: `Berlin` },
        ],
    } )

    let submitted_query = null
    await page.route( `**/api/grapevine/query`, route => {
        submitted_query = route.request().postDataJSON()

        return route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( {
                ok: true,
                answer: {
                    id: `answer_sam`,
                    markdown: `Only the remaining Sam is summarized.`,
                    source_message_count: 1,
                    time_window: `last_month`,
                    model: `openai/gpt-4.1-mini`,
                    filters: { hub_ids: [], user_ids: [ `member_sam_2` ] },
                },
            } ),
        } )
    } )

    await page.goto( `/` )
    await page.getByRole( `button`, { name: /Ask about people/ } ).click()
    await page.getByText( `Sam · Amsterdam` ).click()
    await page.getByText( `Sam · Berlin` ).click()
    await expect( page.getByRole( `button`, { name: `Person: Sam · Amsterdam` } ) ).toBeVisible()
    await expect( page.getByRole( `button`, { name: `Person: Sam · Berlin` } ) ).toBeVisible()

    await page.getByRole( `button`, { name: `Person: Sam · Amsterdam` } ).click()
    await page.getByRole( `button`, { name: `Ask`, exact: true } ).click()

    await expect.poll( () => submitted_query?.user_ids ).toEqual( [ `member_sam_2` ] )
    await expect( page.getByRole( `button`, { name: `Person: Sam · Berlin` } ) ).not.toBeVisible()
    await expect( page.getByText( `Only the remaining Sam is summarized.` ) ).toBeVisible()
} )
