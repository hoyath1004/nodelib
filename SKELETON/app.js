'use strict';
global.__base = __dirname + '/';
global.__common = global.__base + 'common/';
global.__lib_base = global.__base + 'lib/';
const config = require(__lib_base + 'utils/config');
const express = require(__lib_base + 'application/express.js');
const tools = require(__lib_base + 'utils/tools')
const schedule = require(__lib_base + 'application/schedule.js');

require(__lib_base + 'application/init.js')('./config.json', 'SKEL_NAME');

///////////////////////////////////////////
// START CODE

logger.emerg('Nodejs SKEL_NAME application has been started.');
logger.alert('Nodejs SKEL_NAME application has been started.');
logger.crit('Nodejs SKEL_NAME application has been started.');
logger.error('Nodejs SKEL_NAME application has been started.');
logger.warn('Nodejs SKEL_NAME application has been started.');
logger.info('Nodejs SKEL_NAME application has been started.');
logger.debug('Nodejs SKEL_NAME application has been started.');

function app_start() {
    // Default Express -> Setting Router Config
    //express.init(config.get('express:##mode##'), config.get('Router')); 
    //express.cors();

    // Default Schedule 
    let _schedule_conf = config.get('schedule');
    if (!tools.isEmpty(_schedule_conf)) {
        _schedule_conf.forEach(element => {
            if ('def' in element || element.use == false) return;

            if (element.immediate == true) {
                logger.info(process.pid + ' ######## immediate START ######## ' + JSON.stringify(element));
                let _js = require(element.def);
                _js.run(element.func);
            }

            logger.info(process.pid + ' Register Scheule: ' + JSON.stringify(element));
            schedule.register_function(element.rule, element.hasOwnProperty('recurrence') ? element.recurrence : true, function(_element) {
                logger.info(process.pid + ' ######## Schedule START ######## ' + JSON.stringify(element));
                let _js = require(element.def);
                _js.run(element.func);
            }.bind(null, element));            
        });
    }
}

app_start();