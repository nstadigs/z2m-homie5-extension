import * as mqtt from "mqtt";
import { readFile } from "node:fs/promises";

async function main() {
  console.log("Connecting to MQTT broker...");
  const client = await mqtt.connectAsync("mqtt://192.168.0.129:1883");
  console.log("Connected!");
  console.log("Reading extension...");
  const extensionContent = await readFile("./src/main.js", "utf8");
  console.log(extensionContent.length);
  console.log("Publishing extension...");

  client.subscribe("zigbee2mqtt/bridge/response/extension/save");

  client.on("message", (topic, message) => {
    if (topic === "zigbee2mqtt/bridge/response/extension/save") {
      const { error, status } = JSON.parse(message.toString());

      if (status === "error") {
        console.error("Error:", error);
      } else {
        console.log("Extension saved!");
      }

      client.end();
    }
  });

  client.publish(
    "zigbee2mqtt/bridge/request/extension/save",
    JSON.stringify({
      name: "homie5",
      code: extensionContent,
    }),
    {
      qos: 2,
      retain: true,
    }
  );
}

main();
