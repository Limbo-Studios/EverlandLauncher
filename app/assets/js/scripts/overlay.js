/**
 * Script for overlay.ejs
 */

/* Overlay Wrapper Functions */

/**
 * Check to see if the overlay is visible.
 * 
 * @returns {boolean} Whether or not the overlay is visible.
 */
function isOverlayVisible(){
    return document.getElementById('main').hasAttribute('overlay')
}

let overlayHandlerContent

let overlayContainer = document.getElementById('overlayContainer')
let accountSelectContent = document.getElementById('accountSelectContent')

/**
 * Overlay keydown handler for a non-dismissable overlay.
 * 
 * @param {KeyboardEvent} e The keydown event.
 */
function overlayKeyHandler (e){
    if(e.key === 'Enter' || e.key === 'Escape'){
        if (overlayContainer.hasAttribute('popup')) {
            toggleOverlay(false)
        } else {
            document.getElementById(overlayHandlerContent).getElementsByClassName('overlayKeybindEnter')[0].click()
        }
    }
}
/**
 * Overlay keydown handler for a dismissable overlay.
 * 
 * @param {KeyboardEvent} e The keydown event.
 */
function overlayKeyDismissableHandler (e){
    if(e.key === 'Enter'){
        document.getElementById(overlayHandlerContent).getElementsByClassName('overlayKeybindEnter')[0].click()
    } else if(e.key === 'Escape'){
        document.getElementById(overlayHandlerContent).getElementsByClassName('overlayKeybindEsc')[0].click()
    }
}

/**
 * Bind overlay keydown listeners for escape and exit.
 * 
 * @param {boolean} state Whether or not to add new event listeners.
 * @param {string} content The overlay content which will be shown.
 * @param {boolean} dismissable Whether or not the overlay is dismissable 
 */
function bindOverlayKeys(state, content, dismissable){
    overlayHandlerContent = content
    document.removeEventListener('keydown', overlayKeyHandler)
    document.removeEventListener('keydown', overlayKeyDismissableHandler)
    if(state){
        if(dismissable){
            document.addEventListener('keydown', overlayKeyDismissableHandler)
        } else {
            document.addEventListener('keydown', overlayKeyHandler)
        }
    }
}

/**
 * Toggle the visibility of the overlay.
 * 
 * @param {boolean} toggleState True to display, false to hide.
 * @param {boolean} dismissable Optional. True to show the dismiss option, otherwise false.
 * @param {string} content Optional. The content div to be shown.
 * @param {boolean} popup Optional. True to show the overlay as a popup that is easily dismissable and interactible.
 */
function toggleOverlay(toggleState, dismissable = false, content = 'overlayContent', popup = false){
    if(toggleState == null){
        toggleState = !document.getElementById('main').hasAttribute('overlay')
    }
    if(typeof dismissable === 'string'){
        content = dismissable
        dismissable = false
    }
    bindOverlayKeys(toggleState, content, dismissable)
    if(toggleState){
        document.getElementById('main').setAttribute('overlay', true)
        overlayContainer.setAttribute('content', content)
        overlayContainer.setAttribute('popup', popup)

        // Make things untabbable.
        $('#main *').attr('tabindex', '-1')
        
        // Primero ocultar TODOS los contenidos posibles
        $('#overlayContainer > div').hide()
        
        // Luego mostrar SOLO el contenido específico solicitado
        $('#' + content).show()
        
        if(dismissable){
            $('#overlayDismiss').show()
        } else {
            $('#overlayDismiss').hide()
        }
        
        $('#overlayContainer').fadeIn({
            duration: 250,
            start: () => {
                if(getCurrentView() === VIEWS.settings){
                    document.getElementById('settingsContainer').style.backgroundColor = 'transparent'
                }
            }
        })
    } else {
        document.getElementById('main').removeAttribute('overlay')
        overlayContainer.removeAttribute('content')
        overlayContainer.removeAttribute('popup')

        // Make things tabbable.
        $('#main *').removeAttr('tabindex')
        
        $('#overlayContainer').fadeOut({
            duration: 250,
            start: () => {
                if(getCurrentView() === VIEWS.settings){
                    document.getElementById('settingsContainer').style.backgroundColor = 'rgba(0, 0, 0, 0.50)'
                }
            },
            complete: () => {
                // Ocultar todos los contenidos al cerrar el overlay
                $('#overlayContainer > div').hide()
                // Mostrar el contenido por defecto para la próxima vez
                $('#overlayContent').show()
            }
        })
    }
}

async function toggleServerSelection(toggleState){
    await prepareServerSelectionList()
    toggleOverlay(toggleState, false, 'serverSelectContent', true)
}

async function toggleAccountSelection(toggleState, popup = false){    
    // Verificar si hay cuentas disponibles
    const authAccounts = ConfigManager.getAuthAccounts()
    const authKeys = Object.keys(authAccounts)
    
    // Si no hay cuentas disponibles, no mostrar el overlay
    if(authKeys.length === 0 && toggleState === true){
        // Si estamos intentando mostrar el overlay y no hay cuentas, redirigir a la pantalla de inicio de sesión
        loginOptionsCancelEnabled(false)
        loginOptionsViewOnLoginSuccess = VIEWS.settings
        loginOptionsViewOnLoginCancel = VIEWS.login
        switchView(getCurrentView(), VIEWS.login)
        return
    }
    
    // Si solo hay una cuenta y estamos tratando de mostrar el overlay (no en modo popup)
    if(authKeys.length === 1 && !popup && toggleState === true){
        // Simplemente seleccionar la única cuenta disponible sin mostrar el overlay
        const account = authAccounts[authKeys[0]]
        ConfigManager.setSelectedAccount(account.clientToken)
        ConfigManager.save()
        updateSelectedAccount(account)
        validateSelectedAccount()
        return
    }
    
    if (popup) {
        // set the accountSelectActions div to display: none to avoid colliding with the validateSelectedAccount function
        document.getElementById('accountSelectActions').style.display = 'none'
    } else {
        // set the overlayContainer div to display: block, this is not done while closing the overlay because of the fadeOut effect
        document.getElementById('accountSelectActions').style.display = 'block'
    }

    // show the overlay
    await prepareAccountSelectionList()
    toggleOverlay(toggleState, false, 'accountSelectContent', popup)
}

async function toggleProfileSwitch(toggleState, popup = false){    
    // Verificar si hay cuentas disponibles en la cuenta actual
    const account = ConfigManager.getSelectedAccount()
    
    // Si no hay cuenta seleccionada o no tiene perfiles disponibles, no mostrar el overlay
    if(!account || !account.availableProfiles || account.availableProfiles.length === 0){
        console.warn('No hay perfiles disponibles para cambiar')
        return
    }
    
    if (popup) {
        // set the accountSelectActions div to display: none to avoid colliding with the validateSelectedAccount function
        document.getElementById('accountSelectActions').style.display = 'none'
    } else {
        // set the overlayContainer div to display: block, this is not done while closing the overlay because of the fadeOut effect
        document.getElementById('accountSelectActions').style.display = 'block'
    }

    // show the overlay
    await prepareProfilesList()
    toggleOverlay(toggleState, false, 'accountSelectContent', popup)
}

/**
 * Toggle the profile selection overlay.
 * 
 * @param {boolean} toggleState True to display, false to hide.
 * @param {Object} authData Authentication data containing availableProfiles.
 * @param {function} acceptCallback Callback function to invoke when a profile is selected.
 * @param {function} cancelCallback Callback function to invoke when profile selection is cancelled.
 */
async function toggleProfileSelection(toggleState, authData, acceptCallback, cancelCallback) {
    // Preparar el contenido de selección de perfil
    prepareProfileSelectionList(authData, acceptCallback, cancelCallback);
    // Usar la función principal de overlay con el contenido correcto
    toggleOverlay(toggleState, false, 'profileSelectContent', true);
}

/**
 * Set the content of the overlay.
 * 
 * @param {string} title Overlay title text.
 * @param {string} description Overlay description text.
 * @param {string} acknowledge Acknowledge button text.
 * @param {string} dismiss Dismiss button text.
 */
function setOverlayContent(title, description, acknowledge, dismiss = Lang.queryJS('overlay.dismiss')){
    document.getElementById('overlayTitle').innerHTML = title
    document.getElementById('overlayDesc').innerHTML = description
    document.getElementById('overlayAcknowledge').innerHTML = acknowledge
    document.getElementById('overlayDismiss').innerHTML = dismiss
}

/**
 * Set the onclick handler of the overlay acknowledge button.
 * If the handler is null, a default handler will be added.
 * 
 * @param {function} handler 
 */
function setOverlayHandler(handler){
    if(handler == null){
        document.getElementById('overlayAcknowledge').onclick = () => {
            toggleOverlay(false)
        }
    } else {
        document.getElementById('overlayAcknowledge').onclick = handler
    }
}

/**
 * Set the onclick handler of the overlay dismiss button.
 * If the handler is null, a default handler will be added.
 * 
 * @param {function} handler 
 */
function setDismissHandler(handler){
    if(handler == null){
        document.getElementById('overlayDismiss').onclick = () => {
            toggleOverlay(false)
        }
    } else {
        document.getElementById('overlayDismiss').onclick = handler
    }
}

/* Account Select button */

// Bind account select confirm button.
document.getElementById('accountSelectConfirm').addEventListener('click', async () => {
    const listings = document.getElementsByClassName('accountListing')
    for(let i=0; i<listings.length; i++){
        if(listings[i].hasAttribute('selected')){
            const authAcc = ConfigManager.setSelectedAccount(listings[i].getAttribute('clientToken'))
            ConfigManager.save()
            updateSelectedAccount(authAcc)
            if(getCurrentView() === VIEWS.settings) {
                await prepareSettings()
            }
            toggleOverlay(false)
            validateSelectedAccount()
            return
        }
    }
    // None are selected? Not possible right? Meh, handle it.
    if(listings.length > 0){
        const authAcc = ConfigManager.setSelectedAccount(listings[0].getAttribute('clientToken'))
        ConfigManager.save()
        updateSelectedAccount(authAcc)
        if(getCurrentView() === VIEWS.settings) {
            await prepareSettings()
        }
        toggleOverlay(false)
        validateSelectedAccount()
    }
})

// Bind account select cancel button.
document.getElementById('accountSelectCancel').addEventListener('click', () => {
    $('#accountSelectContent').fadeOut(250, () => {
        $('#overlayContent').fadeIn(250)
    })
})

// Bind account select manage button.
document.getElementById('accountSelectManage').addEventListener('click', async () => {
    await prepareSettings()
    switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
        settingsNavItemListener(document.getElementById('settingsNavAccount'), false)
    })
    toggleOverlay(false)
})

// Make the Server Selection background clickable to close the overlay.
overlayContainer.addEventListener('click', async (e) => {
    if (e.target === overlayContainer && overlayContainer.getAttribute('content') === 'profileSelectContent') {
        // Si es el overlay de selección de perfil, invalidar el token
        const accessToken = overlayContainer.getAttribute('data-auth-access-token')
        const clientToken = overlayContainer.getAttribute('data-auth-client-token')
        
        if (accessToken && clientToken) {
            const invalidateResult = await AuthManager.invalidateMojangToken(
                accessToken, 
                clientToken, 
                'unused'
            )
            console.log(`Token invalidation on overlay click: ${invalidateResult ? 'Successful' : 'Failed'}`)
            
            // Limpiar los atributos de datos
            overlayContainer.removeAttribute('data-auth-access-token')
            overlayContainer.removeAttribute('data-auth-client-token')
        }
        
        // Cerrar el overlay como normalmente lo haría
        toggleOverlay(false)
    } else if (e.target === overlayContainer) {
        // Para otros tipos de overlay, comportamiento normal
        toggleOverlay(false)
    }
})

async function setServerListingHandlers(){
    const listings = Array.from(document.getElementsByClassName('serverListing'))
    listings.map(async (val) => {
        val.onclick = async e => {
            const serv = (await DistroAPI.getDistribution()).getServerById(val.getAttribute('servid'))
            updateSelectedServer(serv)
            refreshServerStatus(true)
            toggleOverlay(false)
        }
    })
}

async function setAccountListingHandlers(){
    const listings = Array.from(document.getElementsByClassName('accountListing'))
    listings.map(async (val) => {
        val.onclick = async e => {
            // popup mode
            if(overlayContainer.hasAttribute('popup')){
                const authAcc = ConfigManager.setSelectedAccount(val.getAttribute('clientToken'))
                ConfigManager.save()
                updateSelectedAccount(authAcc)
                if(getCurrentView() === VIEWS.settings) {
                    await prepareSettings()
                }
                toggleOverlay(false)
                validateSelectedAccount()
                return    
            } else {
                if(val.hasAttribute('selected')){
                    return
                }
                const cListings = document.getElementsByClassName('accountListing')
                for(let i=0; i<cListings.length; i++){
                    if(cListings[i].hasAttribute('selected')){
                        cListings[i].removeAttribute('selected')
                    }
                }
                val.setAttribute('selected', '')
                document.activeElement.blur()
            }
        }
    })
}

async function populateServerListings(){
    const distro = await DistroAPI.getDistribution()
    const giaSel = ConfigManager.getSelectedServer()
    const servers = distro.servers
    let htmlString = ''
    for(const serv of servers){
        htmlString += `<button class="serverListing" servid="${serv.rawServer.id}" ${serv.rawServer.id === giaSel ? 'selected' : ''}>
            <img class="serverListingImg" src="${serv.rawServer.icon}"/>
            <div class="serverListingDetails">
                <span class="serverListingName">${serv.rawServer.name}</span>
                <span class="serverListingDescription">${serv.rawServer.description}</span>
                <div class="serverListingInfo">
                    <div class="serverListingVersion">${serv.rawServer.minecraftVersion}</div>
                    <div class="serverListingRevision">${serv.rawServer.version}</div>
                    ${serv.rawServer.mainServer ? `<div class="serverListingStarWrapper">
                        <svg id="Layer_1" viewBox="0 0 107.45 104.74" width="20px" height="20px">
                            <defs>
                                <style>.cls-1{fill:#fff;}.cls-2{fill:none;stroke:#fff;stroke-miterlimit:10;}</style>
                            </defs>
                            <path class="cls-1" d="M100.93,65.54C89,62,68.18,55.65,63.54,52.13c2.7-5.23,18.8-19.2,28-27.55C81.36,31.74,63.74,43.87,58.09,45.3c-2.41-5.37-3.61-26.52-4.37-39-.77,12.46-2,33.64-4.36,39-5.7-1.46-23.3-13.57-33.49-20.72,9.26,8.37,25.39,22.36,28,27.55C39.21,55.68,18.47,62,6.52,65.55c12.32-2,33.63-6.06,39.34-4.9-.16,5.87-8.41,26.16-13.11,37.69,6.1-10.89,16.52-30.16,21-33.9,4.5,3.79,14.93,23.09,21,34C70,86.84,61.73,66.48,61.59,60.65,67.36,59.49,88.64,63.52,100.93,65.54Z"/>
                            <circle class="cls-2" cx="53.73" cy="53.9" r="38"/>
                        </svg>
                        <span class="serverListingStarTooltip">${Lang.queryJS('settings.serverListing.mainServer')}</span>
                    </div>` : ''}
                </div>
            </div>
        </button>`
    }
    document.getElementById('serverSelectListScrollable').innerHTML = htmlString

}

function populateAccountListings(){
    const authAccounts = ConfigManager.getAuthAccounts()
    const authKeys = Object.keys(authAccounts)
    if(authKeys.length === 0){
        return
    }

    let microsoftAuthAccountStr = ''
    let mojangAuthAccountStr = ''

    authKeys.forEach((val) => {
        const acc = authAccounts[val]

        const mojang = `<button class="accountListing" uuid="${acc.uuid}" clientToken="${acc.clientToken}" ${!val && !overlayContainer.hasAttribute("popup") ? 'selected' : ''}>
        <img src="https://nmsr.everland.lsmp.tech/face/${acc.uuid}?width=45">
        <div class="accountListingName">${acc.displayName}</div>
    </button>`

        const microsoft = `<button class="accountListing" uuid="${acc.uuid}" ${!val && !overlayContainer.hasAttribute("popup") ? 'selected' : ''}>
        <img src="https://nmsr.everland.lsmp.tech/face/${acc.uuid}?width=45">
        <div class="accountListingName">${acc.displayName}</div>
    </button>`

        if(acc.type === 'microsoft') {
            microsoftAuthAccountStr += microsoft
        } else {
            mojangAuthAccountStr += mojang
        }

    })

    microsoftAccountSelectListScrollable.innerHTML = microsoftAuthAccountStr
    mojangAccountSelectListScrollable.innerHTML = mojangAuthAccountStr
}

function populateProfilesListing() {
    const accountProfileList = ConfigManager.getSelectedAccount();
    const availableProfiles = accountProfileList.availableProfiles;

    console.log("Auth Accounts:", accountProfileList);
    console.log("Available Profiles:", availableProfiles);

    let mojangAuthAccountStr = '';

    // Itera directamente sobre los perfiles en availableProfiles
    availableProfiles.forEach((profile) => {
        const mojang = `<button class="accountListing" uuid="${profile.id}" ${!overlayContainer.hasAttribute("popup") ? 'selected' : ''}>
            <img src="https://nmsr.everland.lsmp.tech/face/${profile.id}?width=45">
            <div class="accountListingName">${profile.name}</div>
        </button>`;

        mojangAuthAccountStr += mojang;
    });

    mojangAccountSelectListScrollable.innerHTML = mojangAuthAccountStr;
}

async function prepareServerSelectionList(){
    await populateServerListings()
    await setServerListingHandlers()
}

async function prepareAccountSelectionList(){
    populateAccountListings()
    await setAccountListingHandlers()
}

async function prepareProfilesList(){
    populateProfilesListing()
    await setAccountListingHandlers()
}

/**
 * Prepare the profile selection overlay.
 * 
 * @param {Object} authData Authentication data containing availableProfiles.
 * @param {function} acceptCallback Callback function to invoke when a profile is selected.
 * @param {function} cancelCallback Callback function to invoke when profile selection is cancelled.
 */
function prepareProfileSelectionList(authData, acceptCallback, cancelCallback) {
    const profileListScrollable = document.getElementById('profileSelectListScrollable')
    profileListScrollable.innerHTML = ''
    
    // No profiles available, show error
    if (!authData || !authData.availableProfiles || authData.availableProfiles.length === 0) {
        const profileListing = document.createElement('div')
        profileListing.className = 'profileListing'
        profileListing.innerHTML = '<span class="profileListingName avenir-medium">No hay perfiles disponibles</span>'
        profileListScrollable.append(profileListing)
        
        document.getElementById('profileSelectConfirm').disabled = true
        
        // Set cancel handler
        document.getElementById('profileSelectCancel').onclick = async () => {
            // Invalidate token
            if (authData && authData.accessToken && authData.clientToken) {
                const invalidateResult = await AuthManager.invalidateMojangToken(authData.accessToken, authData.clientToken, 'user_cancelled')
                console.log(`Token invalidation on cancel with no profiles: ${invalidateResult ? 'Successful' : 'Failed'}`)
            }
            
            if (cancelCallback) cancelCallback()
            toggleOverlay(false)
        }
        
        return
    }

    // Build profile list
    let selectedUuid = null
    
    for (const profile of authData.availableProfiles) {
        const profileListing = document.createElement('div')
        profileListing.className = 'profileListing'
        profileListing.setAttribute('uuid', profile.id)
        
        // Crear el elemento de avatar
        const avatarDiv = document.createElement('div')
        avatarDiv.className = 'profileAvatar'
        
        // Usar la URL de la API de avatares
        const avatarUrl = `https://nmsr.everland.lsmp.tech/face/${profile.id}?width=45`
        avatarDiv.style.backgroundImage = `url('${avatarUrl}')`
        
        // Crear el contenedor de detalles
        const detailsDiv = document.createElement('div')
        detailsDiv.className = 'profileListingDetails'
        
        // Nombre del perfil
        const nameSpan = document.createElement('span')
        nameSpan.className = 'profileListingName avenir-medium'
        nameSpan.textContent = profile.name
        
        // Agregar elementos al contenedor de detalles
        detailsDiv.appendChild(nameSpan)
        
        // Limpiar el contenido anterior y agregar los nuevos elementos
        profileListing.innerHTML = ''
        profileListing.appendChild(avatarDiv)
        profileListing.appendChild(detailsDiv)
        
        profileListing.addEventListener('click', () => {
            if (selectedUuid === profile.id) {
                return
            }
            
            if (selectedUuid != null) {
                document.querySelectorAll('.profileListing[selected]').forEach(el => {
                    el.removeAttribute('selected')
                })
            }
            
            selectedUuid = profile.id
            profileListing.setAttribute('selected', '')
            document.getElementById('profileSelectConfirm').disabled = false
        })
        
        profileListScrollable.append(profileListing)
    }
    
    // Set handlers for the buttons
    document.getElementById('profileSelectConfirm').disabled = true
    document.getElementById('profileSelectConfirm').onclick = () => {
        if (selectedUuid != null) {
            const selectedProfile = authData.availableProfiles.find(p => p.id === selectedUuid)
            if (acceptCallback) acceptCallback(selectedProfile)
            toggleOverlay(false)
        }
    }
    
    // Set cancel handler with token invalidation
    document.getElementById('profileSelectCancel').onclick = async () => {
        // Invalidate token
        if (authData && authData.accessToken && authData.clientToken) {
            const invalidateResult = await AuthManager.invalidateMojangToken(authData.accessToken, authData.clientToken, 'user_cancelled')
            console.log(`Token invalidation on cancel button click: ${invalidateResult ? 'Successful' : 'Failed'}`)
        }
        
        if (cancelCallback) cancelCallback()
        toggleOverlay(false)
    }
    
    // Store authData to use when clicking outside
    overlayContainer.setAttribute('data-auth-access-token', authData.accessToken)
    overlayContainer.setAttribute('data-auth-client-token', authData.clientToken)
}

/**
 * Configura el visor de skin para la cuenta especificada
 * 
 * @param {Object} account La cuenta para mostrar la skin
 * @param {File} previewSkinFile Archivo de skin opcional para previsualizar sin subir
 * @param {File} previewCapeFile Archivo de capa opcional para previsualizar sin subir
 */
async function setupSkinViewer(account, previewSkinFile = null, previewCapeFile = null) {
    // Limpiar el contenedor del canvas
    const skinCanvas = document.getElementById('skinCanvas')
    if (!skinCanvas) {
        console.error('Error: No se encontró el elemento skinCanvas')
        return
    }
    
    skinCanvas.innerHTML = ''
    
    // Validar que tengamos una cuenta con UUID
    if (!account || !account.uuid) {
        console.error('Error: No se proporcionó una cuenta válida con UUID', account)
        skinCanvas.innerHTML = '<div style="color: white; padding: 20px; text-align: center;">Error: Cuenta no válida o UUID no disponible</div>'
        return
    }
    
    console.log('Configurando visor para cuenta con UUID:', account.uuid)
    
    try {
        // Verificar si skinview3d está disponible
        if (typeof skinview3d === 'undefined') {
            console.error('Error: La biblioteca skinview3d no está disponible')
            skinCanvas.innerHTML = '<div style="color: white; padding: 20px; text-align: center;">Error: No se pudo cargar la biblioteca de visualización de skins</div>'
            return
        }
        
        // Calcular dimensiones óptimas según el contenedor
        const containerWidth = skinCanvas.clientWidth || 330;
        const containerHeight = skinCanvas.clientHeight || 330;
        
        // Crear nueva instancia de skinview3d (API 3.3.0)
        const skinView = new skinview3d.SkinViewer({
            canvas: document.createElement('canvas'),
            width: containerWidth,
            height: containerHeight
        })
        
        // Añadir el canvas al contenedor
        skinCanvas.appendChild(skinView.canvas)
        
        // Configurar controles básicos
        skinView.controls.enableRotate = true
        skinView.controls.enableZoom = true
        skinView.controls.enablePan = false
        
        // Activar rotación automática por defecto
        skinView.autoRotate = true
        
        // Activar animación de caminar por defecto
        skinView.animation = new skinview3d.WalkingAnimation()
        skinView.animation.speed = 1
        
        // Almacenar referencias para uso posterior
        skinCanvas.skinView = skinView
        
        // URL de skin por defecto si no se encuentra
        const defaultSkinUrl = 'https://assets.mojang.com/SkinTemplates/steve.png'
        
        let skinUrl = null
        let capeUrl = null
        
        // Si hay archivos para previsualizar, usarlos con FileReader
        if (previewSkinFile) {
            try {
                // Usar fileToDataURL en lugar de URL.createObjectURL
                const skinDataURL = await fileToDataURL(previewSkinFile);
                console.log('Skin previsualización convertida a DataURL');
                
                // Obtener el modelo actual seleccionado
                const isSlim = document.getElementById('skinModelSwitch').checked;
                console.log('Cargando skin con modelo:', isSlim ? 'slim' : 'default');
                
                // Primero establecer el modelo y luego cargar la skin
                if (skinView.playerObject) {
                    skinView.playerObject.slim = isSlim;
                }
                
                // Cargar la skin
                await skinView.loadSkin(skinDataURL);
                
                // Forzar render para aplicar cambios
                skinView.render();
                
                // Detectar el modelo de la skin (slim o classic) y actualizar el switch
                const detectedIsSlim = detectSkinModel(skinView);
                selectSkinModelSwitch(detectedIsSlim);
                
                document.getElementById('deleteSkinButton').disabled = false;
            } catch (error) {
                console.warn('Error al cargar la previsualización de skin:', error);
                // Si hay error, intentamos cargar las texturas del perfil
                previewSkinFile = null;
            }
        }
        
        if (previewCapeFile) {
            try {
                // Usar fileToDataURL en lugar de URL.createObjectURL
                const capeDataURL = await fileToDataURL(previewCapeFile);
                console.log('Capa previsualización convertida a DataURL');
                await skinView.loadCape(capeDataURL);
                document.getElementById('deleteCapeButton').disabled = false;
            } catch (error) {
                console.warn('Error al cargar la previsualización de capa:', error);
                // Si hay error, intentamos cargar las texturas del perfil
                previewCapeFile = null;
            }
        }
        
        // Si no hay previsualización o falló la carga, cargamos las texturas del perfil
        if (!previewSkinFile || !previewCapeFile) {
            // Obtener las texturas del perfil usando MojangRestAPI
            const textureData = await MojangRestAPI.getProfileTextures(account.uuid)
            console.log('Datos de texturas obtenidos:', textureData)
            
            // Verificar si obtuvimos datos de texturas válidos
            if (textureData && textureData.responseStatus === RestResponseStatus.SUCCESS && textureData.data) {
                // Los datos vienen directamente como skinUrl y capeUrl en el objeto data
                if (textureData.data.skinUrl && !previewSkinFile) {
                    skinUrl = textureData.data.skinUrl;
                }
                
                if (textureData.data.capeUrl && !previewCapeFile) {
                    capeUrl = textureData.data.capeUrl;
                }
            } else {
                console.log('Datos de textura nulos o inválidos, usando skin por defecto')
            }
            
            // Cargar la skin del perfil si no hay previsualización
            if (!previewSkinFile) {
                try {
                    if (skinUrl) {
                        console.log('Cargando skin desde:', skinUrl)
                        await skinView.loadSkin(skinUrl)
                        
                        // Detectar el modelo de la skin (slim o classic) y actualizar el switch
                        const isSlimModel = detectSkinModel(skinView);
                        selectSkinModelSwitch(isSlimModel);
                        
                        document.getElementById('deleteSkinButton').disabled = true
                    } else {
                        console.log('No se encontró skin, usando skin por defecto')
                        await skinView.loadSkin(defaultSkinUrl)
                        document.getElementById('deleteSkinButton').disabled = true
                    }
                } catch (error) {
                    console.warn('Error al cargar la skin:', error)
                    await skinView.loadSkin(defaultSkinUrl)
                    document.getElementById('deleteSkinButton').disabled = true
                }
            }
            
            // Cargar la capa del perfil si no hay previsualización
            if (!previewCapeFile) {
                if (capeUrl) {
                    try {
                        console.log('Cargando capa desde:', capeUrl)
                        await skinView.loadCape(capeUrl)
                        document.getElementById('deleteCapeButton').disabled = false
                    } catch (error) {
                        console.warn('Error al cargar la capa:', error)
                        document.getElementById('deleteCapeButton').disabled = true
                    }
                } else {
                    console.log('No se encontró capa para el usuario')
                    document.getElementById('deleteCapeButton').disabled = true
                }
            }
        }
        
        // Habilitar el botón de confirmación si hay archivos a subir
        document.getElementById('confirmTextureUpload').disabled = !(selectedSkinFile || selectedCapeFile);
        
        // Al final de la función, asegurarnos que los botones están correctamente habilitados/deshabilitados
        const deleteSkinButton = document.getElementById('deleteSkinButton')
        const deleteCapeButton = document.getElementById('deleteCapeButton')
        
        if (deleteSkinButton && skinUrl) {
            deleteSkinButton.disabled = false
        } else if (deleteSkinButton) {
            deleteSkinButton.disabled = true
        }
        
        if (deleteCapeButton && capeUrl) {
            deleteCapeButton.disabled = false
        } else if (deleteCapeButton) {
            deleteCapeButton.disabled = true
        }
        
        // Añadimos una llamada explícita a bindTextureManagerButtons para asegurar que los eventos estén conectados
        setTimeout(bindTextureManagerButtons, 100);
        
        // Después de configurar el visor, detectar el modelo de la skin y actualizar el switch
        if (skinView && skinView.playerObject) {
            const isSlim = detectSkinModel(skinView);
            const modelSwitch = document.getElementById('skinModelSwitch');
            if (modelSwitch) {
                modelSwitch.checked = isSlim;
                updateSkinViewerModel(isSlim);
            }
        }
        
    } catch (error) {
        console.error('Error al configurar el visor de skin:', error)
        if (skinCanvas) {
            skinCanvas.innerHTML = '<div style="color: white; padding: 20px; text-align: center;">Error al cargar el visor de skin</div>'
        }
    }
}

/**
 * Detecta si la skin cargada en el visor es de tipo slim (Alex) o classic (Steve)
 * @param {Object} skinViewer Instancia de skinview3d.SkinViewer
 * @returns {boolean} true si es modelo Alex (slim), false si es modelo Steve (classic)
 */
function detectSkinModel(skinViewer) {
    try {
        // Si skinview3d expone una propiedad para determinar el modelo, usarla
        if (skinViewer.playerObject && skinViewer.playerObject.slim !== undefined) {
            return skinViewer.playerObject.slim;
        }
        
        // Alternativamente, revisar la textura para ver si es modelo slim
        // Las texturas slim suelen tener un patrón específico para los brazos
        return false;  // Por defecto, devolver modelo classic (Steve)
    } catch (error) {
        console.warn('Error al detectar el modelo de skin:', error);
        return false;  // Por defecto, devolver modelo classic (Steve)
    }
}

/**
 * Selecciona el toggle switch correspondiente al modelo de skin
 * @param {boolean} isSlim true para Alex (slim), false para Steve (classic)
 */
function selectSkinModelSwitch(isSlim) {
    const switchElement = document.getElementById('skinModelSwitch');
    if (switchElement) {
        switchElement.checked = isSlim;
    }
}

/**
 * Obtiene el modelo de skin seleccionado por el usuario
 * @returns {string} 'slim' para Alex, '' para Steve (classic)
 */
function getSelectedSkinModel() {
    return document.getElementById('skinModelSwitch').checked ? 'slim' : '';
}

/**
 * Convierte un archivo a una cadena de datos URL
 * @param {File} file El archivo a convertir
 * @returns {Promise<string>} Una promesa que resuelve a la URL de datos
 */
function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e);
        reader.readAsDataURL(file);
    });
}

/**
 * Prepara un archivo para subir a Mojang obteniendo sus datos binarios
 * @param {File} file El archivo a preparar
 * @returns {Promise<{data: ArrayBuffer, name: string}>} Datos del archivo y nombre
 */
function prepareFileForUpload(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            resolve({
                data: e.target.result,
                name: file.name
            });
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Guarda un archivo temporal en el sistema y devuelve sus datos binarios
 * @param {File} file El archivo a guardar
 * @returns {Promise<{data: ArrayBuffer, name: string}>} Una promesa que resuelve a los datos del archivo
 */
function saveTempFile(file) {
    return prepareFileForUpload(file);
}

/**
 * Crea un archivo temporal a partir de un objeto File
 * @param {File} file El archivo a convertir en archivo temporal
 * @returns {Promise<string>} La ruta del archivo temporal creado
 */
async function createTempFile(file) {
    return new Promise((resolve, reject) => {
        try {
            // Acceder a módulos de Node.js disponibles en Electron
            const fs = require('fs');
            const os = require('os');
            const path = require('path');
            
            // Crear un nombre único para el archivo temporal
            const tempDir = os.tmpdir();
            const uniqueName = `limbolauncher_temp_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
            const tempFilePath = path.join(tempDir, uniqueName + '.png');
            
            // Convertir el archivo a ArrayBuffer
            const reader = new FileReader();
            
            reader.onload = () => {
                const buffer = Buffer.from(reader.result);
                // Escribir el buffer al archivo
                fs.writeFile(tempFilePath, buffer, (err) => {
                    if (err) {
                        console.error('Error al escribir archivo temporal:', err);
                        reject(err);
                    } else {
                        resolve(tempFilePath);
                    }
                });
            };
            
            reader.onerror = (e) => {
                console.error('Error al leer archivo:', e);
                reject(e);
            };
            
            reader.readAsArrayBuffer(file);
            
        } catch (error) {
            console.error('Error al crear archivo temporal:', error);
            reject(error);
        }
    });
}

/**
 * Abre el administrador de texturas para una cuenta específica
 * 
 * @param {Object} account La cuenta para la que administrar texturas
 */
function toggleTextureManager(account) {
    if (!account) {
        console.error('No se especificó ninguna cuenta para administrar texturas')
        return
    }
    
    if (!account.uuid) {
        console.error('La cuenta no tiene UUID válido:', account)
        return
    }
    
    console.log('Abriendo administrador de texturas para cuenta:', account.uuid)
    
    // Reiniciar las texturas seleccionadas
    selectedSkinFile = null;
    selectedCapeFile = null;
    
    // Mostrar el nombre del jugador que se está editando
    const playerNameElement = document.getElementById('texturePlayerName');
    if (playerNameElement) {
        playerNameElement.textContent = `Editando a ${account.displayName || account.username || 'Jugador'}`;
    }
    
    // Mostrar el overlay
    toggleOverlay(true, false, 'textureManagerContent', true)
    
    // Almacenar la cuenta actual en el overlay para uso posterior
    document.getElementById('textureManagerContent').setAttribute('data-account-uuid', account.uuid)
    document.getElementById('textureManagerContent').setAttribute('data-account-type', account.type)
    
    // Asegurarse de que el botón de confirmación esté deshabilitado inicialmente
    const confirmButton = document.getElementById('confirmTextureUpload');
    if (confirmButton) {
        confirmButton.disabled = true;
        confirmButton.removeAttribute('data-status-message');
        confirmButton.classList.remove('btn-status-error', 'btn-status-success', 'btn-status-loading');
    }
    
    // Configurar el visor de skin después de que el overlay sea visible
    setTimeout(() => {
        setupSkinViewer(account);
        // Enlazar los botones después de configurar el visor
        bindTextureManagerButtons();
        
        // Añadir listener para el redimensionamiento
        window.addEventListener('resize', handleTextureManagerResize);
    }, 100);
}

/**
 * Maneja el redimensionamiento del administrador de texturas
 */
function handleTextureManagerResize() {
    if (!document.getElementById('textureManagerContent').style.display || 
        document.getElementById('textureManagerContent').style.display === 'none') {
        // Si el administrador de texturas no está visible, remover el listener
        window.removeEventListener('resize', handleTextureManagerResize);
        return;
    }
    
    // Obtener el canvas del visor de skin
    const skinCanvas = document.getElementById('skinCanvas');
    if (skinCanvas && skinCanvas.skinView) {
        // Obtener el contenedor y sus dimensiones actuales
        const container = skinCanvas.parentElement;
        const width = container.clientWidth;
        const height = container.clientHeight || 330;
        
        // Actualizar dimensiones del visor de skin
        try {
            skinCanvas.skinView.width = width;
            skinCanvas.skinView.height = height;
            console.log(`Redimensionado el visor de skin a ${width}x${height}`);
        } catch (error) {
            console.error('Error al redimensionar el visor de skin:', error);
        }
    }
}

// Configurar el manejador de selección de archivos de skin (no sube, solo selecciona)
document.getElementById('skinFileInput').addEventListener('change', async function(event) {
    const file = event.target.files[0]
    if (!file) return
    
    // Verificar que el archivo sea una imagen PNG
    if (!file.type.match('image/png')) {
        setTextureManagerStatus('error', 'Solo se permiten archivos PNG')
        return
    }
    
    // Verificar el tamaño de la imagen (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
        setTextureManagerStatus('error', 'El archivo debe ser menor a 2MB')
        return
    }
    
    const accountUuid = document.getElementById('textureManagerContent').getAttribute('data-account-uuid')
    
    if (!accountUuid) {
        setTextureManagerStatus('error', 'Error al identificar la cuenta')
        return
    }
    
    // Guardar el archivo seleccionado
    selectedSkinFile = file;
    console.log('Archivo de skin seleccionado:', selectedSkinFile.name);
    
    // Activar explícitamente el botón de confirmación
    const confirmButton = document.getElementById('confirmTextureUpload');
    confirmButton.disabled = false;
    console.log('Habilitando botón de confirmación (desde skin)');
    
    setTextureManagerStatus('loading', 'Cargando vista previa...')
    
    try {
        // Obtener la cuenta actual
        const accounts = ConfigManager.getAuthAccounts()
        const account = Object.values(accounts).find(acc => acc.uuid === accountUuid)
        
        if (!account) {
            throw new Error('No se encontró la cuenta en la configuración')
        }
        
        // Actualizar la vista previa con el archivo seleccionado
        await setupSkinViewer(account, selectedSkinFile, selectedCapeFile)
        
        setTextureManagerStatus('success', 'Vista previa de skin cargada. Pulse "Confirmar y Subir" para aplicar los cambios.')
    } catch (error) {
        console.error('Error al previsualizar la skin:', error)
        setTextureManagerStatus('error', `Error al previsualizar la skin: ${error.message || 'Error desconocido'}`)
        selectedSkinFile = null;
        // Verificar si todavía hay algún archivo seleccionado
        confirmButton.disabled = !(selectedSkinFile || selectedCapeFile);
    }
    
    // No limpiamos el input para mantener visible qué archivo se seleccionó
})

// Configurar el manejador de selección de archivos de capa (no sube, solo selecciona)
document.getElementById('capeFileInput').addEventListener('change', async function(event) {
    const file = event.target.files[0]
    if (!file) return
    
    // Verificar que el archivo sea una imagen PNG
    if (!file.type.match('image/png')) {
        setTextureManagerStatus('error', 'Solo se permiten archivos PNG')
        return
    }
    
    // Verificar el tamaño de la imagen (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
        setTextureManagerStatus('error', 'El archivo debe ser menor a 2MB')
        return
    }
    
    const accountUuid = document.getElementById('textureManagerContent').getAttribute('data-account-uuid')
    
    if (!accountUuid) {
        setTextureManagerStatus('error', 'Error al identificar la cuenta')
        return
    }
    
    // Guardar el archivo seleccionado
    selectedCapeFile = file;
    console.log('Archivo de capa seleccionado:', selectedCapeFile.name);
    
    // Activar explícitamente el botón de confirmación
    const confirmButton = document.getElementById('confirmTextureUpload');
    confirmButton.disabled = false;
    console.log('Habilitando botón de confirmación (desde capa)');
    
    setTextureManagerStatus('loading', 'Cargando vista previa...')
    
    try {
        // Obtener la cuenta actual
        const accounts = ConfigManager.getAuthAccounts()
        const account = Object.values(accounts).find(acc => acc.uuid === accountUuid)
        
        if (!account) {
            throw new Error('No se encontró la cuenta en la configuración')
        }
        
        // Actualizar la vista previa con el archivo seleccionado
        await setupSkinViewer(account, selectedSkinFile, selectedCapeFile)
        
        setTextureManagerStatus('success', 'Vista previa de capa cargada. Pulse "Confirmar y Subir" para aplicar los cambios.')
    } catch (error) {
        console.error('Error al previsualizar la capa:', error)
        setTextureManagerStatus('error', `Error al previsualizar la capa: ${error.message || 'Error desconocido'}`)
        selectedCapeFile = null;
        // Verificar si todavía hay algún archivo seleccionado
        confirmButton.disabled = !(selectedSkinFile || selectedCapeFile);
    }
    
    // No limpiamos el input para mantener visible qué archivo se seleccionó
})

// Configurar un manejador específico para asegurar que el botón sea clickeable
document.addEventListener('DOMContentLoaded', function() {
    const confirmButton = document.getElementById('confirmTextureUpload');
    if (confirmButton) {
        confirmButton.addEventListener('click', function(e) {
            console.log('Botón de confirmación clickeado');
            
            if (selectedSkinFile || selectedCapeFile) {
                console.log('Archivos seleccionados:');
                if (selectedSkinFile) console.log('- Skin:', selectedSkinFile.name);
                if (selectedCapeFile) console.log('- Capa:', selectedCapeFile.name);
            } else {
                console.warn('No hay archivos seleccionados para subir');
            }
        });
    }
});

// Manejador para mostrar el diálogo de confirmación al eliminar skin
document.getElementById('deleteSkinButton').addEventListener('click', function() {
    const accountUuid = document.getElementById('textureManagerContent').getAttribute('data-account-uuid')
    
    if (!accountUuid) {
        setTextureManagerStatus('error', 'Error al identificar la cuenta')
        return
    }
    
    // Configurar qué se va a eliminar
    confirmDeleteType = 'skin';
    
    // Obtener información de la cuenta
    const accounts = ConfigManager.getAuthAccounts()
    confirmDeleteAccount = Object.values(accounts).find(acc => acc.uuid === accountUuid)
    
    if (!confirmDeleteAccount) {
        setTextureManagerStatus('error', 'No se pudo obtener la información de la cuenta')
        return
    }
    
    // Verificar que el elemento del mensaje existe antes de usarlo
    const messageElement = document.getElementById('confirmDialogMessage')
    if (messageElement) {
        messageElement.textContent = '¿Estás seguro que quieres eliminar esta skin?'
    }
    
    // Mostrar el diálogo de confirmación
    document.getElementById('confirmDeleteDialog').style.display = 'flex'
})

// Manejador para mostrar el diálogo de confirmación al eliminar capa
document.getElementById('deleteCapeButton').addEventListener('click', function() {
    const accountUuid = document.getElementById('textureManagerContent').getAttribute('data-account-uuid')
    
    if (!accountUuid) {
        setTextureManagerStatus('error', 'Error al identificar la cuenta')
        return
    }
    
    // Configurar qué se va a eliminar
    confirmDeleteType = 'cape';
    
    // Obtener información de la cuenta
    const accounts = ConfigManager.getAuthAccounts()
    confirmDeleteAccount = Object.values(accounts).find(acc => acc.uuid === accountUuid)
    
    if (!confirmDeleteAccount) {
        setTextureManagerStatus('error', 'No se pudo obtener la información de la cuenta')
        return
    }
    
    // Verificar que el elemento del mensaje existe antes de usarlo
    const messageElement = document.getElementById('confirmDialogMessage')
    if (messageElement) {
        messageElement.textContent = '¿Estás seguro que quieres eliminar esta capa?'
    }
    
    // Mostrar el diálogo de confirmación
    document.getElementById('confirmDeleteDialog').style.display = 'flex'
})

// Manejador para confirmar la eliminación
document.getElementById('confirmDeleteButton').addEventListener('click', async function() {
    if (!confirmDeleteType || !confirmDeleteAccount) {
        // Ocultar el diálogo si hay un error
        document.getElementById('confirmDeleteDialog').style.display = 'none'
        return
    }
    
    // Hacer una copia local de los datos importantes para evitar que se limpien antes de usar
    const accountCopy = {...confirmDeleteAccount}
    const deleteType = confirmDeleteType
    
    // Ocultar el diálogo
    document.getElementById('confirmDeleteDialog').style.display = 'none'
    
    setTextureManagerStatus('loading', deleteType === 'skin' ? 'Eliminando skin...' : 'Eliminando capa...')
    
    try {
        // Eliminar la textura usando MojangRestAPI
        const result = await MojangRestAPI.deleteTexture(
            accountCopy.accessToken,
            accountCopy.uuid,
            deleteType // 'skin' o 'cape'
        )
        
        if (result.responseStatus === RestResponseStatus.SUCCESS) {
            setTextureManagerStatus('success', deleteType === 'skin' ? 'Skin eliminada correctamente' : 'Capa eliminada correctamente')
            
            if (deleteType === 'skin') {
                document.getElementById('deleteSkinButton').disabled = true
            } else {
                document.getElementById('deleteCapeButton').disabled = true
            }
            
            // Recargar la vista de skin después de un breve retraso para dar tiempo al servidor
            // Usamos la copia local de la cuenta para asegurar que sigue disponible
            setTimeout(() => {
                try {
                    if (accountCopy && accountCopy.uuid) {
                        console.log(`Recargando visor para cuenta: ${accountCopy.uuid}`)
                        setupSkinViewer(accountCopy)
                    } else {
                        console.error('No hay datos de cuenta válidos para recargar el visor')
                        // Intentar recuperar de nuevo la cuenta desde la configuración
                        const accounts = ConfigManager.getAuthAccounts()
                        const uuid = document.getElementById('textureManagerContent').getAttribute('data-account-uuid')
                        if (uuid) {
                            const account = Object.values(accounts).find(acc => acc.uuid === uuid)
                            if (account) {
                                console.log('Recuperada cuenta desde ConfigManager')
                                setupSkinViewer(account)
                            }
                        }
                    }
                } catch (viewerError) {
                    console.error('Error al recargar el visor de skin:', viewerError)
                }
            }, 1000)
        } else {
            throw new Error(result.data?.errorMessage || `Error al eliminar ${deleteType === 'skin' ? 'la skin' : 'la capa'}`)
        }
    } catch (error) {
        console.error(`Error al eliminar ${deleteType}:`, error)
        setTextureManagerStatus('error', `Error al eliminar ${deleteType === 'skin' ? 'la skin' : 'la capa'}: ${error.message || 'Error desconocido'}`)
    }
    
    // Limpiar variables de confirmación
    confirmDeleteType = null
    confirmDeleteAccount = null
})

// Manejador para cancelar la eliminación
document.getElementById('cancelDeleteButton').addEventListener('click', function() {
    // Ocultar el diálogo
    document.getElementById('confirmDeleteDialog').style.display = 'none';
    
    // Limpiar variables de confirmación
    confirmDeleteType = null;
    confirmDeleteAccount = null;
})

// Corregir el botón de cerrar
document.getElementById('textureManagerClose').addEventListener('click', function() {
    console.log('Cerrando administrador de texturas');
    window.removeEventListener('resize', handleTextureManagerResize);
    toggleOverlay(false);
});

/**
 * Conecta los botones del gestor de texturas con las funciones correspondientes
 */
function bindTextureManagerButtons() {
    console.log('Vinculando eventos a todos los botones del gestor de texturas');
    
    // Añadir eventos de clic a las etiquetas
    const steveLabel = document.getElementById('modelLabelSteve');
    const alexLabel = document.getElementById('modelLabelAlex');
    const modelSwitch = document.getElementById('skinModelSwitch');
    
    // Obtener referencias a los botones de textura
    const skinFileButton = document.querySelector('label[for="skinFileInput"]');
    const capeFileButton = document.querySelector('label[for="capeFileInput"]');
    const skinFileInput = document.getElementById('skinFileInput');
    const capeFileInput = document.getElementById('capeFileInput');
    
    if (steveLabel && alexLabel && modelSwitch) {
        console.log('Vinculando eventos a las etiquetas de modelo en la sección de skin');
        
        // Eliminar eventos anteriores
        steveLabel.removeEventListener('click', handleSteveLabelClick);
        alexLabel.removeEventListener('click', handleAlexLabelClick);
        modelSwitch.removeEventListener('change', handleModelSwitchChange);
        
        // Añadir nuevos eventos
        steveLabel.addEventListener('click', handleSteveLabelClick);
        alexLabel.addEventListener('click', handleAlexLabelClick);
        modelSwitch.addEventListener('change', handleModelSwitchChange);
        
        // Inicializar con las clases correctas basadas en el estado del switch
        updateSkinViewerModel(modelSwitch.checked);
    } else {
        console.warn('No se encontraron elementos del selector de modelo');
    }
    
    // Asegurarnos de que los botones de textura están habilitados y son clickeables
    if (skinFileButton && skinFileInput) {
        console.log('Habilitando botón de subida de skin');
        skinFileButton.style.pointerEvents = 'auto';
        skinFileInput.disabled = false;
        
        // Evento de depuración para verificar si los clics se registran
        skinFileButton.addEventListener('click', function(e) {
            console.log('Botón de selección de skin clickeado');
        });
    } else {
        console.warn('No se encontró el botón de subida de skin');
    }
    
    if (capeFileButton && capeFileInput) {
        console.log('Habilitando botón de subida de capa');
        capeFileButton.style.pointerEvents = 'auto';
        capeFileInput.disabled = false;
        
        // Evento de depuración para verificar si los clics se registran
        capeFileButton.addEventListener('click', function(e) {
            console.log('Botón de selección de capa clickeado');
        });
    } else {
        console.warn('No se encontró el botón de subida de capa');
    }
}

/**
 * Actualiza el modelo del skin viewer basado en el modelo seleccionado (slim o classic)
 * @param {boolean} isSlim true para Alex (slim), false para Steve (classic)
 */
function updateSkinViewerModel(isSlim) {
    console.log('Actualizando modelo a:', isSlim ? 'slim (Alex)' : 'classic (Steve)');
    
    // Actualizar las clases de las etiquetas
    const steveLabel = document.getElementById('modelLabelSteve');
    const alexLabel = document.getElementById('modelLabelAlex');
    
    if (steveLabel && alexLabel) {
        if (isSlim) {
            steveLabel.classList.remove('active');
            alexLabel.classList.add('active');
        } else {
            steveLabel.classList.add('active');
            alexLabel.classList.remove('active');
        }
    }
    
    const skinCanvas = document.getElementById('skinCanvas');
    if (!skinCanvas || !skinCanvas.skinView) {
        console.warn('Visor de skin no disponible');
        return;
    }
    
    try {
        // Actualizar el modelo del jugador
        if (skinCanvas.skinView.playerObject) {
            // Establecer la propiedad slim
            skinCanvas.skinView.playerObject.slim = isSlim;
            
            // Forzar la actualización visual
            skinCanvas.skinView.render();
            
            // Si hay una skin previsualizándose, volvemos a aplicarla
            if (selectedSkinFile) {
                fileToDataURL(selectedSkinFile).then(dataUrl => {
                    skinCanvas.skinView.loadSkin(dataUrl);
                    console.log('Skin recargada con nuevo modelo');
                }).catch(err => {
                    console.error('Error al recargar skin:', err);
                });
            }
            
            console.log('Modelo actualizado a:', isSlim ? 'Alex (slim)' : 'Steve (classic)');
        } else {
            console.warn('PlayerObject no encontrado en el visor');
        }
    } catch (error) {
        console.error('Error al actualizar modelo:', error);
    }
}

/**
 * Actualiza el estado mostrado en el administrador de texturas con animaciones en los botones
 * @param {string} status Tipo de estado: 'error', 'success', 'loading' o vacío para limpiar
 * @param {string} message Mensaje a mostrar (se usará como tooltip)
 */
function setTextureManagerStatus(status, message) {
    // Obtenemos el botón principal que mostrará la animación
    const confirmButton = document.getElementById('confirmTextureUpload');
    if (!confirmButton) return;
    
    console.log(`Estado del administrador de texturas: ${status} - ${message}`);
    
    // Limpiar todas las clases de estado anteriores
    confirmButton.classList.remove('btn-status-error', 'btn-status-success', 'btn-status-loading');
    
    // Eliminar tooltip anterior
    confirmButton.removeAttribute('data-status-message');
    
    // Añadir la clase correspondiente al tipo de estado
    if (status) {
        confirmButton.classList.add('btn-status-' + status);
        
        // Guardar el mensaje como atributo para tooltip
        confirmButton.setAttribute('data-status-message', message || '');
        
        // Para éxito y error, establecer un temporizador para quitar la clase después de unos segundos
        if (status === 'success' || status === 'error') {
            setTimeout(() => {
                confirmButton.classList.remove('btn-status-' + status);
                confirmButton.removeAttribute('data-status-message');
            }, 3000);
        }
    }
    
    // Actualizar el estado del botón según el estado
    if (status === 'loading') {
        // No deshabilitar el botón para permitir cancelar la acción si es necesario
        // confirmButton.disabled = true;
    } else if (status === 'success') {
        // No deshabilitar después de éxito - dejar que el usuario pueda subir más
        // confirmButton.disabled = true;
    } else if (status === 'error') {
        // En caso de error, asegurarse que el botón esté habilitado si hay archivos seleccionados
        confirmButton.disabled = !(selectedSkinFile || selectedCapeFile);
    }
}

/**
 * Manejador de evento para cuando se hace clic en la etiqueta del modelo Steve
 */
function handleSteveLabelClick() {
    const modelSwitch = document.getElementById('skinModelSwitch');
    if (modelSwitch.checked) {
        modelSwitch.checked = false;
        updateSkinViewerModel(false);
    }
}

/**
 * Manejador de evento para cuando se hace clic en la etiqueta del modelo Alex
 */
function handleAlexLabelClick() {
    const modelSwitch = document.getElementById('skinModelSwitch');
    if (!modelSwitch.checked) {
        modelSwitch.checked = true;
        updateSkinViewerModel(true);
    }
}

/**
 * Manejador de evento para cuando cambia el estado del switch del modelo
 */
function handleModelSwitchChange() {
    const modelSwitch = document.getElementById('skinModelSwitch');
    updateSkinViewerModel(modelSwitch.checked);
}

// Configurar el manejador de clic para el botón "Confirmar y Subir"
document.getElementById('confirmTextureUpload').addEventListener('click', async function() {
    if (!selectedSkinFile && !selectedCapeFile) {
        console.warn('No hay archivos seleccionados para subir');
        return;
    }

    // Obtener datos de la cuenta desde el overlay
    const accountUuid = document.getElementById('textureManagerContent').getAttribute('data-account-uuid');
    const accountType = document.getElementById('textureManagerContent').getAttribute('data-account-type');
    
    if (!accountUuid) {
        setTextureManagerStatus('error', 'Error al identificar la cuenta');
        return;
    }
    
    // Obtener la cuenta completa desde ConfigManager
    const accounts = ConfigManager.getAuthAccounts();
    const account = Object.values(accounts).find(acc => acc.uuid === accountUuid);
    
    if (!account) {
        setTextureManagerStatus('error', 'No se pudo obtener la información de la cuenta');
        return;
    }
    
    // Mostrar estado de carga
    setTextureManagerStatus('loading', 'Subiendo texturas...');
    
    try {
        let skinUploaded = false;
        let capeUploaded = false;
        
        // Subir skin si existe
        if (selectedSkinFile) {
            // Crear un archivo temporal para la skin
            const tempSkinFile = await createTempFileFromSelected(selectedSkinFile);
            
            // Obtener el modelo seleccionado (slim o "")
            const skinModel = getSelectedSkinModel();
            
            console.log('Subiendo skin para:', account.displayName);
            console.log('Modelo seleccionado:', skinModel || 'classic');
            
            // Subir la skin usando la función existente en MojangRestAPI
            const skinResult = await MojangRestAPI.uploadSkin(
                account.accessToken,
                skinModel,
                account.uuid,
                tempSkinFile
            );
            
            // Limpiar el archivo temporal
            fs.unlinkSync(tempSkinFile);
            
            if (skinResult.responseStatus === RestResponseStatus.SUCCESS) {
                console.log('Skin subida exitosamente');
                skinUploaded = true;
            } else {
                console.error('Error al subir skin:', skinResult);
                setTextureManagerStatus('error', 'Error al subir skin: ' + (skinResult.error || 'Error desconocido'));
                return;
            }
        }
        
        // Subir capa si existe
        if (selectedCapeFile) {
            // Crear un archivo temporal para la capa
            const tempCapeFile = await createTempFileFromSelected(selectedCapeFile);
            
            console.log('Subiendo capa para:', account.displayName);
            
            // Subir la capa usando la función existente en MojangRestAPI
            const capeResult = await MojangRestAPI.uploadCape(
                account.accessToken,
                account.uuid,
                tempCapeFile
            );
            
            // Limpiar el archivo temporal
            fs.unlinkSync(tempCapeFile);
            
            if (capeResult.responseStatus === RestResponseStatus.SUCCESS) {
                console.log('Capa subida exitosamente');
                capeUploaded = true;
            } else {
                console.error('Error al subir capa:', capeResult);
                // Si la skin se subió bien pero la capa falló, mostramos ese mensaje específico
                if (skinUploaded) {
                    setTextureManagerStatus('error', 'Skin subida exitosamente, pero hubo un error al subir la capa: ' + (capeResult.error || 'Error desconocido'));
                } else {
                    setTextureManagerStatus('error', 'Error al subir capa: ' + (capeResult.error || 'Error desconocido'));
                }
                return;
            }
        }
        
        // Determinar mensaje de éxito basado en qué se subió
        let successMessage = '';
        if (skinUploaded && capeUploaded) {
            successMessage = 'Skin y capa subidas exitosamente';
        } else if (skinUploaded) {
            successMessage = 'Skin subida exitosamente';
        } else if (capeUploaded) {
            successMessage = 'Capa subida exitosamente';
        }
        
        setTextureManagerStatus('success', successMessage);
        
        // Limpiar archivos seleccionados después de subir con éxito
        selectedSkinFile = null;
        selectedCapeFile = null;
        
        // Actualizar el visor para mostrar las texturas actualizadas
        setTimeout(() => {
            setupSkinViewer(account);
        }, 2000);
        
        // Deshabilitar el botón de confirmar
        document.getElementById('confirmTextureUpload').disabled = true;
        
        // Limpiar los inputs de archivo
        document.getElementById('skinFileInput').value = '';
        document.getElementById('capeFileInput').value = '';
    } catch (error) {
        console.error('Error al subir texturas:', error);
        setTextureManagerStatus('error', `Error al subir texturas: ${error.message || 'Error desconocido'}`);
    }
});

/**
 * Crea un archivo temporal a partir de un objeto File seleccionado
 * @param {File} file El archivo seleccionado a convertir en archivo temporal
 * @returns {Promise<string>} Ruta al archivo temporal creado
 */
async function createTempFileFromSelected(file) {
    return new Promise((resolve, reject) => {
        try {
            // Convertir el archivo a ArrayBuffer
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    // Crear un archivo temporal con la extensión adecuada
                    const tempDir = os.tmpdir();
                    const tempFile = path.join(tempDir, `temp_${Date.now()}_${file.name}`);
                    
                    // Escribir los datos del archivo al temporal
                    fs.writeFileSync(tempFile, Buffer.from(event.target.result));
                    
                    resolve(tempFile);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        } catch (err) {
            reject(err);
        }
    });
}