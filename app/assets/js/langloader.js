const fs = require('fs-extra')
const path = require('path')
const toml = require('toml')
const merge = require('lodash.merge')

const defaultLang = "es_ES"

let lang
exports.loadLanguage = function(id){
    lang = merge(lang || {}, toml.parse(fs.readFileSync(path.join(__dirname, '..', 'lang', `${id}.toml`))) || {})
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

exports.setupLanguage = function(dir){
    const configPath = dir
    const firstLaunch = !fs.existsSync(configPath)
    let config = null
    // Load Language Files

    if(firstLaunch) {
        exports.loadLanguage(defaultLang)
        console.log(defaultLang)
    }
    if(!firstLaunch){
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'UTF-8'))
        } catch (err){
            console.log(err)
            console.log('Configuration file contains malformed JSON or is corrupt.')
            fs.ensureDirSync(path.join(configPath, '..'))
        }
        exports.loadLanguage(config.settings.launcher.language)
    }
    
    // Load Custom Language File for Launcher Customizer
    exports.loadLanguage('_custom')
}