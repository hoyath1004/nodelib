'use strict';

const node_schedule = require('node-schedule');
const tools = require('../utils/tools');

function schedule() {
    if (!(this instanceof schedule)) {
        return new schedule();
    }
}

schedule.prototype.register = function(rule, repeat, module_path) {
    var _rule = null;
    
    if (repeat) {
        _rule = new node_schedule.RecurrenceRule();

        Object.keys(rule).forEach(function (key, index) {
            _rule[key] = rule[key];
        });
    }
    else {
        _rule = rule;
    }    

    if (!tools.isEmpty(module_path)) {
        logger.info('Scheduled job has been registered. module : ' + module_path + ', rule : ' + JSON.stringify(_rule));
        return node_schedule.scheduleJob(module_path, _rule, require(__base + module_path));
    }
    
    logger.error('Failed to register scheduled job. module : ' + module_path + ', rule : ' + JSON.stringify(_rule));
    return null;
}

schedule.prototype.register_function = function(rule, repeat, func) {
    var _rule = null;
    
    if (repeat) {
        _rule = new node_schedule.RecurrenceRule();

        Object.keys(rule).forEach(function (key, index) {
            _rule[key] = rule[key];
        });
    }
    else {
        _rule = rule;
    }

    var name = tools.uuid();
    logger.info('Scheduled function has been registered. name : ' + name + ', rule : ' + JSON.stringify(_rule));
    
    return node_schedule.scheduleJob(name, _rule, func);
}

schedule.prototype.unregister = function(obj) {
    if (obj) {
        logger.info('Un-registered scheduled job : ' + obj.name);
        obj.cancel();
    }
}

module.exports = schedule();