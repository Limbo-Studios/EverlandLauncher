const fs             = require('fs-extra')
const isDev          = require('./isdev')
const { LoggerUtil } = require('limbo-core')
const os             = require('os')
const path           = require('path')
const app            = require('@electron/remote').app
const { v4: uuidv4 } = require('uuid');

const logger = LoggerUtil.getLogger('ConfigManager')

const sysRoot = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME)

const nameDataPath = '.everland'

const dataPath = path.join(sysRoot, nameDataPath)

const launcherDir = app.getPath('userData')

/**
 * The path to the data directory used by the application.
 * This variable can be used to retrieve or set the location
 * where the application's data files are stored.
 *
 * @type {string}
 */
exports.getNameDataPath = function(){
    return nameDataPath
}

/**
 * Retrieve the absolute path of the launcher directory.
 * 
 * @returns {string} The absolute path of the launcher directory.
 */
exports.getLauncherDirectory = function(){
    return launcherDir
}

/**
 * Get the launcher's data directory. This is where all files related
 * to game launch are installed (common, instances, java, etc).
 * 
 * @returns {string} The absolute path of the launcher's data directory.
 */
exports.getDataDirectory = function(def = false){
    return !def ? config.settings.launcher.dataDirectory : DEFAULT_CONFIG.settings.launcher.dataDirectory
}
/**
 * Reloads the account name because using a custom authserver 
 * won't do automatically the job, thanks to Ulysse2211
 * 

async function reloadUsername() {
    const authAccounts = exports.getSelectedAccount();
    const acc = authAccounts;

    if (acc && acc.type === 'mojang') {
        const gg = exports.getSelectedAccount();
        let response = await fetch(`https://minecraft.everland.lsmp.tech/api/yggdrasil/sessionserver/session/minecraft/profile/${gg['uuid']}`);
        response = await response.json();
        exports.updateMojangUserProfile(gg['clientToken'], response['name']);
        exports.save()
    }
}

/**
 * Set the new data directory.
 * 
 * @param {string} dataDirectory The new data directory.
 */
exports.setDataDirectory = function(dataDirectory){
    config.settings.launcher.dataDirectory = dataDirectory
}

const configPath = path.join(exports.getLauncherDirectory(), 'config.json')
const configPathLEGACY = path.join(dataPath, 'config.json')
const firstLaunch = !fs.existsSync(configPath) && !fs.existsSync(configPathLEGACY)

exports.getAbsoluteMinRAM = function(ram){
    if(ram?.minimum != null) {
        return ram.minimum/1024
    } else {
        // Legacy behavior
        const mem = os.totalmem()
        return mem >= (6*1073741824) ? 3 : 2
    }
}

exports.getAbsoluteMaxRAM = function(ram){
    const mem = os.totalmem()
    const gT16 = mem-(16*1073741824)
    return Math.floor((mem-(gT16 > 0 ? (Number.parseInt(gT16/8) + (16*1073741824)/4) : mem/4))/1073741824)
}

function resolveSelectedRAM(ram) {
    if(ram?.recommended != null) {
        return `${ram.recommended}M`
    } else {
        // Legacy behavior
        const mem = os.totalmem()
        return mem >= (8*1073741824) ? '4G' : (mem >= (6*1073741824) ? '3G' : '2G')
    }
}

/**
 * Three types of values:
 * Static = Explicitly declared.
 * Dynamic = Calculated by a private function.
 * Resolved = Resolved externally, defaults to null.
 */
const DEFAULT_CONFIG = {
    settings: {
        game: {
            resWidth: 1280,
            resHeight: 720,
            fullscreen: false,
            autoConnect: true,
            launchDetached: true,
            SyncLanguage: true
        },
        launcher: {
            language: 'es_mx',
            allowPrerelease: false,
            dataDirectory: dataPath
        }
    },
    newsCache: {
        date: null,
        content: null,
        dismissed: false
    },
    clientToken: null, // Not used anymore since clientToken is now stored in the authenticationDatabase and generated in each login
    selectedServer: null, // Resolved
    selectedAccount: null,
    authenticationDatabase: {},
    modConfigurations: [],
    javaConfig: {}
}

let config = null

// Persistance Utility Functions

/**
 * Save the current configuration to a file.
 */
exports.save = function(){
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'UTF-8')
}

/**
 * Load the configuration into memory. If a configuration file exists,
 * that will be read and saved. Otherwise, a default configuration will
 * be generated. Note that "resolved" values default to null and will
 * need to be externally assigned.
 */
exports.load = function(){
    let doLoad = true

    if(!fs.existsSync(configPath)){
        // Create all parent directories.
        fs.ensureDirSync(path.join(configPath, '..'))
        if(fs.existsSync(configPathLEGACY)){
            fs.moveSync(configPathLEGACY, configPath)
        } else {
            doLoad = false
            config = DEFAULT_CONFIG
            exports.save()
        }
    }
    if(doLoad){
        let doValidate = false
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'UTF-8'))
            doValidate = true
        } catch (err){
            logger.error(err)
            logger.info('Configuration file contains malformed JSON or is corrupt.')
            logger.info('Generating a new configuration file.')
            fs.ensureDirSync(path.join(configPath, '..'))
            config = DEFAULT_CONFIG
            exports.save()
        }
        if(doValidate){
            config = validateKeySet(DEFAULT_CONFIG, config)
            exports.save()
        }
    }
    logger.info('Successfully Loaded')
}

/**
 * @returns {boolean} Whether or not the manager has been loaded.
 */
exports.isLoaded = function(){
    return config != null
}

/**
 * Validate that the destination object has at least every field
 * present in the source object. Assign a default value otherwise.
 * 
 * @param {Object} srcObj The source object to reference against.
 * @param {Object} destObj The destination object.
 * @returns {Object} A validated destination object.
 */
function validateKeySet(srcObj, destObj){
    if(srcObj == null){
        srcObj = {}
    }
    const validationBlacklist = ['authenticationDatabase', 'javaConfig']
    const keys = Object.keys(srcObj)
    for(let i=0; i<keys.length; i++){
        if(typeof destObj[keys[i]] === 'undefined'){
            destObj[keys[i]] = srcObj[keys[i]]
        } else if(typeof srcObj[keys[i]] === 'object' && srcObj[keys[i]] != null && !(srcObj[keys[i]] instanceof Array) && validationBlacklist.indexOf(keys[i]) === -1){
            destObj[keys[i]] = validateKeySet(srcObj[keys[i]], destObj[keys[i]])
        }
    }
    return destObj
}

/**
 * Check to see if this is the first time the user has launched the
 * application. This is determined by the existance of the data path.
 * 
 * @returns {boolean} True if this is the first launch, otherwise false.
 */
exports.isFirstLaunch = function(){
    return firstLaunch
}

/**
 * Returns the name of the folder in the OS temp directory which we
 * will use to extract and store native dependencies for game launch.
 * 
 * @returns {string} The name of the folder.
 */
exports.getTempNativeFolder = function(){
    return 'WCNatives'
}

// System Settings (Unconfigurable on UI)

/**
 * Retrieve the news cache to determine
 * whether or not there is newer news.
 * 
 * @returns {Object} The news cache object.
 */
exports.getNewsCache = function(){
    return config.newsCache
}

/**
 * Set the new news cache object.
 * 
 * @param {Object} newsCache The new news cache object.
 */
exports.setNewsCache = function(newsCache){
    config.newsCache = newsCache
}

/**
 * Set whether or not the news has been dismissed (checked)
 * 
 * @param {boolean} dismissed Whether or not the news has been dismissed (checked).
 */
exports.setNewsCacheDismissed = function(dismissed){
    config.newsCache.dismissed = dismissed
}

/**
 * Retrieve the common directory for shared
 * game files (assets, libraries, etc).
 * 
 * @returns {string} The launcher's common directory.
 */
exports.getCommonDirectory = function(){
    return path.join(exports.getDataDirectory(), 'common')
}

/**
 * Retrieve the instance directory for the per
 * server game directories.
 * 
 * @returns {string} The launcher's instance directory.
 */
exports.getInstanceDirectory = function(){
    return path.join(exports.getDataDirectory(), 'instances')
}

/**
 * Retrieve the launcher's Client Token.
 * There is no default client token.
 * 
 * @returns {string} The launcher's Client Token.
 */
/*
exports.getClientToken = function(){
    return config.clientToken
}
*/

/**
 * Set the launcher's Client Token.
 * 
 * @param {string} clientToken The launcher's new Client Token.
 */
/*exports.setClientToken = function(clientToken){
    config.clientToken = clientToken
}*/

/**
 * Genera una UUID v4 sin guiones, añadiendo un timestamp para garantizar unicidad absoluta
 * incluso si se llama múltiples veces en milisegundos.
 * 
 * @returns {string} La UUID generada sin guiones con timestamp para unicidad.
 */
exports.generateClientToken = function() {
    // Obtenemos el timestamp actual en milisegundos para garantizar unicidad
    const timestamp = Date.now();
    // Generamos un valor aleatorio adicional (0-999) para mayor unicidad
    const random = Math.floor(Math.random() * 1000);
    // Generamos la UUID base
    const uuid = uuidv4().replace(/-/g, '');
    // Combinamos UUID con timestamp y valor aleatorio, y tomamos los primeros 32 caracteres
    // para mantener la longitud de UUID estándar sin guiones
    const uniqueToken = (uuid + timestamp + random).substring(0, 32);
    
    return uniqueToken;
}

/**
 * 
 * @param {string} PlayerMeta 
 */

/**
 * Retrieve the ID of the selected serverpack.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {string} The ID of the selected serverpack.
 */
exports.getSelectedServer = function(def = false){
    return !def ? config.selectedServer : DEFAULT_CONFIG.clientToken //HUH PARA QUE ES ESTO?
}

/**
 * Set the ID of the selected serverpack.
 * 
 * @param {string} serverID The ID of the new selected serverpack.
 */
exports.setSelectedServer = function(serverID){
    config.selectedServer = serverID
}

/**
 * Get an array of each account currently authenticated by the launcher.
 * 
 * @returns {Array.<Object>} An array of each stored authenticated account.
 */
exports.getAuthAccounts = function(){
    return config.authenticationDatabase
}

/**
 * Returns the authenticated account with the given uuid. Value may
 * be null.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @returns {Object} The authenticated account with the given uuid.
 */
exports.getAuthAccount = function(clientToken){
    return config.authenticationDatabase[clientToken]
}

/**
 * Add a new mojang auth account to the database.
 * 
 * @param {string} clientToken The mojang client token.
 * @param {string} accessToken The mojang access token.
 * @param {string} uuid The player's uuid.
 * @param {string} username The player's username.
 * @param {Array} availableProfiles Optional. Array of available profiles.
 */
exports.addMojangAuthAccount = function(clientToken, accessToken, uuid, username, availableProfiles) {
    const authAcc = {
        type: 'mojang',
        clientToken,
        accessToken,
        uuid,
        displayName: username,
        username: username,
        availableProfiles: availableProfiles || [] // Store available profiles
    }
    
    config.authenticationDatabase[uuid] = authAcc
    config.selectedAccount = uuid
}

/**
 * Update a mojang auth account.
 * 
 * @param {string} clientToken The mojang client token.
 * @param {string} accessToken The mojang access token.
 * @param {Array} availableProfiles Optional. Array of available profiles.
 * @param {string} selectedProfileName Optional. The selected profile name.
 */
exports.updateMojangAuthAccount = function(clientToken, accessToken, availableProfiles, selectedProfileName) {
    const authAcc = exports.getMojangAuthAccount(clientToken)
    if (authAcc != null) {
        authAcc.accessToken = accessToken
        if (availableProfiles) {
            authAcc.availableProfiles = availableProfiles
        }
        if (selectedProfileName) {
            authAcc.displayName = selectedProfileName
            authAcc.username = selectedProfileName
        }
    }
}

/**
 * Update the mojang account's properties.
 * 
 * @param {string} clientToken The account's client token.
 * @param {string} accessToken The account's access token.
 * @param {Array.<Object>} availableProfiles Array of available profile objects.
 * @param {string} selectedProfile New display name (username).
 */
exports.updateMojangAuthAccount = function(clientToken, accessToken, availableProfiles, selectedProfile) {
    const authAccounts = config.authenticationDatabase
    const account = authAccounts[clientToken]
    if (account != null) {
        account.accessToken = accessToken
        account.availableProfiles = availableProfiles
        if (selectedProfile) {
            account.displayName = selectedProfile
        }
    }
}

/**
 * Update the username of an authenticated mojang account.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @param {string} accessToken The new Access Token.
 * 
 * @returns {Object} The authenticated account object created by this action.
 */

exports.updateMojangUserProfile = function(clientToken, username){
    config.authenticationDatabase[clientToken].username = username
    config.authenticationDatabase[clientToken].displayName = username
    return config.authenticationDatabase[clientToken]
}

/**
 * Adds an authenticated mojang account to the database to be stored.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @param {string} accessToken The accessToken of the authenticated account.
 * @param {string} username The username (usually email) of the authenticated account.
 * @param {string} displayName The in game name of the authenticated account.
 * 
 * @returns {Object} The authenticated account object created by this action.
 */
exports.addMojangAuthAccount = function(uuid, accountID, accessToken, clientToken, username, displayName, availableProfiles){
    config.selectedAccount = clientToken
    config.authenticationDatabase[clientToken] = {
        type: 'mojang',
        accessToken,
        clientToken,
        accountID,
        username: username.trim(),
        uuid: uuid.trim(),
        availableProfiles,
        displayName: displayName.trim()
    }
    return config.authenticationDatabase[clientToken]
}

exports.addTempMojangAuthAccount = function(accountID, accessToken, clientToken, availableProfiles){
    config.selectedAccount = clientToken
    config.authenticationDatabase[clientToken] = {
        type: 'mojang',
        accessToken,
        clientToken,
        accountID,
        availableProfiles
    }
    return config.authenticationDatabase[clientToken]
}

/**
 * Update the tokens of an authenticated microsoft account.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @param {string} accessToken The new Access Token.
 * @param {string} msAccessToken The new Microsoft Access Token
 * @param {string} msRefreshToken The new Microsoft Refresh Token
 * @param {date} msExpires The date when the microsoft access token expires
 * @param {date} mcExpires The date when the mojang access token expires
 * 
 * @returns {Object} The authenticated account object created by this action.
 */
exports.updateMicrosoftAuthAccount = function(uuid, accessToken, msAccessToken, msRefreshToken, msExpires, mcExpires) {
    config.authenticationDatabase[uuid].accessToken = accessToken
    config.authenticationDatabase[uuid].expiresAt = mcExpires
    config.authenticationDatabase[uuid].microsoft.access_token = msAccessToken
    config.authenticationDatabase[uuid].microsoft.refresh_token = msRefreshToken
    config.authenticationDatabase[uuid].microsoft.expires_at = msExpires
    return config.authenticationDatabase[uuid]
}

/**
 * Adds an authenticated microsoft account to the database to be stored.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * @param {string} accessToken The accessToken of the authenticated account.
 * @param {string} name The in game name of the authenticated account.
 * @param {date} mcExpires The date when the mojang access token expires
 * @param {string} msAccessToken The microsoft access token
 * @param {string} msRefreshToken The microsoft refresh token
 * @param {date} msExpires The date when the microsoft access token expires
 * 
 * @returns {Object} The authenticated account object created by this action.
 */
exports.addMicrosoftAuthAccount = function(uuid, accessToken, name, mcExpires, msAccessToken, msRefreshToken, msExpires) {
    config.selectedAccount = uuid
    config.authenticationDatabase[uuid] = {
        type: 'microsoft',
        accessToken,
        username: name.trim(),
        uuid: uuid.trim(),
        displayName: name.trim(),
        expiresAt: mcExpires,
        microsoft: {
            access_token: msAccessToken,
            refresh_token: msRefreshToken,
            expires_at: msExpires
        }
    }
    return config.authenticationDatabase[uuid]
}

/**
 * Remove an authenticated account from the database. If the account
 * was also the selected account, a new one will be selected. If there
 * are no accounts, the selected account will be null.
 * 
 * @param {string} uuid The uuid of the authenticated account.
 * 
 * @returns {boolean} True if the account was removed, false if it never existed.
 */
exports.removeAuthAccount = function(clientToken){
    if(config.authenticationDatabase[clientToken] != null){
        delete config.authenticationDatabase[clientToken]
        if(config.selectedAccount === clientToken){
            const keys = Object.keys(config.authenticationDatabase)
            if(keys.length > 0){
                config.selectedAccount = keys[0]
            } else {
                config.selectedAccount = null
            }
        }
        return true
    }
    return false
}

/**
 * Get the currently selected authenticated account.
 * 
 * @returns {Object} The selected authenticated account.
 */
exports.getSelectedAccount = function(){
    return config.authenticationDatabase[config.selectedAccount]
}

/**
 * Set the selected authenticated account.
 * 
 * @param {string} uuid The UUID of the account which is to be set
 * as the selected account.
 * 
 * @returns {Object} The selected authenticated account.
 */
exports.setSelectedAccount = function(clientToken){
    const authAcc = config.authenticationDatabase[clientToken]
    if(authAcc != null) {
        config.selectedAccount = clientToken
    }
//    reloadUsername()

    return authAcc
}

/**
 * Get an array of each mod configuration currently stored.
 * 
 * @returns {Array.<Object>} An array of each stored mod configuration.
 */
exports.getModConfigurations = function(){
    return config.modConfigurations
}

/**
 * Set the array of stored mod configurations.
 * 
 * @param {Array.<Object>} configurations An array of mod configurations.
 */
exports.setModConfigurations = function(configurations){
    config.modConfigurations = configurations
}

/**
 * Get the mod configuration for a specific server.
 * 
 * @param {string} serverid The id of the server.
 * @returns {Object} The mod configuration for the given server.
 */
exports.getModConfiguration = function(serverid){
    const cfgs = config.modConfigurations
    for(let i=0; i<cfgs.length; i++){
        if(cfgs[i].id === serverid){
            return cfgs[i]
        }
    }
    return null
}

/**
 * Set the mod configuration for a specific server. This overrides any existing value.
 * 
 * @param {string} serverid The id of the server for the given mod configuration.
 * @param {Object} configuration The mod configuration for the given server.
 */
exports.setModConfiguration = function(serverid, configuration){
    const cfgs = config.modConfigurations
    for(let i=0; i<cfgs.length; i++){
        if(cfgs[i].id === serverid){
            cfgs[i] = configuration
            return
        }
    }
    cfgs.push(configuration)
}

// User Configurable Settings

// Java Settings

function defaultJavaConfig(effectiveJavaOptions, ram) {
    if(effectiveJavaOptions.suggestedMajor > 8) {
        return defaultJavaConfig17(ram)
    } else {
        return defaultJavaConfig8(ram)
    }
}

function defaultJavaConfig8(ram) {
    return {
        minRAM: resolveSelectedRAM(ram),
        maxRAM: resolveSelectedRAM(ram),
        executable: null,
        jvmOptions: [
            '-XX:+UseConcMarkSweepGC',
            '-XX:+CMSIncrementalMode',
            '-XX:-UseAdaptiveSizePolicy',
            '-Xmn128M'
        ],
    }
}

function defaultJavaConfig17(ram) {
    return {
        minRAM: resolveSelectedRAM(ram),
        maxRAM: resolveSelectedRAM(ram),
        executable: null,
        jvmOptions: [
            '-XX:+UnlockExperimentalVMOptions',
            '-XX:+UseG1GC',
            '-XX:G1NewSizePercent=20',
            '-XX:G1ReservePercent=20',
            '-XX:MaxGCPauseMillis=50',
            '-XX:G1HeapRegionSize=32M'
        ],
    }
}

/**
 * Ensure a java config property is set for the given server.
 * 
 * @param {string} serverid The server id.
 * @param {*} mcVersion The minecraft version of the server.
 */
exports.ensureJavaConfig = function(serverid, effectiveJavaOptions, ram) {
    if(!Object.prototype.hasOwnProperty.call(config.javaConfig, serverid)) {
        config.javaConfig[serverid] = defaultJavaConfig(effectiveJavaOptions, ram)
    }
}

/**
 * Retrieve the minimum amount of memory for JVM initialization. This value
 * contains the units of memory. For example, '5G' = 5 GigaBytes, '1024M' = 
 * 1024 MegaBytes, etc.
 * 
 * @param {string} serverid The server id.
 * @returns {string} The minimum amount of memory for JVM initialization.
 */
exports.getMinRAM = function(serverid){
    return config.javaConfig[serverid].minRAM
}

/**
 * Set the minimum amount of memory for JVM initialization. This value should
 * contain the units of memory. For example, '5G' = 5 GigaBytes, '1024M' = 
 * 1024 MegaBytes, etc.
 * 
 * @param {string} serverid The server id.
 * @param {string} minRAM The new minimum amount of memory for JVM initialization.
 */
exports.setMinRAM = function(serverid, minRAM){
    config.javaConfig[serverid].minRAM = minRAM
}

/**
 * Retrieve the maximum amount of memory for JVM initialization. This value
 * contains the units of memory. For example, '5G' = 5 GigaBytes, '1024M' = 
 * 1024 MegaBytes, etc.
 * 
 * @param {string} serverid The server id.
 * @returns {string} The maximum amount of memory for JVM initialization.
 */
exports.getMaxRAM = function(serverid){
    return config.javaConfig[serverid].maxRAM
}

/**
 * Set the maximum amount of memory for JVM initialization. This value should
 * contain the units of memory. For example, '5G' = 5 GigaBytes, '1024M' = 
 * 1024 MegaBytes, etc.
 * 
 * @param {string} serverid The server id.
 * @param {string} maxRAM The new maximum amount of memory for JVM initialization.
 */
exports.setMaxRAM = function(serverid, maxRAM){
    config.javaConfig[serverid].maxRAM = maxRAM
}

/**
 * Retrieve the path of the Java Executable.
 * 
 * This is a resolved configuration value and defaults to null until externally assigned.
 * 
 * @param {string} serverid The server id.
 * @returns {string} The path of the Java Executable.
 */
exports.getJavaExecutable = function(serverid){
    return config.javaConfig[serverid].executable
}

/**
 * Set the path of the Java Executable.
 * 
 * @param {string} serverid The server id.
 * @param {string} executable The new path of the Java Executable.
 */
exports.setJavaExecutable = function(serverid, executable){
    config.javaConfig[serverid].executable = executable
}

/**
 * Retrieve the additional arguments for JVM initialization. Required arguments,
 * such as memory allocation, will be dynamically resolved and will not be included
 * in this value.
 * 
 * @param {string} serverid The server id.
 * @returns {Array.<string>} An array of the additional arguments for JVM initialization.
 */
exports.getJVMOptions = function(serverid){
    return config.javaConfig[serverid].jvmOptions
}

/**
 * Set the additional arguments for JVM initialization. Required arguments,
 * such as memory allocation, will be dynamically resolved and should not be
 * included in this value.
 * 
 * @param {string} serverid The server id.
 * @param {Array.<string>} jvmOptions An array of the new additional arguments for JVM 
 * initialization.
 */
exports.setJVMOptions = function(serverid, jvmOptions){
    config.javaConfig[serverid].jvmOptions = jvmOptions
}


// Game Settings

/**
 * Retrieve the width of the game window.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {number} The width of the game window.
 */
exports.getGameWidth = function(def = false){
    return !def ? config.settings.game.resWidth : DEFAULT_CONFIG.settings.game.resWidth
}

/**
 * Set the width of the game window.
 * 
 * @param {number} resWidth The new width of the game window.
 */
exports.setGameWidth = function(resWidth){
    config.settings.game.resWidth = Number.parseInt(resWidth)
}

/**
 * Validate a potential new width value.
 * 
 * @param {number} resWidth The width value to validate.
 * @returns {boolean} Whether or not the value is valid.
 */
exports.validateGameWidth = function(resWidth){
    const nVal = Number.parseInt(resWidth)
    return Number.isInteger(nVal) && nVal >= 0
}

/**
 * Retrieve the height of the game window.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {number} The height of the game window.
 */
exports.getGameHeight = function(def = false){
    return !def ? config.settings.game.resHeight : DEFAULT_CONFIG.settings.game.resHeight
}

/**
 * Set the height of the game window.
 * 
 * @param {number} resHeight The new height of the game window.
 */
exports.setGameHeight = function(resHeight){
    config.settings.game.resHeight = Number.parseInt(resHeight)
}

/**
 * Validate a potential new height value.
 * 
 * @param {number} resHeight The height value to validate.
 * @returns {boolean} Whether or not the value is valid.
 */
exports.validateGameHeight = function(resHeight){
    const nVal = Number.parseInt(resHeight)
    return Number.isInteger(nVal) && nVal >= 0
}

/**
 * Check if the game should be launched in fullscreen mode.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not the game is set to launch in fullscreen mode.
 */
exports.getFullscreen = function(def = false){
    return !def ? config.settings.game.fullscreen : DEFAULT_CONFIG.settings.game.fullscreen
}

/**
 * Change the status of if the game should be launched in fullscreen mode.
 * 
 * @param {boolean} fullscreen Whether or not the game should launch in fullscreen mode.
 */
exports.setFullscreen = function(fullscreen){
    config.settings.game.fullscreen = fullscreen
}

/**
 * Check if the game should auto connect to servers.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not the game should auto connect to servers.
 */
exports.getAutoConnect = function(def = false){
    return !def ? config.settings.game.autoConnect : DEFAULT_CONFIG.settings.game.autoConnect
}

/**
 * Change the status of whether or not the game should auto connect to servers.
 * 
 * @param {boolean} autoConnect Whether or not the game should auto connect to servers.
 */
exports.setAutoConnect = function(autoConnect){
    config.settings.game.autoConnect = autoConnect
}

/**
 * Check if the game should launch as a detached process.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not the game will launch as a detached process.
 */
exports.getLaunchDetached = function(def = false){
    return !def ? config.settings.game.launchDetached : DEFAULT_CONFIG.settings.game.launchDetached
}

/**
 * Change the status of whether or not the game should launch as a detached process.
 * 
 * @param {boolean} launchDetached Whether or not the game should launch as a detached process.
 */
exports.setLaunchDetached = function(launchDetached){
    config.settings.game.launchDetached = launchDetached
}

// Launcher Settings

/**
 * Check if the launcher should download prerelease versions.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not the launcher should download prerelease versions.
 */
exports.getAllowPrerelease = function(def = false){
    return !def ? config.settings.launcher.allowPrerelease : DEFAULT_CONFIG.settings.launcher.allowPrerelease
}

/**
 * Change the status of Whether or not the launcher should download prerelease versions.
 * 
 * @param {boolean} launchDetached Whether or not the launcher should download prerelease versions.
 */
exports.setAllowPrerelease = function(allowPrerelease){
    config.settings.launcher.allowPrerelease = allowPrerelease
}

exports.getCurrentLanguage = function(def = false){
    return !def ? config.settings.launcher.language : DEFAULT_CONFIG.settings.launcher.language
}

/**
 * Convert the language code to lowercase for the launcher and game language sync.
 */
exports.getCurrentLanguageLowercase = function(def = false) {
    const language = !def ? config.settings.launcher.language : DEFAULT_CONFIG.settings.launcher.language
    return language.toLowerCase()
}

/**
 * Change the status of if the game should be launched in fullscreen mode.
 * 
 * @param {boolean} SyncLanguage Whether or not the game should launch in fullscreen mode.
 */
exports.setSyncLanguage = function(SyncLanguage){
    config.settings.game.SyncLanguage = SyncLanguage
}

/**
 * Check if the game should auto connect to servers.
 * 
 * @param {boolean} def Optional. If true, the default value will be returned.
 * @returns {boolean} Whether or not the game should auto connect to servers.
 */
exports.getSyncLanguage = function(def = false){
    return !def ? config.settings.game.SyncLanguage : DEFAULT_CONFIG.settings.game.SyncLanguage
}

/**
 * Change the current language
 * 
 * @param {boolean} lang The language that should be selected
 */
exports.setLanguage = function(lang){
    config.settings.launcher.language = lang
    exports.save()
    app.relaunch()
    app.quit()
}

// This exports the reloadUsername function for use in preloader

//exports.reloadUsername = reloadUsername

/**
 * Get the list of all available languages
 * 
 * @param {function} callback
 */
exports.getAllLanguages = function(callback) {
    if(isDev){
        fs.readdir(path.join(process.cwd(), 'lang'), (err, files) => {
            if (err) {
                callback(err)
            } else {
                const fileNames = files.map(file => file.replace('.toml', ''))
                callback(null, fileNames)
            }
        })
    } else {
    if(process.platform === 'darwin'){
    fs.readdir(path.join(process.cwd(), 'Content', 'Resources', 'lang'), (err, files) => {
        if (err) {
            callback(err)
        } else {
            const fileNames = files.map(file => file.replace('.toml', ''))
            callback(null, fileNames)
        }
    })
    } else {
    fs.readdir(path.join(process.cwd(), 'Resources', 'lang'), (err, files) => {
        if (err) {
            callback(err)
        } else {
            const fileNames = files.map(file => file.replace('.toml', ''))
            callback(null, fileNames)
        }
    })
    }}
}
