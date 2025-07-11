
function localcache(ttl) {
    if (!(this instanceof localcache)) {
        return new localcache(ttl);
    }

    // key
    // value : {ttl:xxx, time:time_ms, data:string}
    this.cache = new Map();
    // cache ttl: second
    this.ttl = ttl || config.get('cache_ttl');
    this.useCount = 0;
}

localcache.prototype.set = function(key, data, ttl) {
    if ( this.cache.has(String(key)) == false ) {
        let _ttl = ttl || this.ttl ;
        let _type = typeof data;
        let _modify_data = _type === 'object' ? JSON.stringify(data) : data;

        let value = {ttl:_ttl, data: _modify_data, time: new Date() / 1000, type: _type, count:0};
        this.cache.set(String(key), value);
    }
    else {
        let v = this.cache.get(String(key));
        let _type = typeof data;
        let _modify_data = _type === 'object' ? JSON.stringify(data) : data;
        v.type = _type;
        v.data = _modify_data;
    }
}

localcache.prototype.get = function(key) {
    if ( this.cache.has(String(key)) === false ) {
        return null;
    }

    let v = this.cache.get(String(key));
    // console.log('CHECK CACHE TIME: ' + ( ( new Date() / 1000 )- v.time) + ' ' + v.ttl)
    if (((new Date() / 1000) - v.time ) > v.ttl) {
        // 유효시간 초과시 - 삭제
        // logger.info(process.pid + ' CACHE => CHECKOUT: ' + v.ttl + ' K: ' + key + ' C: ' + v.count)
        this.cache.delete(String(key));
        return null;
    }
    try {
        v.count++;
        this.useCount++;
        return v.type === 'object' ? JSON.parse(v.data) : v.data;
    }
    catch(e) {
        logger.crit('CACHE => JSON_PARSING_ERROR; ' + v.data);
        this.cache.delete(String(key));
        return null;
    }
}

localcache.prototype.getSize = function() {
    return this.cache.size;
}

localcache.prototype.clear = function() {
    logger.crit('!!!!! CACHE => ALL CLEAR : ' + this.cache.size)
    this.cache.clear();
}

localcache.prototype.status = function() {
    let _str = 'CACHE: ' + this.cache.size + ' USE: ' + this.useCount;
    this.useCount = 0;
    return _str;
}

module.exports = localcache();
