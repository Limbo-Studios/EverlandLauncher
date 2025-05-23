const fs    = require('fs-extra')
const isDev = require('./isdev')
const path  = require('path')
const toml  = require('toml')
const merge = require('lodash.merge')

const defaultLang = "es_MX"
let config = null

let lang
exports.loadLanguage = function(id){
    // Nueva implementación: siempre cargar desde app/assets/lang
    const langPath = path.join(__dirname, '..', 'lang', `${id}.toml`)
    try {
        lang = merge(lang || {}, toml.parse(fs.readFileSync(langPath)) || {})
    } catch (err) {
        console.error(`Error al cargar el archivo de idioma: ${langPath}`, err)
        // Intentar cargar el idioma predeterminado si falla la carga del idioma solicitado
        if (id !== defaultLang) {
            console.info(`Intentando cargar el idioma predeterminado: ${defaultLang}`)
            this.loadLanguage(defaultLang)
        }
    }
}

exports.query = function(id, placeHolders){
    let query = id.split('.')
    let res = lang
    for(let q of query){
        res = res[q]
    } 
    let text = res === lang ? '' : res
    if (placeHolders) {
        Object.entries(placeHolders).forEach(([key, value]) => {
            text = text.replace(`{${key}}`, value)
        })
    }
    return text
}

exports.queryJS = function(id, placeHolders){
    return exports.query(`js.${id}`, placeHolders)
}

exports.queryEJS = function(id, placeHolders){
    return exports.query(`ejs.${id}`, placeHolders)
}

function getLang(dir) {
    // ! Yuck, this is sketchy
    if(dir){
        try{
            config = JSON.parse(fs.readFileSync(dir, 'UTF-8'))
            if(config.settings.launcher.language == undefined) {
                config.settings.launcher.language = defaultLang
            }
            return config.settings.launcher.language
        } catch (err){
            return defaultLang
        }
    }
}

exports.setupLanguage = function(dir){
    // Load Language Files and check for conflict with CM
    slectedLang = getLang(dir)
    if(slectedLang) {
        console.log(slectedLang)
        exports.loadLanguage(slectedLang)
        // Load Custom Language File for Launcher Customizer
        exports.loadLanguage('_custom')
    }
}