"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mqtt = __importStar(require("mqtt"));
const promises_1 = require("node:fs/promises");
async function main() {
    console.log("Connecting to MQTT broker...");
    const client = await mqtt.connectAsync("mqtt://192.168.0.129:1883");
    console.log("Connected!");
    console.log("Reading extension...");
    const extensionContent = await (0, promises_1.readFile)("./src/main.js", "utf8");
    console.log(extensionContent.length);
    console.log("Publishing extension...");
    client.subscribe("zigbee2mqtt/bridge/response/extension/save");
    client.on("message", (topic, message) => {
        if (topic === "zigbee2mqtt/bridge/response/extension/save") {
            const { error, status } = JSON.parse(message.toString());
            if (status === "error") {
                console.error("Error:", error);
            }
            else {
                console.log("Extension saved!");
            }
            client.end();
        }
    });
    client.publish("zigbee2mqtt/bridge/request/extension/save", JSON.stringify({
        name: "homie5",
        code: extensionContent,
    }), {
        qos: 2,
        retain: false,
    });
}
main();
