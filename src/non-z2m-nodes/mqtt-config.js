module.exports = function (RED) {
    const utils = require("../../lib/utils.js");
    const bavaria = utils.bavaria();

    function mqttConfig(config) {
        RED.nodes.createNode(this, config);
        var mqtt = require("mqtt");
        this.name = config.name;
        this.broker = config.protocol + "://" + config.broker;
        this.requireLogin = config.requireLogin;
        var _subs = [];
        var node = this;

        var options = {};
        if (node.requireLogin) {
            options = {
                username: this.credentials.username,
                password: this.credentials.password
            };
        }

        var client = mqtt.connect(this.broker, options);
        this.mqttClient = client;

        this.isConnected = function () { return client.connected; };
        this.isReconnecting = function () { return client.reconnecting; };
        this.publish = function (topic, message) { client.publish(topic, message); };
        this.subscribeDevice = function (nodeId, topic, callback) {
            subscribeInternal(nodeId, topic, callback, true);
        };
        this.subscribe = function (nodeId, topic, callback) {
            subscribeInternal(nodeId, topic, callback, false);
            client.subscribe(topic);
            return true;
        };
        this.unsubscribe = function (nodeId) {
            var sub = _subs.find(e => e.nodeId == nodeId);
            if (sub) {
                var topic = sub.topic;
                var index = _subs.indexOf(sub);
                _subs.splice(index, 1);
                if (!sub.isDevice && !_subs.some(s => s.topic == topic)) {
                    client.unsubscribe(sub.topic);
                }
            }
        };

        function subscribeInternal(nodeId, topic, callback, isDevice) {
            var sub = _subs.find(e => e.nodeId == nodeId);
            if (sub) {
                if (sub.topic !== topic) {
                    client.unsubscribe(sub.topic);
                }

                sub.topic = topic;
                sub.callback = callback;
            } else {
                sub = {
                    nodeId: nodeId,
                    topic: topic,
                    callback: callback,
                    isDevice: isDevice
                };

                _subs.push(sub);
            }
        }

        client.on("message", function (topic, message) {
            try {
                message = message.toString("utf8");
                if (message.startsWith("{")) {
                    message = JSON.parse(message);
                }

                var subs = _subs.filter(e => comapreTopic(e.topic, topic));
                subs.forEach(e => {
                    try {
                        e.callback(message, topic);
                    } catch (err) {
                        console.log(err);
                    }
                });
            } catch (err) {
                node.error(topic + " - " + err);
            }
        });

        function comapreTopic(subscriptionTopic, messageTopic) {
            if (subscriptionTopic === messageTopic) {
                return true;
            }

            if (subscriptionTopic.endsWith("+")) {
                var subSegments = subscriptionTopic.split("/");
                var topicSegments = messageTopic.split("/");

                if (subSegments.length === topicSegments.length) {
                    subSegments.pop();
                    topicSegments.pop();

                    for (var i = 0; i < subSegments.length; i++) {
                        if (subSegments[i] !== topicSegments[i]) {
                            return false;
                        }
                    }

                    return true;
                }
                return false;
            }

            return false;
        }

        client.on("connect", function () {
            bavaria.observer.notify(node.id + "_connected", {});
        });

        node.on("close", function () {
            client.end(true);
        });
    }

    RED.nodes.registerType("mqtt-config", mqttConfig, {
        credentials: {
            username: { type: "text" },
            password: { type: "password" }
        }
    });
};