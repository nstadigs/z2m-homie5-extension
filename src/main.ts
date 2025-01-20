import type * as Settings from "zigbee2mqtt/dist/util/settings.js";
import type {
  Binary,
  Composite,
  Enum,
  Expose,
  Feature,
  Light,
  Numeric,
  Option,
} from "zigbee-herdsman-converters";
import {
  DeviceDescription,
  EnumProperty,
  FloatProperty,
  IntegerProperty,
  NodeAttributes,
  Property,
} from "./homie-types.js";

type EnableDisableExtension = (enable: boolean, name: string) => Promise<void>;
type RestartCallback = () => Promise<void>;
type AddExtension = (extension: Extension) => Promise<void>;

const ACCESS_STATE = 0b001;
const ACCESS_SET = 0b010;

class Homie5 {
  #zigbee: Zigbee;
  #mqtt: MQTT;
  #state: State;
  #publishEntityState: PublishEntityState;
  #eventBus: EventBus;
  #enableDisableExtension: EnableDisableExtension;
  #restartCallback: RestartCallback;
  #settings: typeof Settings;

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
    this.#zigbee = zigbee;
    this.#mqtt = mqtt;
    this.#state = state;
    this.#publishEntityState = publishEntityState;
    this.#eventBus = eventBus;
    this.#enableDisableExtension = enableDisableExtension;
    this.#restartCallback = restartCallback;
    this.#settings = settings;
  }

  /**
   * Called when the extension starts (on Zigbee2MQTT startup, or when the extension is saved at runtime)
   */
  async start() {
    const zigbeeDevices = this.#zigbee.devicesIterator();

    await this.#mqtt.publish(
      "zigbee2mqtt-bridge/$state",
      "init",
      {
        retain: true,
        qos: 2,
      },
      "homie/5"
    );

    let deviceIds = new Set<string>();

    try {
      for (const zigbeeDevice of zigbeeDevices) {
        if (zigbeeDevice.definition == null || zigbeeDevice?.zh.interviewing) {
          continue;
        }

        const description = this.#descriptionFromZigbeeDevice(zigbeeDevice);

        if (!description) {
          continue;
        }

        description.root = "zigbee2mqtt-bridge";
        description.parent = "zigbee2mqtt-bridge";

        const deviceId = `z2m-${zigbeeDevice.ieeeAddr}`;

        deviceIds.add(deviceId);

        await this.#mqtt.publish(
          `${deviceId}/$state`,
          "init",
          {
            retain: true,
            qos: 2,
          },
          "homie/5"
        );

        await this.#mqtt.publish(
          `${deviceId}/$description`,
          JSON.stringify(description),
          {
            retain: true,
            qos: 2,
          },
          "homie/5"
        );

        const deviceState = this.#state.get(zigbeeDevice);

        this.#mqtt.publish(
          deviceId,
          JSON.stringify(deviceState),
          {
            retain: false,
            qos: 0,
          },
          "test/state"
        );

        for (const [nodeId, node] of Object.entries(description.nodes ?? {})) {
          for (const [propertyId, property] of Object.entries(
            node.properties
          )) {
            const value = deviceState[propertyId];

            if (value != null) {
              const retain = Boolean(property.retained);

              const req = this.#mqtt.publish(
                `${deviceId}/${nodeId}/${propertyId}`,
                value,
                {
                  qos: retain ? 2 : 0,
                  retain,
                },
                "homie/5"
              );

              if (retain) {
                await req;
              }
            }
          }
        }

        await this.#mqtt.publish(
          `${deviceId}/$state`,
          "ready",
          {
            retain: true,
            qos: 2,
          },
          "homie/5",
          false,
          false
        );
      }

      this.#mqtt.publish(
        "no-err",
        "cool",
        {
          retain: false,
          qos: 0,
        },
        "debug",
        false,
        false
      );
    } catch (error) {
      if (error instanceof Error) {
        this.#mqtt.publish(
          "error",
          error.message,
          {
            retain: false,
            qos: 0,
          },
          "debug",
          false,
          false
        );
      }
    }

    await this.#mqtt.publish(
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
      "homie/5",
      false,
      false
    );

    await this.#mqtt.publish(
      "zigbee2mqtt-bridge/$state",
      "ready",
      {
        retain: true,
        qos: 2,
      },
      "homie/5",
      false,
      false
    );

    // All possible events can be seen here: https://github.com/Koenkk/zigbee2mqtt/blob/master/lib/eventBus.ts

    // Subscribe to MQTT messages
    this.#eventBus.onMQTTMessage(this, this.#handleMqttMessage);
    this.#eventBus.onStateChange(this, this.#handleStateChange);
  }

  /**
   * Called when the extension stops (on Zigbee2MQTT shutdown, or when the extension is saved/removed at runtime)
   */
  async stop() {
    await this.#mqtt.publish(
      "zigbee2mqtt-bridge/$state",
      "lost",
      {
        retain: true,
        qos: 2,
      },
      "homie/5"
    );

    this.#eventBus.removeListeners(this);
  }

  #handleMqttMessage = ({ topic, message }: eventdata.MQTTMessage) => {
    const [, homieVersion, homieDeviceId, _nodeId, propertyId, attr] =
      topic.split("/");

    if (homieVersion !== "5" || !homieDeviceId.startsWith("z2m-")) {
      return;
    }

    const zigbeeDeviceId = homieDeviceId.slice(4);
    const entity = this.#zigbee.resolveEntity(zigbeeDeviceId);

    if (entity == null) {
      return;
    }

    // TODO: Handle groups
    if (!entity.isDevice() || attr !== "set") {
      return;
    }

    const exposeOfProperty = entity
      .exposes()
      .find((expose) => expose.name === propertyId);

    if (exposeOfProperty == null) {
      return;
    }

    const value = JSON.parse(message.toString());

    // if (entity) {
    //   this.publishEntityState
    // }
  };

  #handleStateChange = ({ entity, update, toState }: eventdata.StateChange) => {
    // TODO: Handle groups
    if (!entity.isDevice()) {
      return;
    }

    const homieDeviceId = `z2m-${entity.ieeeAddr}`;
  };

  #descriptionFromZigbeeDevice(device: Device): DeviceDescription {
    const flatExposes = this.#flattenExposes(device.exposes());
    const specificConfigExposes = device.definition?.options;

    const primaryPropertyEntries =
      this.#getPropertiesFromExposesByCategory(flatExposes);

    const specificConfigProperties = this.#getPropertiesFromExposesByCategory(
      specificConfigExposes ?? []
    );

    const configProperties = this.#getPropertiesFromExposesByCategory(
      flatExposes,
      "config"
    );

    const diagnosticProperties = this.#getPropertiesFromExposesByCategory(
      flatExposes,
      "diagnostic"
    );

    const nodeEntries: [string, NodeAttributes][] = [];

    if (primaryPropertyEntries.length > 0) {
      nodeEntries.push([
        "primary",
        {
          name: "Primary",
          properties: Object.fromEntries(primaryPropertyEntries),
        },
      ]);
    }

    if (specificConfigProperties.length > 0 || configProperties.length > 0) {
      nodeEntries.push([
        "config",
        {
          name: "Configuration",
          properties: Object.fromEntries([
            ...specificConfigProperties,
            ...configProperties,
          ]),
        },
      ]);
    }

    if (diagnosticProperties.length > 0) {
      nodeEntries.push([
        "diagnostic",
        {
          name: "Diagnostics",
          properties: Object.fromEntries(diagnosticProperties),
        },
      ]);
    }

    return {
      homie: "5.0",
      version: Date.now(), // TODO: Generate deterministic version
      name: device.name ?? device.ieeeAddr,
      nodes: Object.fromEntries(nodeEntries),
    };
  }

  #getPropertiesFromExposesByCategory(
    exposes: Array<Expose | Option>,
    category?: string
  ) {
    const filteredExposes = exposes.filter(
      (expose) => expose.category === category
    );

    return this.#zhcExposesToHomiePropertyEntries(filteredExposes);
  }

  #flattenExposes(
    exposes: Iterable<Expose>,
    _labelPrefix: string | undefined = ""
  ): Expose[] {
    const result = [];

    for (const expose of exposes) {
      if (expose.features != null) {
        result.push(
          ...this.#flattenExposes(
            expose.features,
            expose.label != null ? `${expose.label}: ` : ""
          )
        );
      } else {
        result.push({
          ...expose,
          label: _labelPrefix + expose.label,
        } as Expose);
      }
    }

    return result;
  }

  #zhcExposesToHomiePropertyEntries(exposes: Expose[]) {
    const result: [string, Property][] = [];

    for (const expose of exposes) {
      const settable = Boolean(expose.access & ACCESS_SET);
      const retained = Boolean(expose.access & ACCESS_STATE);
      const name = expose.label ?? expose.name;

      switch (expose.type) {
        case "text": {
          result.push([
            expose.name,
            {
              datatype: "string",
              name,
              settable,
              retained,
            },
          ]);

          break;
        }

        case "binary":
        case "switch": {
          const { value_on, value_off } = expose as Binary;

          const format =
            value_on != null && value_off != null
              ? (`${value_on},${value_off}` as const)
              : undefined;

          result.push([
            expose.name,
            {
              datatype: "boolean",
              name,
              settable,
              retained: true,
              format,
            },
          ]);

          break;
        }

        case "numeric": {
          const numericFeature = expose as Numeric;

          const datatype =
            (numericFeature.value_step ?? 1) !== 1 ? "float" : "integer";

          result.push([
            expose.name,
            {
              datatype,
              name,
              settable,
              retained: true,
              step: numericFeature.value_step,
              min: numericFeature.value_min,
              max: numericFeature.value_max,
            } as IntegerProperty | FloatProperty,
          ]);

          break;
        }

        case "enum": {
          const enumFeature = expose as Enum;

          result.push([
            expose.name,
            {
              datatype: "enum",
              format: enumFeature.values.join(","),
              name,
              settable,
              retained: true,
            } as EnumProperty,
          ]);

          break;
        }

        default: {
          result.push([
            expose.name,
            {
              name,
              datatype: "string",
              settable,
              retained,
            },
          ]);
        }
      }
    }

    return result;
  }

  adjustMessageBeforePublish(entity: Group | Device, message: KeyValue) {}
}

/**
 * Since we're targeting node18 (es2022) iterator helpers are
 * not available on Iterator
 *
 * @param iter
 * @param predicate
 */
function* filterIterable<T>(
  iter: Iterable<T>,
  predicate: (value: T) => boolean
): Iterable<T> {
  for (const value of iter) {
    if (predicate(value)) {
      yield value;
    }
  }
}

/**
 * Since we're targeting node18 (es2022) iterator helpers are
 * not available on Iterator
 *
 * @param iter
 * @param predicate
 */
function* mapIterable<T, R>(
  iter: Iterable<T>,
  mapper: (value: T) => R
): Iterable<R> {
  for (const value of iter) {
    yield mapper(value);
  }
}

module.exports = Homie5;
