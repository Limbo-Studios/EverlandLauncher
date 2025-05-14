/**
 * Initialize UI functions which depend on internal modules.
 * Loaded after core UI functions are initialized in uicore.js.
 */
// Requirements
const path          = require('path')
const { Type }      = require('helios-distribution-types')
const AuthManager   = require('./assets/js/authmanager')
const ConfigManager = require('./assets/js/configmanager')
const { DistroAPI } = require('./assets/js/distromanager')

let rscShouldLoad = false
let fatalStartupError = false

// Mapping of each view to their container IDs.
const VIEWS = {
    landing: '#landingContainer',
    loginOptions: '#loginOptionsContainer',
    login: '#loginContainer',
    settings: '#settingsContainer',
    welcome: '#welcomeContainer',
    waiting: '#waitingContainer'
}

// The currently shown view container.
let currentView

/**
 * Switch launcher views.
 * 
 * @param {string} current The ID of the current view container. 
 * @param {*} next The ID of the next view container.
 * @param {*} currentFadeTime Optional. The fade out time for the current view.
 * @param {*} nextFadeTime Optional. The fade in time for the next view.
 * @param {*} onCurrentFade Optional. Callback function to execute when the current
 * view fades out.
 * @param {*} onNextFade Optional. Callback function to execute when the next view
 * fades in.
 */
function switchView(current, next, currentFadeTime = 500, nextFadeTime = 500, onCurrentFade = () => {}, onNextFade = () => {}){
    currentView = next
    $(`${current}`).fadeOut(currentFadeTime, async () => {
        await onCurrentFade()
        $(`${next}`).fadeIn(nextFadeTime, async () => {
            await onNextFade()
        })
    })
}

/**
 * Get the currently shown view container.
 * 
 * @returns {string} The currently shown view container.
 */
function getCurrentView(){
    return currentView
}

async function showMainUI(data){

    if(!isDev){
        loggerAutoUpdater.info('Initializing..')
        ipcRenderer.send('autoUpdateAction', 'initAutoUpdater', ConfigManager.getAllowPrerelease())
    }

    await prepareSettings(true)
    updateSelectedServer(data.getServerById(ConfigManager.getSelectedServer()))
    refreshServerStatus()
    setTimeout(() => {
        document.getElementById('frameBar').style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
        document.body.style.backgroundImage = `url('assets/images/backgrounds/${document.body.getAttribute('bkid')}.jpg')`
        $('#main').show()

        const isLoggedIn = Object.keys(ConfigManager.getAuthAccounts()).length > 0

        // If this is enabled in a development environment we'll get ratelimited.
        // The relaunch frequency is usually far too high.
        if(!isDev && isLoggedIn){
            validateSelectedAccount()
        }

        if(ConfigManager.isFirstLaunch()){
            currentView = VIEWS.welcome
            $(VIEWS.welcome).fadeIn(1000)
        } else {
            if(isLoggedIn){
                currentView = VIEWS.landing
                $(VIEWS.landing).fadeIn(1000)
            } else {
                loginOptionsCancelEnabled(false)
                loginOptionsViewOnLoginSuccess = VIEWS.landing
                loginOptionsViewOnLoginCancel = VIEWS.login
                currentView = VIEWS.login
                $(VIEWS.login).fadeIn(1000)
            }
        }

        setTimeout(() => {
            $('#loadingContainer').fadeOut(500, () => {
                $('#loadSpinnerImage').removeClass('rotating')
            })
        }, 250)
        
    }, 750)
    // Disable tabbing to the news container.
    initNews().then(() => {
    })

    // Iniciar actualización periódica de tokens y actualizar token al iniciar
    try {
        const current = ConfigManager.getSelectedAccount()
        if(current && current.type === 'mojang') {
            logger.info('Refrescando token al iniciar para cuenta Mojang:', current.displayName)
            
            // Guardar nombre anterior para detectar cambios
            const previousName = current.displayName
            
            // Refrescar la sesión usando MojangRestAPI
            try {
                const refreshResponse = await MojangRestAPI.refresh(
                    current.accessToken, 
                    current.clientToken, 
                    current.uuid, 
                    current.username
                )
                
                if(refreshResponse.responseStatus === RestResponseStatus.SUCCESS) {
                    const session = refreshResponse.data
                    logger.info(`Token refrescado correctamente al iniciar para ${current.displayName}`)
                    
                    // Actualizar cuenta en ConfigManager
                    ConfigManager.updateMojangAuthAccount(
                        current.clientToken, 
                        session.accessToken, 
                        session.availableProfiles, 
                        session.selectedProfile.name
                    )
                    ConfigManager.save()
                    
                    // Comprobar si el nombre ha cambiado y forzar actualización
                    if(session.selectedProfile.name !== previousName) {
                        logger.info(`Nombre actualizado al iniciar: ${previousName} -> ${session.selectedProfile.name}`)
                        
                        // Obtener cuenta actualizada y forzar actualización en UI
                        const updatedAccount = ConfigManager.getSelectedAccount()
                        notifyUserDataChanged(updatedAccount)
                    }
                }
            } catch(err) {
                logger.error('Error al refrescar token al iniciar:', err)
            }
        }
    } catch(err) {
        logger.error('Error al actualizar token al iniciar:', err)
    }
}

function showFatalStartupError(){
    setTimeout(() => {
        $('#loadingContainer').fadeOut(250, () => {
            document.getElementById('overlayContainer').style.background = 'none'
            setOverlayContent(
                Lang.queryJS('uibinder.startup.fatalErrorTitle'),
                Lang.queryJS('uibinder.startup.fatalErrorMessage'),
                Lang.queryJS('uibinder.startup.closeButton')
            )
            setOverlayHandler(() => {
                const window = remote.getCurrentWindow()
                window.close()
            })
            toggleOverlay(true)
        })
    }, 750)
}

/**
 * Common functions to perform after refreshing the distro index.
 * 
 * @param {Object} data The distro index object.
 */
function onDistroRefresh(data){
    updateSelectedServer(data.getServerById(ConfigManager.getSelectedServer()))
    refreshServerStatus()
    initNews()
    syncModConfigurations(data)
    ensureJavaSettings(data)
}

/**
 * Sync the mod configurations with the distro index.
 * 
 * @param {Object} data The distro index object.
 */
function syncModConfigurations(data){

    const syncedCfgs = []

    for(let serv of data.servers){

        const id = serv.rawServer.id
        const mdls = serv.modules
        const cfg = ConfigManager.getModConfiguration(id)

        if(cfg != null){

            const modsOld = cfg.mods
            const mods = {}

            for(let mdl of mdls){
                const type = mdl.rawModule.type

                if(type === Type.ForgeMod || type === Type.LiteMod || type === Type.LiteLoader || type === Type.FabricMod){
                    if(!mdl.getRequired().value){
                        const mdlID = mdl.getVersionlessMavenIdentifier()
                        if(modsOld[mdlID] == null){
                            mods[mdlID] = scanOptionalSubModules(mdl.subModules, mdl)
                        } else {
                            mods[mdlID] = mergeModConfiguration(modsOld[mdlID], scanOptionalSubModules(mdl.subModules, mdl), false)
                        }
                    } else {
                        if(mdl.subModules.length > 0){
                            const mdlID = mdl.getVersionlessMavenIdentifier()
                            const v = scanOptionalSubModules(mdl.subModules, mdl)
                            if(typeof v === 'object'){
                                if(modsOld[mdlID] == null){
                                    mods[mdlID] = v
                                } else {
                                    mods[mdlID] = mergeModConfiguration(modsOld[mdlID], v, true)
                                }
                            }
                        }
                    }
                }
            }

            syncedCfgs.push({
                id,
                mods
            })

        } else {

            const mods = {}

            for(let mdl of mdls){
                const type = mdl.rawModule.type
                if(type === Type.ForgeMod || type === Type.LiteMod || type === Type.LiteLoader || type === Type.FabricMod){
                    if(!mdl.getRequired().value){
                        mods[mdl.getVersionlessMavenIdentifier()] = scanOptionalSubModules(mdl.subModules, mdl)
                    } else {
                        if(mdl.subModules.length > 0){
                            const v = scanOptionalSubModules(mdl.subModules, mdl)
                            if(typeof v === 'object'){
                                mods[mdl.getVersionlessMavenIdentifier()] = v
                            }
                        }
                    }
                }
            }

            syncedCfgs.push({
                id,
                mods
            })

        }
    }

    ConfigManager.setModConfigurations(syncedCfgs)
    ConfigManager.save()
}

/**
 * Ensure java configurations are present for the available servers.
 * 
 * @param {Object} data The distro index object.
 */
function ensureJavaSettings(data) {

    // Nothing too fancy for now.
    for(const serv of data.servers){
        ConfigManager.ensureJavaConfig(serv.rawServer.id, serv.effectiveJavaOptions, serv.rawServer.javaOptions?.ram)
    }

    ConfigManager.save()
}

/**
 * Recursively scan for optional sub modules. If none are found,
 * this function returns a boolean. If optional sub modules do exist,
 * a recursive configuration object is returned.
 * 
 * @returns {boolean | Object} The resolved mod configuration.
 */
function scanOptionalSubModules(mdls, origin){
    if(mdls != null){
        const mods = {}

        for(let mdl of mdls){
            const type = mdl.rawModule.type
            // Optional types.
            if(type === Type.ForgeMod || type === Type.LiteMod || type === Type.LiteLoader || type === Type.FabricMod){
                // It is optional.
                if(!mdl.getRequired().value){
                    mods[mdl.getVersionlessMavenIdentifier()] = scanOptionalSubModules(mdl.subModules, mdl)
                } else {
                    if(mdl.hasSubModules()){
                        const v = scanOptionalSubModules(mdl.subModules, mdl)
                        if(typeof v === 'object'){
                            mods[mdl.getVersionlessMavenIdentifier()] = v
                        }
                    }
                }
            }
        }

        if(Object.keys(mods).length > 0){
            const ret = {
                mods
            }
            if(!origin.getRequired().value){
                ret.value = origin.getRequired().def
            }
            return ret
        }
    }
    return origin.getRequired().def
}

/**
 * Recursively merge an old configuration into a new configuration.
 * 
 * @param {boolean | Object} o The old configuration value.
 * @param {boolean | Object} n The new configuration value.
 * @param {boolean} nReq If the new value is a required mod.
 * 
 * @returns {boolean | Object} The merged configuration.
 */
function mergeModConfiguration(o, n, nReq = false){
    if(typeof o === 'boolean'){
        if(typeof n === 'boolean') return o
        else if(typeof n === 'object'){
            if(!nReq){
                n.value = o
            }
            return n
        }
    } else if(typeof o === 'object'){
        if(typeof n === 'boolean') return typeof o.value !== 'undefined' ? o.value : true
        else if(typeof n === 'object'){
            if(!nReq){
                n.value = typeof o.value !== 'undefined' ? o.value : true
            }

            const newMods = Object.keys(n.mods)
            for(let i=0; i<newMods.length; i++){

                const mod = newMods[i]
                if(o.mods[mod] != null){
                    n.mods[mod] = mergeModConfiguration(o.mods[mod], n.mods[mod])
                }
            }

            return n
        }
    }
    // If for some reason we haven't been able to merge,
    // wipe the old value and use the new one. Just to be safe
    return n
}

async function validateSelectedAccount(){
    const selectedAcc = ConfigManager.getSelectedAccount()
    if(selectedAcc != null){
        // Intentar refrescar el token y detectar cambios de nombre
        try {
            if(selectedAcc.type === 'mojang') {
                const refreshResponse = await MojangRestAPI.refresh(
                    selectedAcc.accessToken, 
                    selectedAcc.clientToken, 
                    selectedAcc.uuid, 
                    selectedAcc.username
                )
                
                if(refreshResponse.responseStatus === RestResponseStatus.SUCCESS) {
                    const session = refreshResponse.data
                    
                    // Guardar nombre anterior para comparar
                    const previousName = selectedAcc.displayName
                    
                    // Actualizar cuenta en ConfigManager
                    ConfigManager.updateMojangAuthAccount(
                        selectedAcc.clientToken, 
                        session.accessToken, 
                        session.availableProfiles, 
                        session.selectedProfile.name
                    )
                    ConfigManager.save()
                    
                    // Comprobar si el nombre ha cambiado y forzar actualización
                    if(session.selectedProfile.name !== previousName) {
                        logger.info(`Nombre cambiado durante validación: ${previousName} -> ${session.selectedProfile.name}`)
                        
                        // Obtener cuenta actualizada y forzar actualización en UI
                        const updatedAccount = ConfigManager.getSelectedAccount()
                        notifyUserDataChanged(updatedAccount)
                    }
                }
            }
        } catch(err) {
            logger.warn('Error al refrescar token durante validación:', err)
        }
        
        // Continuar con la validación normal
        const val = await AuthManager.validateSelected()
        if(!val){
            ConfigManager.removeAuthAccount(selectedAcc.clientToken)
            ConfigManager.save()
            const accLen = Object.keys(ConfigManager.getAuthAccounts()).length
            setOverlayContent(
                Lang.queryJS('uibinder.validateAccount.failedMessageTitle'),
                accLen > 0
                    ? Lang.queryJS('uibinder.validateAccount.failedMessage', { 'account': selectedAcc.displayName })
                    : Lang.queryJS('uibinder.validateAccount.failedMessageSelectAnotherAccount', { 'account': selectedAcc.displayName }),
                Lang.queryJS('uibinder.validateAccount.loginButton'),
                Lang.queryJS('uibinder.validateAccount.selectAnotherAccountButton')
            )
            setOverlayHandler(() => {

                const isMicrosoft = selectedAcc.type === 'microsoft'

                if(isMicrosoft) {
                    // Empty for now
                } else {
                    // Mojang
                    // For convenience, pre-populate the username of the account.
                    document.getElementById('loginUsername').value = selectedAcc.username
                    validateEmail(selectedAcc.username)
                }
                
                loginOptionsViewOnLoginSuccess = getCurrentView()
                loginOptionsViewOnLoginCancel = VIEWS.login

                if(accLen > 0) {
                    loginOptionsViewOnCancel = getCurrentView()
                    loginOptionsViewCancelHandler = () => {
                        if(isMicrosoft) {
                            ConfigManager.addMicrosoftAuthAccount(
                                selectedAcc.uuid,
                                selectedAcc.accessToken,
                                selectedAcc.username,
                                selectedAcc.expiresAt,
                                selectedAcc.microsoft.access_token,
                                selectedAcc.microsoft.refresh_token,
                                selectedAcc.microsoft.expires_at
                            )
                        } else {
                            ConfigManager.addMojangAuthAccount(selectedAcc.uuid, selectedAcc.accountID, selectedAcc.accessToken, selectedAcc.clientToken, selectedAcc.username, selectedAcc.displayName, selectedAcc.availableProfiles)
                        }
                        ConfigManager.save()
                        validateSelectedAccount()
                    }
                    loginOptionsCancelEnabled(true)
                } else {
                    loginOptionsCancelEnabled(false)
                }
                toggleOverlay(false)
                switchView(getCurrentView(), VIEWS.login)
            })
            setDismissHandler(async () => {
                if(accLen > 1){
                    await prepareAccountSelectionList()
                    $('#overlayContent').fadeOut(250, () => {
                        bindOverlayKeys(true, 'accountSelectContent', true)
                        $('#accountSelectContent').fadeIn(250)
                    })
                } else {
                    const accountsObj = ConfigManager.getAuthAccounts()
                    
                    logger.info("accountsObj:", accountsObj);
                    const accounts = Array.from(Object.keys(accountsObj), v => accountsObj[v])
                    logger.info("accounts:", accounts);
                    // This function validates the account switch.
                    setSelectedAccount(accounts[0].clientToken)
                    toggleOverlay(false)
                }
            })
            toggleOverlay(true, accLen > 0)
        } else {
            return true
        }
    } else {
        return true
    }
}

/**
 * Temporary function to update the selected account along
 * with the relevent UI elements.
 * 
 * @param {string} uuid The UUID of the account.
 */
function setSelectedAccount(clientToken){
    // Obtener la cuenta seleccionada
    const authAcc = ConfigManager.setSelectedAccount(clientToken)
    
    // Guardar configuración inmediatamente
    ConfigManager.save()
    
    // Forzar la actualización de UI después de guardar los cambios
    updateSelectedAccount(authAcc, true)
    
    // Ejecutar validación como proceso posterior
    setTimeout(() => {
        validateSelectedAccount()
    }, 50)
    
    return authAcc
}

/**
 * Notifica a todas las partes de la aplicación que los datos de usuario han cambiado.
 * 
 * @param {Object} account La cuenta actualizada
 */
function notifyUserDataChanged(account) {
    logger.info('Notificando cambio de datos de usuario para:', account?.displayName)
    
    // Método 1: Actualizar directamente la vista principal
    if(window.updateSelectedAccountDirect) {
        window.updateSelectedAccountDirect(account, true)
    }
    
    // Método 2: Disparar evento para que otros componentes se actualicen
    document.dispatchEvent(new CustomEvent('userDataChanged', {
        detail: { account, timestamp: Date.now() }
    }))
    
    // Método 3: Si estamos en una vista específica, actualizar componentes relevantes
    if(getCurrentView() === VIEWS.settings) {
        if(typeof refreshAuthAccounts === 'function') {
            refreshAuthAccounts()
        }
    }
}

/**
 * Iniciar el intervalo de actualización de nombres de usuario.
 */
function startUsernameRefreshInterval() {
    // Configurar el nuevo intervalo
    usernameRefreshInterval = setInterval(async () => {
        try {
            const current = ConfigManager.getSelectedAccount()
            if(current && current.type === 'mojang') {
                logger.info('Refrescando token para cuenta Mojang:', current.displayName)
                
                try {
                    // Guardar nombre anterior para detectar cambios
                    const previousName = current.displayName
                    
                    // Refrescar la sesión usando MojangRestAPI
                    const refreshResponse = await MojangRestAPI.refresh(
                        current.accessToken, 
                        current.clientToken, 
                        current.uuid, 
                        current.username
                    )
                    
                    if(refreshResponse.responseStatus === RestResponseStatus.SUCCESS) {
                        const session = refreshResponse.data
                        logger.info(`Token refrescado correctamente para ${current.displayName}`)
                        
                        // Actualizar cuenta en ConfigManager
                        ConfigManager.updateMojangAuthAccount(
                            current.clientToken, 
                            session.accessToken, 
                            session.availableProfiles, 
                            session.selectedProfile.name
                        )
                        ConfigManager.save()
                        
                        // Comprobar si el nombre ha cambiado y forzar actualización
                        if(session.selectedProfile.name !== previousName) {
                            logger.info(`Nombre actualizado: ${previousName} -> ${session.selectedProfile.name}`)
                            
                            // Obtener cuenta actualizada y forzar actualización en UI
                            const updatedAccount = ConfigManager.getSelectedAccount()
                            notifyUserDataChanged(updatedAccount)
                        }
                    } else {
                        logger.warn('Respuesta de refresco de token sin éxito:', refreshResponse.responseStatus)
                    }
                } catch(err) {
                    logger.error('Error al refrescar token:', err)
                }
            }
        } catch(err) {
            logger.warn('Error en actualización periódica de token:', err)
        }
    }, USERNAME_REFRESH_INTERVAL)
}

// Registrar el manejador de Mojang para usarlo desde la interfaz
// Esto expondrá las funciones de MojangRestAPI
window.mojangHandler = {
    uploadSkin: (accessToken, model, uuid, skinPath) => {
        return MojangRestAPI.uploadSkin(accessToken, model, uuid, skinPath)
    },
    uploadCape: (accessToken, uuid, capePath) => {
        return MojangRestAPI.uploadCape(accessToken, uuid, capePath)
    },
    deleteTexture: (accessToken, uuid, textureType) => {
        return MojangRestAPI.deleteTexture(accessToken, uuid, textureType)
    }
}

// Synchronous Listener
document.addEventListener('readystatechange', async () => {

    if (document.readyState === 'interactive' || document.readyState === 'complete'){
        if(rscShouldLoad){
            rscShouldLoad = false
            if(!fatalStartupError){
                const data = await DistroAPI.getDistribution()
                await showMainUI(data)
            } else {
                showFatalStartupError()
            }
        } 
    }

}, false)

// Actions that must be performed after the distribution index is downloaded.
ipcRenderer.on('distributionIndexDone', async (event, res) => {
    if(res) {
        const data = await DistroAPI.getDistribution()
        syncModConfigurations(data)
        ensureJavaSettings(data)
        if(document.readyState === 'interactive' || document.readyState === 'complete'){
            await showMainUI(data)
        } else {
            rscShouldLoad = true
        }
    } else {
        fatalStartupError = true
        if(document.readyState === 'interactive' || document.readyState === 'complete'){
            showFatalStartupError()
        } else {
            rscShouldLoad = true
        }
    }
})

// Util for development
async function devModeToggle() {
    DistroAPI.toggleDevMode(true)
    const data = await DistroAPI.refreshDistributionOrFallback()
    ensureJavaSettings(data)
    updateSelectedServer(data.servers[0])
    syncModConfigurations(data)
}
