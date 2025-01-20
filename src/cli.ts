#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import * as mqtt from "mqtt";
import { readFile } from "node:fs/promises";

yargs(hideBin(process.argv))
  .command(
    "deploy [mqttUrl]",
    "deploy extension via mqtt",
    (yargs) => {
      return yargs
        .positional("mqttUrl", {
          describe: "mqtt url (e.g. mqtt://localhost:1883)",
          default: "mqtt://localhost:1883",
        })
        .option("basetopic", {
          alias: "t",
          describe: "zigbee2mqtt base topic",
          default: "zigbee2mqtt",
        })
        .option("username", {
          alias: "u",
          describe: "mqtt username",
        })
        .option("password", {
          alias: "p",
          describe: "mqtt password",
        });
    },
    deploy
  )
  .demandCommand(1)
  .strict()
  .help("h")
  .parse();

async function deploy(argv: {
  mqttUrl: string;
  basetopic: string;
  username?: string;
  password?: string;
}) {
  console.log(`Connecting to MQTT broker at ${argv.mqttUrl} ...`);

  const client = await mqtt.connectAsync(argv.mqttUrl, {
    username: argv.username,
    password: argv.password,
  });

  console.log("Connected!");

  console.log("Publishing extension...");

  const extensionContent = await readFile("./main.js", "utf8");

  client.subscribe(`${argv.basetopic}/bridge/response/extension/save`);

  client.on("message", (topic, message) => {
    if (topic === `${argv.basetopic}/bridge/response/extension/save`) {
      const { error, status } = JSON.parse(message.toString());

      if (status === "error") {
        console.error("Error:", error);
      } else {
        console.log("Extension succesfully accepted by zigbee2mqtt!");
      }

      client.end();
    }
  });

  await client.publish(
    `${argv.basetopic}/bridge/request/extension/save`,
    JSON.stringify({
      name: "homie5",
      code: extensionContent,
    }),
    {
      qos: 2,
      retain: false,
    }
  );
}
