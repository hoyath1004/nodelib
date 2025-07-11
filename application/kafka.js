'use strict'

var kafka_node = require('kafka-node');

function kafka() {
    if (!(this instanceof kafka)) {
        return new kafka();
    }

    this.config = null;
    this.client = null;
    this.producer = null;
    this.consumer = null;
    this.consumer_group = null;
}

kafka.prototype.init = function (conf, callback) {
    if (this.client) {
        if (callback) callback('err', 'Already initialized. Client object is not null.');
        return;
    }

    this.config = conf;

    this.client = new kafka_node.KafkaClient({
        kafkaHost: this.config.client.kafka_host,                         // A string of kafka broker/host combination
        connectTimeout: this.config.client.connect_timeout,               // in ms it takes to wait for a successful connection before moving to the next host default: 10000
        requestTimeout: this.config.client.request_timeout,               // in ms for a kafka request to timeout default: 30000
        autoConnect: this.config.client.auto_connect,                     // automatically connect when KafkaClient is instantiated otherwise you need to manually call connect default: true        
        idleConnection: this.config.client.idle_connection,               // allows the broker to disconnect an idle connection from a client (otherwise the clients continues to reconnect after being disconnected). The value is elapsed time in ms without any data written to the TCP socket. default: 5 minutes
        maxAsyncRequests: this.config.client.max_async_requests           // maximum async operations at a time toward the kafka cluster. default: 10
    });

    let kafka_producer = kafka_node.Producer;
    let kafka_consumer = kafka_node.Consumer;

    let producer_option = {
        requireAcks: this.config.producer.require_acks,         // Configuration for when to consider a message as acknowledged, default 1                
        ackTimeoutMs: this.config.producer.ack_timeout_ms,      // The amount of time in milliseconds to wait for all acks before considered, default 100ms                
        partitionerType: this.config.producer.partitioner_type  // Partitioner type (default = 0, random = 1, cyclic = 2, keyed = 3, custom = 4), default 0
    }

    // consumer
    // manual partition / multiple consumer broadcasting message
    let consumer_topic = [];
    let consumer_option = {
        groupId: this.config.consumer.group_id,                                    // consumer group id, default `kafka-node-group`
        autoCommit: this.config.consumer.auto_commit,                              // Auto commit config
        autoCommitIntervalMs: this.config.consumer.auto_commit_interval_ms,        // The max wait time is the maximum amount of time in milliseconds to block waiting if insufficient data is available at the time the request is issued, default 100ms        
        fetchMaxWaitMs: this.config.consumer.fetch_max_wait_ms,                    // This is the minimum number of bytes of messages that must be available to give a response, default 1 byte        
        fetchMinBytes: this.config.consumer.fetch_min_bytes,                       // The maximum bytes to include in the message set for this partition. This helps bound the size of the response.        
        fetchMaxBytes: this.config.consumer.fetch_max_bytes,                       // If set true, consumer will fetch message from the given offset in the payloads        
        fromOffset: this.config.consumer.from_offset,                              // If set to 'buffer', values will be returned as raw buffer objects.
        encoding: this.config.consumer.encoding,
        keyEncoding: this.config.consumer.key_encoding
    }

    let topic = this.config.consumer.topic.split(',');

    for (let i in topic) {
        let topic_unit = {
            topic: topic[i]
        }

        consumer_topic.push(topic_unit);
    }

    // consumer_group
    // distributed processing for consumers with the same group_id
    let consumer_group_option = {
        kafkaHost: this.config.client.kafka_host,                               // connect directly to kafka broker (instantiates a KafkaClient)
        ssl: this.config.consumer_group.ssl,                                    // optional (defaults to false) or tls options hash
        groupId: this.config.consumer_group.group_id,
        sessionTimeout: this.config.consumer_group.session_timeout,
        protocol: this.config.consumer_group.protocol,                          // An array of partition assignment protocols ordered by preference. 'roundrobin' or 'range' string for built ins (see below to pass in custom assignment protocol)
        fromOffset: this.config.consumer_group.from_offset                      // default 'latest'
    }

    let consumer_group_topic = [];
    let topic_consumer_group = this.config.consumer_group.topic.split(',');

    for (let i in topic_consumer_group) {
        consumer_group_topic.push(topic_consumer_group[i]);
    }

    // role 0 : all ( producer + consumer ) 1 : producer only 2 : consumer only
    switch (this.config.role) {
        case 0:
            try {
                this.producer = new kafka_producer(this.client, producer_option);

                this.producer.on('ready', function () {
                    if (callback) callback('succ', 'connected_producer');
                });

                this.producer.on('error', function (err) {
                    if (callback) callback('err', 'producer_error [' + JSON.stringify(err) + ']');
                    return;
                });
            } catch (e) {
                if (callback) callback('err', e);
                return;
            }

            if(this.config.consumer.is_use == 1){
                try {
                    this.consumer = new kafka_consumer(this.client, consumer_topic, consumer_option);
    
                    if (callback) callback('succ', 'connected_consumer');
                } catch (e) {
                    if (callback) callback('err', 'consumer_error [' + e + ']');
                    return;
                }                
            }

            if(this.config.consumer_group.is_use == 1){
                try {
                    this.consumer_group = new kafka_node.ConsumerGroup(consumer_group_option, consumer_group_topic);
    
                    if (callback) callback('succ', 'connected_consumer_group');
                } catch (e) {
                    if (callback) callback('err', 'consumer_group_error [' + e + ']');
                    return;
                }                
            }

            break;
        case 1:
            try {
                this.producer = new kafka_producer(this.client, producer_option);

                this.producer.on('ready', function () {
                    if (callback) callback('succ', 'connected_producer');
                });

                this.producer.on('error', function (err) {
                    if (callback) callback('err', 'producer_error [' + JSON.stringify(err) + ']');
                    return;
                });
            } catch (e) {
                if (callback) callback('err', e);
                return;
            }

            break;
        case 2:
            if(this.config.consumer.is_use == 1){
                try {
                    this.consumer = new kafka_consumer(this.client, consumer_topic, consumer_option);

                    if (callback) callback('succ', 'connected_consumer');
                } catch (e) {
                    if (callback) callback('err', 'consumer_error [' + e + ']');
                    return;
                }                
            }

            if(this.config.consumer_group.is_use == 1){
                try {
                    this.consumer_group = new kafka_node.ConsumerGroup(consumer_group_option, consumer_group_topic);

                    if (callback) callback('succ', 'connected_consumer_group');
                } catch (e) {
                    if (callback) callback('err', 'consumer_group_error [' + e + ']');
                    return;
                }                
            }

            break;
        default:
            if (callback) callback('err', 'config_setting_is_invalid.');

            this.config = null;
            this.client = null;
            this.producer = null;
            this.consumer = null;
            this.consumer_group = null;

            break;
    }
}

kafka.prototype.setMessage = function (topic, message, callback) {
    if (!this.client || !this.producer) {
        if (callback) callback('err', 'not_connected');
        return;
    }

    let random_partition = Math.floor(Math.random() * (this.config.producer.partition - 0));

    let payloads = [
        {
            topic: topic,
            messages: message,
            partition: random_partition
        }
    ];

    this.producer.send(payloads, function () {
        if (callback) callback('succ', 'success_set_message');
    });
}

kafka.prototype.getMessage = function (callback) {
    if (!this.client || (!this.consumer && !this.consumer_group)) {
        if (callback) callback('err', 'not_connected');
        return;
    }

    if(this.consumer){

        this.consumer.on('message', function (message) {
            if (callback) callback('succ', JSON.stringify(message));
        });
    
        this.consumer.on('error', function (err) {
            if (callback) callback('err', 'consumer_error [' + JSON.stringify(err) + ']');
        });        
    }

    if(this.consumer_group){

        this.consumer_group.on('message', function (message) {
            if (callback) callback('succ', JSON.stringify(message));
        });
    
        this.consumer_group.on('error', function (err) {
            if (callback) callback('err', 'consumer_group_error [' + JSON.stringify(err) + ']');
        });        
    }
}

module.exports = kafka();