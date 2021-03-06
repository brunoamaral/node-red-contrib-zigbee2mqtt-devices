module.exports = function (RED) {
    const utils = require("../../lib/utils.js");
    const bavaria = utils.bavaria();

    function createShellyConfig(config) {
        RED.nodes.createNode(this, config);
        this.prefix = config.prefix;
        this.name = config.name;

    }

    RED.nodes.registerType("shelly-config", createShellyConfig);

    function createShelly25(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        var broker = RED.nodes.getNode(config.mqtt);
        var shelly = RED.nodes.getNode(config.shelly);

        var context = node.context();
        var status = context.get("status") || { relay: [{ state: "off", energy: 0, power: 0 }, { state: "off", energy: 0, power: 0 }] };
        var channel = parseInt(config.channel);

        function subscribe(channel, offset) {
            broker.subscribe(node.id + offset, shelly.prefix + "/relay/" + channel, (msg) => { setRelay(channel, msg); });
            broker.subscribe(node.id + 1 + offset, shelly.prefix + "/relay/" + channel + "/power", (msg) => { setPower(channel, msg); });
            broker.subscribe(node.id + 2 + offset, shelly.prefix + "/relay/" + channel + "/energy", (msg) => { setEnergy(channel, msg); });
            broker.subscribe(node.id + 3 + offset, shelly.prefix + "/input/" + channel, (msg) => { inputReceived(msg, channel); });
        }

        if (channel === 2) {
            subscribe(0, 0);
            subscribe(1, 1);
        } else {
            subscribe(channel, 0);
        }

        function inputReceived(msg, channel) {
            msg = {
                payload: msg
            };
            if (config.customPayload === true) {
                var data = config["payloadInput" + channel];
                var type = config["typeInput" + channel];
                msg.payload = utils.ui.input.getPayload(data, type);
            }

            node.send(utils.outputs.preapreOutputFor(1, msg));
        }

        function setRelay(index, value) {
            status.relay[index].state = value;
            setStatus(status, index);
        }

        function setEnergy(index, value) {
            status.relay[index].energy = value;
            setStatus(status, index);
        }

        function setPower(index, value) {
            status.relay[index].power = value;
            setStatus(status, index);
        }

        function setStatus(status, index) {
            context.set("status", status);
            publishState(index);
        }

        function publishState(index) {
            if (channel === 2) {
                node.send({ paload: status.relay });
            } else {
                node.send({ paload: status.relay[index] });
            }
        }

        node.on("input", function (msg) {
            function getOutputPayload(msg, channel, state) {
                return utils.payloads.devices.addDevice(msg, {
                    topic: shelly.prefix + "/relay/" + channel + "/command",
                    state: utils.payloads.convertToOnOff(state),
                    target: "mqtt",
                    payloadGenerator: preparePayload
                });
            }

            function getNewState(channel) {
                if (config.state === "toggle") {
                    return status.relay[channel].state == "on" ? "off" : "on";
                }

                return config.state;
            }

            if (channel === 2) {
                msg = getOutputPayload(msg, 0, getNewState(0));
                msg = getOutputPayload(msg, 1, getNewState(1));
            } else {
                msg = getOutputPayload(msg, channel, getNewState(1));
            }

            node.send(utils.outputs.preapreOutputFor(this.wires.length - 1, msg));
        });

        function preparePayload(data) {
            if (data.state === undefined) {
                data.state = "off";
            }

            return data.state.toLowerCase();
        }

        node.on("close", function () {

        });
    }

    RED.nodes.registerType("shelly-25", createShelly25);
};