import type * as Settings from "zigbee2mqtt/dist/util/settings";
import type {
  Binary,
  Enum,
  Expose,
  Feature,
  Light,
  Numeric,
} from "zigbee-herdsman-converters";
import {
  DeviceDescription,
  EnumProperty,
  FloatProperty,
  IntegerProperty,
  NodeAttributes,
  Property,
} from "./homie-types";

type EnableDisableExtension = (enable: boolean, name: string) => Promise<void>;
type RestartCallback = () => Promise<void>;
type AddExtension = (extension: Extension) => Promise<void>;

const ACCESS_STATE = 0b001;
const ACCESS_SET = 0b010;

class Homie5 {
  private zigbee: Zigbee;
  private mqtt: MQTT;
  private state: State;
  private publishEntityState: PublishEntityState;
  private eventBus: EventBus;
  private enableDisableExtension: EnableDisableExtension;
  private restartCallback: RestartCallback;

  private settings: typeof Settings;

  constructor(
    zigbee: Zigbee,
    mqtt: MQTT,
    state: State,
    publishEntityState: PublishEntityState,
    eventBus: EventBus,
    enableDisableExtension: EnableDisableExtension,
    restartCallback: RestartCallback,
    _addExtension: AddExtension,
    settings: typeof Settings
  ) {
    this.zigbee = zigbee;
    this.mqtt = mqtt;
    this.state = state;
    this.publishEntityState = publishEntityState;
    this.eventBus = eventBus;
    this.enableDisableExtension = enableDisableExtension;
    this.restartCallback = restartCallback;
    this.settings = settings;
  }

  /**
   * Called when the extension starts (on Zigbee2MQTT startup, or when the extension is saved at runtime)
   */
  async start() {
    const zigbeeDevices = this.zigbee.devicesIterator();

    await this.mqtt.publish(
      "zigbee2mqtt-bridge/$state",
      "init",
      {
        retain: true,
        qos: 2,
      },
      "homie/5"
    );

    let deviceIds = new Set<string>();
    const devicesPromises = [];

    for (const zigbeeDevice of zigbeeDevices) {
      if (zigbeeDevice.definition == null || zigbeeDevice.zh.interviewing) {
        continue;
      }

      const description = this.descriptionFromZigbeeDevice(zigbeeDevice);

      if (!description) {
        continue;
      }

      description.root = "zigbee2mqtt-bridge";
      description.parent = "zigbee2mqtt-bridge";

      const deviceId = `z2m-${zigbeeDevice.ieeeAddr}`;

      // deviceIds.add(deviceId);

      // devicesPromises.push(
      //   new Promise<void>(async (resolve, reject) => {
      //     try {
      //       await this.mqtt.publish(
      //         `${deviceId}/$state`,
      //         "init",
      //         {
      //           retain: true,
      //           qos: 2,
      //         },
      //         "homie/5"
      //       );

      //       await this.mqtt.publish(
      //         `${deviceId}/$description`,
      //         JSON.stringify(description),
      //         {
      //           retain: true,
      //           qos: 2,
      //         },
      //         "homie/5"
      //       );

      //       await this.mqtt.publish(
      //         `${deviceId}/$state`,
      //         "ready",
      //         {
      //           retain: true,
      //           qos: 2,
      //         },
      //         "homie/5"
      //       );

      //       resolve();
      //     } catch (e) {
      //       reject(e);
      //     }
      //   })
      // );
    }

    // await Promise.allSettled(devicesPromises);

    await this.mqtt.publish(
      "zigbee2mqtt-bridge/$description",
      JSON.stringify({
        homie: "5.0",
        version: Date.now(),
        name: "Zigbee2MQTT Bridge",
        children: Array.from(deviceIds),
      }),
      {
        retain: true,
        qos: 2,
      },
      "homie/5"
    );

    await this.mqtt.publish(
      "zigbee2mqtt-bridge/$state",
      "ready",
      {
        retain: true,
        qos: 2,
      },
      "homie/5"
    );

    // All possible events can be seen here: https://github.com/Koenkk/zigbee2mqtt/blob/master/lib/eventBus.ts

    // Subscribe to MQTT messages
    this.eventBus.onMQTTMessage(this, this.onMqttMessage);
  }

  /**
   * Called when the extension stops (on Zigbee2MQTT shutdown, or when the extension is saved/removed at runtime)
   */
  async stop() {
    await this.mqtt.publish(
      "zigbee2mqtt-bridge/$state",
      "lost",
      {
        retain: true,
        qos: 2,
      },
      "homie/5"
    );

    this.eventBus.removeListeners(this);
  }

  onMqttMessage = (data) => {
    console.log(
      `Received MQTT message on topic '${data.topic}' with message '${data.message}'`
    );
  };

  private descriptionFromZigbeeDevice(device: Device): DeviceDescription {
    return {
      homie: "5.0",
      version: Date.now(), // FIXME
      name: device.name ?? device.ieeeAddr,
      nodes: Object.fromEntries(
        device
          .exposes()
          .map((expose) => [expose.name, this.zhcExposeToHomieNode(expose)])
          .filter(([, node]) => node !== null)
      ),
    };
  }

  private zhcExposeToHomieNode(expose: Expose): NodeAttributes | null {
    const name = expose.label ?? expose.name ?? expose.type;

    switch (expose.type) {
      case "light": {
        const lightExpose = expose as Light;

        return {
          name: lightExpose.label ?? lightExpose.name ?? lightExpose.type,
          properties: Object.fromEntries(
            expose.features?.map((feature) => [
              feature.name,
              this.zhcFeatureToHomieProperty(feature),
            ]) ?? []
          ),
        };
      }

      case "binary": {
        const { value_on, value_off } = expose as Binary;

        const format =
          value_on != null && value_off != null
            ? [value_on, value_off].join(",")
            : undefined;

        return {
          name,
          format,
          properties: Object.fromEntries(
            expose.features?.map((feature) => [
              feature.name,
              this.zhcFeatureToHomieProperty(feature),
            ]) ?? []
          ),
        };
      }
    }

    return {
      name,
      properties: Object.fromEntries(
        expose.features?.map((feature) => [
          feature.name,
          this.zhcFeatureToHomieProperty(feature),
        ]) ?? []
      ),
    };
  }

  private zhcFeatureToHomieProperty(feature: Feature): Property {
    const settable = Boolean(feature.access & ACCESS_SET);
    const name = feature.name;

    switch (feature.type) {
      case "text": {
        return {
          datatype: "string",
          name,
          settable,
          retained: true,
        };
      }

      case "binary":
      case "switch": {
        return {
          datatype: "boolean",
          name,
          settable,
          retained: true,
        };
      }

      case "numeric": {
        const numericFeature = feature as Numeric;

        const datatype =
          (numericFeature.value_step ?? 1) !== 1 ? "float" : "integer";

        return {
          datatype,
          name,
          settable,
          retained: true,
          step: numericFeature.value_step,
          min: numericFeature.value_min,
          max: numericFeature.value_max,
        } as IntegerProperty | FloatProperty;
      }

      case "enum": {
        const enumFeature = feature as Enum;

        return {
          datatype: "enum",
          format: enumFeature.values.join(","),
          name,
          settable,
          retained: true,
        } as EnumProperty;
      }
    }

    return {
      name: feature.name,
      datatype: "string",
      settable,
    };
  }

  adjustMessageBeforePublish(entity: Group | Device, message: KeyValue) {}
}

module.exports = Homie5;
