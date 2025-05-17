/**
 * AuthManager
 * 
 * This module aims to abstract login procedures. Results from Mojang's REST api
 * are retrieved through our Mojang module. These results are processed and stored,
 * if applicable, in the config using the ConfigManager. All login procedures should
 * be made through this module.
 * 
 * @module authmanager
 */
// Requirements
const ConfigManager          = require('./configmanager')
const { LoggerUtil }         = require('limbo-core')
const { RestResponseStatus } = require('limbo-core/common')
const { MojangRestAPI, MojangErrorCode } = require('limbo-core/mojang')
const { MicrosoftAuth, MicrosoftErrorCode } = require('limbo-core/microsoft')
const { AZURE_CLIENT_ID }    = require('./ipcconstants')
const Lang = require('./langloader')
const { ipcRenderer } = require('electron')

const log = LoggerUtil.getLogger('AuthManager')

// Error messages

function microsoftErrorDisplayable(errorCode) {
    switch (errorCode) {
        case MicrosoftErrorCode.NO_PROFILE:
            return {
                title: Lang.queryJS('auth.microsoft.error.noProfileTitle'),
                desc: Lang.queryJS('auth.microsoft.error.noProfileDesc')
            }
        case MicrosoftErrorCode.NO_XBOX_ACCOUNT:
            return {
                title: Lang.queryJS('auth.microsoft.error.noXboxAccountTitle'),
                desc: Lang.queryJS('auth.microsoft.error.noXboxAccountDesc')
            }
        case MicrosoftErrorCode.XBL_BANNED:
            return {
                title: Lang.queryJS('auth.microsoft.error.xblBannedTitle'),
                desc: Lang.queryJS('auth.microsoft.error.xblBannedDesc')
            }
        case MicrosoftErrorCode.UNDER_18:
            return {
                title: Lang.queryJS('auth.microsoft.error.under18Title'),
                desc: Lang.queryJS('auth.microsoft.error.under18Desc')
            }
        case MicrosoftErrorCode.UNKNOWN:
            return {
                title: Lang.queryJS('auth.microsoft.error.unknownTitle'),
                desc: Lang.queryJS('auth.microsoft.error.unknownDesc')
            }
    }
}

function mojangErrorDisplayable(errorCode) {
    switch(errorCode) {
        case MojangErrorCode.ERROR_METHOD_NOT_ALLOWED:
            return {
                title: Lang.queryJS('auth.mojang.error.methodNotAllowedTitle'),
                desc: Lang.queryJS('auth.mojang.error.methodNotAllowedDesc')
            }
        case MojangErrorCode.ERROR_NOT_FOUND:
            return {
                title: Lang.queryJS('auth.mojang.error.notFoundTitle'),
                desc: Lang.queryJS('auth.mojang.error.notFoundDesc')
            }
        case MojangErrorCode.ERROR_USER_MIGRATED:
            return {
                title: Lang.queryJS('auth.mojang.error.accountMigratedTitle'),
                desc: Lang.queryJS('auth.mojang.error.accountMigratedDesc')
            }
        case MojangErrorCode.ERROR_INVALID_CREDENTIALS:
            return {
                title: Lang.queryJS('auth.mojang.error.invalidCredentialsTitle'),
                desc: Lang.queryJS('auth.mojang.error.invalidCredentialsDesc')
            }
        case MojangErrorCode.ERROR_PLAYER_NOT_FOUND:
            return {
                title: Lang.queryJS('auth.mojang.error.playerNotFoundTitle'),
                desc: Lang.queryJS('auth.mojang.error.playerNotFoundDesc')
            }
        case MojangErrorCode.ERROR_RATELIMIT:
            return {
                title: Lang.queryJS('auth.mojang.error.tooManyAttemptsTitle'),
                desc: Lang.queryJS('auth.mojang.error.tooManyAttemptsDesc')
            }
        case MojangErrorCode.ERROR_INVALID_TOKEN:
            return {
                title: Lang.queryJS('auth.mojang.error.invalidTokenTitle'),
                desc: Lang.queryJS('auth.mojang.error.invalidTokenDesc')
            }
        case MojangErrorCode.ERROR_ACCESS_TOKEN_HAS_PROFILE:
            return {
                title: Lang.queryJS('auth.mojang.error.tokenHasProfileTitle'),
                desc: Lang.queryJS('auth.mojang.error.tokenHasProfileDesc')
            }
        case MojangErrorCode.ERROR_CREDENTIALS_MISSING:
            return {
                title: Lang.queryJS('auth.mojang.error.credentialsMissingTitle'),
                desc: Lang.queryJS('auth.mojang.error.credentialsMissingDesc')
            }
        case MojangErrorCode.ERROR_INVALID_SALT_VERSION:
            return {
                title: Lang.queryJS('auth.mojang.error.invalidSaltVersionTitle'),
                desc: Lang.queryJS('auth.mojang.error.invalidSaltVersionDesc')
            }
        case MojangErrorCode.ERROR_UNSUPPORTED_MEDIA_TYPE:
            return {
                title: Lang.queryJS('auth.mojang.error.unsupportedMediaTypeTitle'),
                desc: Lang.queryJS('auth.mojang.error.unsupportedMediaTypeDesc')
            }
        case MojangErrorCode.ERROR_GONE:
            return {
                title: Lang.queryJS('auth.mojang.error.accountGoneTitle'),
                desc: Lang.queryJS('auth.mojang.error.accountGoneDesc')
            }
        case MojangErrorCode.ERROR_UNREACHABLE:
            return {
                title: Lang.queryJS('auth.mojang.error.unreachableTitle'),
                desc: Lang.queryJS('auth.mojang.error.unreachableDesc')
            }
        case MojangErrorCode.ERROR_NOT_PAID:
            return {
                title: Lang.queryJS('auth.mojang.error.gameNotPurchasedTitle'),
                desc: Lang.queryJS('auth.mojang.error.gameNotPurchasedDesc')
            }
        case MojangErrorCode.UNKNOWN:
            return {
                title: Lang.queryJS('auth.mojang.error.unknownErrorTitle'),
                desc: Lang.queryJS('auth.mojang.error.unknownErrorDesc')
            }
        default:
            throw new Error(`Unknown error code: ${errorCode}`)
    }
}

// Functions

/**
 * Verifica si un perfil de Minecraft ya está registrado en la base de datos.
 * 
 * @param {string} uuid El UUID del perfil a verificar.
 * @returns {boolean} True si el perfil ya está registrado, false en caso contrario.
 */
exports.isProfileRegistered = function(uuid) {
    const authAccounts = ConfigManager.getAuthAccounts()
    
    // Buscar en todas las cuentas registradas
    for (const accountId in authAccounts) {
        const account = authAccounts[accountId]
        
        // Comprobar si el UUID del perfil coincide con alguna cuenta registrada
        if (account.uuid === uuid) {
            return true
        }
    }
    
    return false
}

/**
 * Filtra los perfiles disponibles para mostrar solo los que no están registrados.
 * 
 * @param {Array} availableProfiles Lista de perfiles disponibles de una cuenta.
 * @returns {Array} Lista de perfiles que aún no están registrados.
 */
exports.filterRegisteredProfiles = function(availableProfiles) {
    if (!availableProfiles || !Array.isArray(availableProfiles)) {
        return []
    }
    
    return availableProfiles.filter(profile => !exports.isProfileRegistered(profile.id))
}

/**
 * Add a Mojang account. This will authenticate the given credentials against
 * the Mojang auth server. On successful authentication, the account will be
 * saved to the authorization database.
 * 
 * @param {string} username The account username (email if migrated).
 * @param {string} password The account password.
 * @returns {Promise.<Object>} Promise which resolves the resolved authenticated account object.
 */
exports.addMojangAccount = async function(username, password) {
    try {
        // Siempre generamos un nuevo clientToken para cada autenticación 
        // Para garantizar que nunca se repita
        const clientToken = ConfigManager.generateClientToken()
        log.info('Generando nuevo clientToken para autenticación:', clientToken.substring(0, 6) + '...')
        
        const response = await MojangRestAPI.authenticate(username, password, clientToken)
        const session = response.data

        if (session.selectedProfile == null) {
            if (session.availableProfiles && session.availableProfiles.length > 0) {
                // Filtrar perfiles ya registrados
                const newProfiles = exports.filterRegisteredProfiles(session.availableProfiles)
                
                // Si no hay perfiles nuevos para registrar
                if (newProfiles.length === 0) {
                    // Invalidar el token y notificar al usuario
                    try {
                        await exports.invalidateMojangToken(session.accessToken, session.clientToken, 'all_profiles_registered')
                        log.info('Token invalidado porque todos los perfiles ya están registrados')
                    } catch (err) {
                        log.warn('Error al invalidar token con perfiles ya registrados:', err)
                    }
                    
                    throw new Error('all_profiles_registered')
                }
                
                // Si solo queda un perfil disponible, seleccionarlo automáticamente
                if (newProfiles.length === 1) {
                    log.info('Solo un perfil disponible, seleccionando automáticamente:', newProfiles[0].name)
                    
                    try {
                        // Refrescar el token con el perfil seleccionado
                        const refreshResponse = await MojangRestAPI.refresh(
                            session.accessToken, 
                            session.clientToken,
                            newProfiles[0].id, 
                            newProfiles[0].name
                        )
                        
                        const refreshedSession = refreshResponse.data
                        
                        // Añadir la cuenta con el perfil seleccionado
                        const ret = ConfigManager.addMojangAuthAccount(
                            refreshedSession.selectedProfile.id,
                            refreshedSession.selectedProfile.id,
                            refreshedSession.accessToken,
                            refreshedSession.clientToken,
                            username,
                            refreshedSession.selectedProfile.name,
                            session.availableProfiles
                        )
                        return ret
                    } catch (err) {
                        log.error('Error al refrescar token con perfil único:', err)
                        // Si falla el refresco, seguimos con el flujo normal de selección
                    }
                }
                
                // Si hay múltiples perfiles o falló la selección automática, mostrar selector
                return {
                    clientToken: session.clientToken,
                    accessToken: session.accessToken,
                    availableProfiles: newProfiles,
                    originalProfiles: session.availableProfiles,
                    requiresProfileSelection: true
                }
            } else {
                // No hay perfiles disponibles
                throw new Error('No game profiles associated with this account')
            }
        }

        // Verificar si el perfil seleccionado ya está registrado
        if (exports.isProfileRegistered(session.selectedProfile.id)) {
            // Invalidar el token y notificar al usuario
            try {
                await exports.invalidateMojangToken(session.accessToken, session.clientToken, 'profile_already_registered')
                log.info('Token invalidado porque el perfil seleccionado ya está registrado')
            } catch (err) {
                log.warn('Error al invalidar token con perfil ya registrado:', err)
            }
            
            throw new Error('profile_already_registered')
        }

        const ret = ConfigManager.addMojangAuthAccount(
            session.selectedProfile.id,
            session.selectedProfile.id,
            session.accessToken,
            session.clientToken,
            username,
            session.selectedProfile.name,
            session.availableProfiles
        )
        return ret
    } catch (err) {
        if (err.message === 'all_profiles_registered' || err.message === 'profile_already_registered') {
            return Promise.reject({
                title: 'Perfiles ya registrados',
                desc: 'Todos los perfiles de esta cuenta ya están registrados en el launcher.'
            })
        }
        
        return Promise.reject(mojangErrorDisplayable(err))
    }
}

/**
 * Select a profile from an account with multiple profiles.
 * This will refresh the token with the selected profile.
 * 
 * @param {string} accessToken The account access token.
 * @param {string} clientToken The account client token.
 * @param {string} uuid The selected profile UUID.
 * @param {string} name The selected profile name.
 * @returns {Promise.<Object>} Promise which resolves the refreshed account object.
 */
exports.selectMojangProfile = async function(accessToken, clientToken, uuid, name) {
    try {
        // IMPORTANTE: Debemos usar el mismo clientToken que se usó en la autenticación original
        log.info('Usando clientToken original para refresh:', clientToken.substring(0, 6) + '...')
        
        // Usamos el token original para el refresh
        const refreshResponse = await MojangRestAPI.refresh(accessToken, clientToken, uuid, name)
        
        // Verificar que tenemos datos válidos antes de devolverlos
        if (!refreshResponse || !refreshResponse.data) {
            log.error('Respuesta de refresh inesperada:', refreshResponse)
            throw new Error('invalid_refresh_response')
        }
        
        // Verificar que la respuesta contiene el perfil seleccionado
        if (!refreshResponse.data.selectedProfile) {
            log.error('Respuesta de refresh sin perfil seleccionado:', refreshResponse.data)
            throw new Error('missing_selected_profile')
        }
        
        return refreshResponse.data
    } catch (err) {
        // Mejorar el logging de errores
        if (err.response && err.response.statusCode === 500) {
            log.error('Error 500 del servidor durante refresh:', err.message)
            log.debug('Detalles de la respuesta:', err.response.body)
            
            return Promise.reject({
                title: Lang.queryJS('auth.mojang.error.serverErrorTitle') || 'Error del servidor',
                desc: Lang.queryJS('auth.mojang.error.serverErrorDesc') || 
                      'Error interno del servidor (500). Por favor, intenta más tarde.'
            })
        }
        
        // Si es un error personalizado que generamos nosotros
        if (err.message === 'invalid_refresh_response') {
            return Promise.reject({
                title: Lang.queryJS('auth.mojang.error.invalidResponseTitle') || 'Respuesta inválida',
                desc: Lang.queryJS('auth.mojang.error.invalidResponseDesc') || 
                      'El servidor devolvió una respuesta inválida. Por favor, intenta nuevamente.'
            })
        }
        
        if (err.message === 'missing_selected_profile') {
            return Promise.reject({
                title: Lang.queryJS('auth.mojang.error.missingProfileTitle') || 'Perfil no encontrado',
                desc: Lang.queryJS('auth.mojang.error.missingProfileDesc') || 
                      'No se encontró el perfil seleccionado en la respuesta del servidor.'
            })
        }
        
        // Para otros errores, usamos el handler existente
        return Promise.reject(mojangErrorDisplayable(err))
    }
}

/**
 * Invalidate a specific Mojang access token.
 * 
 * @param {string} accessToken The specific access token to invalidate.
 * @param {string} clientToken The client token associated with the access token.
 * @param {string} reason The reason for invalidation (optional).
 * @returns {Promise.<boolean>} Promise which resolves when the token is invalidated.
 */
exports.invalidateMojangToken = async function(accessToken, clientToken, reason = 'unspecified') {
    try {
        if (!accessToken || !clientToken) {
            log.warn('Intento de invalidar token sin proporcionar accessToken o clientToken')
            return Promise.resolve(false)
        }
        
        // Log específico del token que se está invalidando
        log.info(`Invalidando token específico - Client: ${clientToken.substring(0, 6)}... - Razón: ${reason}`)
        
        if (reason === 'unused') {
            log.info('Token descartado porque no fue utilizado')
        } else if (reason === 'profile_already_registered') {
            log.info('Token descartado porque el perfil ya está registrado')
        } else if (reason === 'all_profiles_registered') {
            log.info('Token descartado porque todos los perfiles ya están registrados')
        } else if (reason === 'user_cancelled') {
            log.info('Token descartado debido a cancelación del usuario')
        } else {
            log.info('Descartando token por razón: ' + reason)
        }
        
        await MojangRestAPI.invalidate(accessToken, clientToken)
        log.info('Token específico invalidado correctamente!')
        return Promise.resolve(true)
    } catch (err) {
        log.warn('Error al invalidar token específico:', err)
        // Continuamos aunque haya un error, pero devolvemos false para indicar fallo
        return Promise.resolve(false)
    }
}

async function ProfileSelector() {
    await toggleProfileSwitch(true, true)
}

const AUTH_MODE = { FULL: 0, MS_REFRESH: 1, MC_REFRESH: 2 }

/**
 * Perform the full MS Auth flow in a given mode.
 * 
 * AUTH_MODE.FULL = Full authorization for a new account.
 * AUTH_MODE.MS_REFRESH = Full refresh authorization.
 * AUTH_MODE.MC_REFRESH = Refresh of the MC token, reusing the MS token.
 * 
 * @param {string} entryCode FULL-AuthCode. MS_REFRESH=refreshToken, MC_REFRESH=accessToken
 * @param {*} authMode The auth mode.
 * @returns An object with all auth data. AccessToken object will be null when mode is MC_REFRESH.
 */
async function fullMicrosoftAuthFlow(entryCode, authMode) {
    try {

        let accessTokenRaw
        let accessToken
        if(authMode !== AUTH_MODE.MC_REFRESH) {
            const accessTokenResponse = await MicrosoftAuth.getAccessToken(entryCode, authMode === AUTH_MODE.MS_REFRESH, AZURE_CLIENT_ID)
            if(accessTokenResponse.responseStatus === RestResponseStatus.ERROR) {
                return Promise.reject(microsoftErrorDisplayable(accessTokenResponse.microsoftErrorCode))
            }
            accessToken = accessTokenResponse.data
            accessTokenRaw = accessToken.access_token
        } else {
            accessTokenRaw = entryCode
        }
        
        const xblResponse = await MicrosoftAuth.getXBLToken(accessTokenRaw)
        if(xblResponse.responseStatus === RestResponseStatus.ERROR) {
            return Promise.reject(microsoftErrorDisplayable(xblResponse.microsoftErrorCode))
        }
        const xstsResonse = await MicrosoftAuth.getXSTSToken(xblResponse.data)
        if(xstsResonse.responseStatus === RestResponseStatus.ERROR) {
            return Promise.reject(microsoftErrorDisplayable(xstsResonse.microsoftErrorCode))
        }
        const mcTokenResponse = await MicrosoftAuth.getMCAccessToken(xstsResonse.data)
        if(mcTokenResponse.responseStatus === RestResponseStatus.ERROR) {
            return Promise.reject(microsoftErrorDisplayable(mcTokenResponse.microsoftErrorCode))
        }
        const mcProfileResponse = await MicrosoftAuth.getMCProfile(mcTokenResponse.data.access_token)
        if(mcProfileResponse.responseStatus === RestResponseStatus.ERROR) {
            return Promise.reject(microsoftErrorDisplayable(mcProfileResponse.microsoftErrorCode))
        }
        return {
            accessToken,
            accessTokenRaw,
            xbl: xblResponse.data,
            xsts: xstsResonse.data,
            mcToken: mcTokenResponse.data,
            mcProfile: mcProfileResponse.data
        }
    } catch(err) {
        log.error(err)
        return Promise.reject(microsoftErrorDisplayable(MicrosoftErrorCode.UNKNOWN))
    }
}

/**
 * Calculate the expiry date. Advance the expiry time by 10 seconds
 * to reduce the liklihood of working with an expired token.
 * 
 * @param {number} nowMs Current time milliseconds.
 * @param {number} epiresInS Expires in (seconds)
 * @returns 
 */
function calculateExpiryDate(nowMs, epiresInS) {
    return nowMs + ((epiresInS-10)*1000)
}

/**
 * Add a Microsoft account. This will pass the provided auth code to Mojang's OAuth2.0 flow.
 * The resultant data will be stored as an auth account in the configuration database.
 * 
 * @param {string} authCode The authCode obtained from microsoft.
 * @returns {Promise.<Object>} Promise which resolves the resolved authenticated account object.
 */
exports.addMicrosoftAccount = async function(authCode) {

    const fullAuth = await fullMicrosoftAuthFlow(authCode, AUTH_MODE.FULL)

    // Advance expiry by 10 seconds to avoid close calls.
    const now = new Date().getTime()

    const ret = ConfigManager.addMicrosoftAuthAccount(
        fullAuth.mcProfile.id,
        fullAuth.mcToken.access_token,
        fullAuth.mcProfile.name,
        calculateExpiryDate(now, fullAuth.mcToken.expires_in),
        fullAuth.accessToken.access_token,
        fullAuth.accessToken.refresh_token,
        calculateExpiryDate(now, fullAuth.accessToken.expires_in)
    )
    ConfigManager.save()

    return ret
}

/**
 * Log out of a Mojang account. This will invalidate the access token
 * and remove the account from the database.
 * 
 * @param {string} clientToken The client token of the account to log out of.
 * @returns {Promise.<boolean>} Promise which resolves to true if logout was successful.
 */
exports.removeMojangAccount = async function(clientToken) {
    try {
        const authAcc = ConfigManager.getAuthAccount(clientToken)
        if (authAcc == null) {
            return Promise.resolve(false)
        }

        try {
            // Intento de invalidación del token
            log.info(`Intentando invalidar token para la cuenta ${authAcc.displayName}`)
            await MojangRestAPI.invalidate(authAcc.accessToken, authAcc.clientToken)
            log.info(`Token invalidado correctamente para ${authAcc.displayName}`)
        } catch (err) {
            // En caso de error en la invalidación, sólo registramos el error
            log.warn('Error al invalidar token durante el cierre de sesión:', err)
            log.info('Continuando con la eliminación de la cuenta a pesar del error de invalidación')
        }

        // Siempre eliminamos la cuenta de la base de datos, incluso si falla la invalidación
        const removed = ConfigManager.removeAuthAccount(clientToken)
        if (removed) {
            ConfigManager.save()
            log.info(`Cuenta ${authAcc.displayName} eliminada de la base de datos`)
            return Promise.resolve(true)
        } else {
            log.warn(`No se encontró la cuenta ${clientToken} para eliminar`)
            return Promise.resolve(false)
        }
    } catch (err) {
        log.error('Error desconocido durante el cierre de sesión:', err)
        return Promise.resolve(false)
    }
}

/**
 * Remove a Microsoft account. It is expected that the caller will invoke the OAuth logout
 * through the ipc renderer.
 * 
 * @param {string} uuid The UUID of the account to be removed.
 * @returns {Promise.<void>} Promise which resolves to void when the action is complete.
 */
exports.removeMicrosoftAccount = async function(uuid){
    try {
        ConfigManager.removeAuthAccount(uuid)
        ConfigManager.save()
        return Promise.resolve()
    } catch (err){
        log.error('Error while removing account', err)
        return Promise.reject(err)
    }
}

/**
 * Validate the selected account with Mojang's authserver. If the account is not valid,
 * we will attempt to refresh the access token and update that value. If that fails, a
 * new login will be required.
 * 
 * @returns {Promise.<boolean>} Promise which resolves to true if the access token is valid,
 * otherwise false.
 */
async function validateSelectedMojangAccount(){
    const current = ConfigManager.getSelectedAccount()
    
    try {
        // Siempre intentamos refrescar el token, independientemente de su validez actual
        const refreshResponse = await MojangRestAPI.refresh(current.accessToken, current.clientToken, current.uuid, current.username)
        if(refreshResponse.responseStatus === RestResponseStatus.SUCCESS) {
            const session = refreshResponse.data
            ConfigManager.updateMojangAuthAccount(current.clientToken, session.accessToken, session.availableProfiles, session.selectedProfile.name)
            ConfigManager.save()
            log.info('Account access token refreshed successfully.')
            return true
        } else {
            log.error('Error while refreshing token:', refreshResponse.error)
            log.info('Failed to refresh account access token.')
            return false
        }
    } catch (err) {
        log.error('Exception during token refresh:', err)
        return false
    }
}

/**
 * Validate the selected account with Microsoft's authserver. If the account is not valid,
 * we will attempt to refresh the access token and update that value. If that fails, a
 * new login will be required.
 * 
 * @returns {Promise.<boolean>} Promise which resolves to true if the access token is valid,
 * otherwise false.
 */
async function validateSelectedMicrosoftAccount(){
    const current = ConfigManager.getSelectedAccount()
    const now = new Date().getTime()
    const mcExpiresAt = current.expiresAt
    const mcExpired = now >= mcExpiresAt

    if(!mcExpired) {
        return true
    }

    // MC token expired. Check MS token.

    const msExpiresAt = current.microsoft.expires_at
    const msExpired = now >= msExpiresAt

    if(msExpired) {
        // MS expired, do full refresh.
        try {
            const res = await fullMicrosoftAuthFlow(current.microsoft.refresh_token, AUTH_MODE.MS_REFRESH)

            ConfigManager.updateMicrosoftAuthAccount(
                current.uuid,
                res.mcToken.access_token,
                res.accessToken.access_token,
                res.accessToken.refresh_token,
                calculateExpiryDate(now, res.accessToken.expires_in),
                calculateExpiryDate(now, res.mcToken.expires_in)
            )
            ConfigManager.save()
            return true
        } catch(err) {
            return false
        }
    } else {
        // Only MC expired, use existing MS token.
        try {
            const res = await fullMicrosoftAuthFlow(current.microsoft.access_token, AUTH_MODE.MC_REFRESH)

            ConfigManager.updateMicrosoftAuthAccount(
                current.uuid,
                res.mcToken.access_token,
                current.microsoft.access_token,
                current.microsoft.refresh_token,
                current.microsoft.expires_at,
                calculateExpiryDate(now, res.mcToken.expires_in)
            )
            ConfigManager.save()
            return true
        }
        catch(err) {
            return false
        }
    }
}

/**
 * Validate the selected auth account.
 * 
 * @returns {Promise.<boolean>} Promise which resolves to true if the access token is valid,
 * otherwise false.
 */
exports.validateSelected = async function(){
    const current = ConfigManager.getSelectedAccount()

    if(current.type === 'microsoft') {
        return await validateSelectedMicrosoftAccount()
    } else {
        return await validateSelectedMojangAccount()
    }
    
}
