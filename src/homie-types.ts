export type DeviceState =
  /**
   * This is the state the device is in when it is connected to the MQTT broker,
   * but has not yet sent all Homie messages and is not yet ready to operate.
   * This state is optional and may be sent if the device takes a long time to initialize,
   * but wishes to announce to consumers that it is coming online.
   * A device may fall back into this state to do some reconfiguration.
   */
  | "init"
  /**
   * This is the state the device is in when it is connected to the MQTT broker
   * and has sent all Homie messages describing the device attributes, nodes, properties,
   * and their values. The device has subscribed to all appropriate /set topics and is
   * ready to receive messages.
   */
  | "ready"
  /**
   * This is the state the device is in when it is cleanly disconnected from the MQTT broker.
   * You must send this message before cleanly disconnecting.
   */
  | "disconnected"
  /**
   * This is the state the device is in when the device is sleeping. You have to send this
   * message before sleeping.
   */
  | "sleeping"
  /**
   * This is the state the device is in when the device has been “badly” disconnected.
   * Important: If a root-device $state is "lost" then the state of every child device in its tree is also "lost".
   * You must define this message as the last will (LWT) for root devices.
   */
  | "lost";

export type DeviceAttributes = {
  $state: DeviceState;
  $description: DeviceDescription;
  $log: string;
};

/** Comments are taken from the spec */
export type DeviceDescription = {
  /**
   * The implemented Homie convention version, without the “patch” level.
   * So the format is "5.x", where the 'x' is the minor version.
   */
  homie: `${number}.${number}`;

  /**
   * The version of the description document. Whenever the document changes,
   * a new version must be assigned. This does not need to be sequential,
   * eg. a timestamp or a random number could be used.
   */
  version: number;

  /**
   * The Nodes the device exposes. An object containing the Nodes,
   * indexed by their ID. Defaults to an empty object.
   */
  nodes?: Record<string, NodeAttributes>; // TODO

  /** Friendly name of the device. Defaults to the ID of the device. */
  name?: string;

  /** Type of Device. Please ensure proper namespacing to prevent naming collisions. */
  type?: string;

  /** Array of ID’s of child devices. Defaults to an empty array. */
  children?: string[];

  /**
   * ID of the root parent device. Required if the device is NOT the root device,
   * MUST be omitted otherwise.
   */
  root?: string;

  /**
   * ID of the parent device. Required if the parent is NOT the root device.
   * Defaults to the value of the root property.
   */
  parent?: string;

  /** Array of supported extensions. Defaults to an empty array. */
  extensions?: string[];
};

export type NodeAttributes = {
  /** Friendly name of the Node. Defaults to the ID of the node. */
  name?: string;

  /** Type of Node. Please ensure proper namespacing to prevent naming collisions. */
  type?: string;

  /**
   * The Properties the Node exposes. An object containing the Properties,
   * indexed by their ID. Defaults to an empty object.
   */
  properties: Record<string, Property>;
};

export type PropertyBase = {
  /** Friendly name of the Property. Defaults to the ID of the property. */
  name?: string;

  /** The data type. */
  datatype: string;

  /** Specifies restrictions or options for the given data type. */
  format?: string;

  /** Whether the Property is settable. */
  settable?: boolean;

  /** Whether the Property is retained. */
  retained?: boolean;

  /** The unit of the property. */
  // deno-lint-ignore ban-types
  unit?: RecommendedUnit | (string & {});
};

export type StringProperty = PropertyBase & {
  datatype: "string";
};

type NumberFormat = Exclude<
  `${number | ""}:${number | ""}${`:${number}` | ""}`,
  "::" | ":::"
>;

export type FloatProperty = PropertyBase & {
  datatype: "float";

  /**
   * [min]:[max][:step] where min and max are the respective minimum
   * and maximum (inclusive) allowed values, both represented in the
   * format for float types. Eg. 10.123:15.123. If the minimum and/or
   * maximum are missing from the format, then they are open-ended,
   * so 0: allows a value >= 0.
   * The optional step determines the step size, eg. 2:6:2 will allow
   * values 2, 4, and 6. It must be greater than 0. The base for
   * calculating a proper value based on step should be min, max, or
   * the current property value (in that order). The implementation
   * should round property values to the nearest step (which can be
   * outside the min/max range). The min/max validation must be done
   * after rounding.
   */
  format?: NumberFormat;
};

export type IntegerProperty = PropertyBase & {
  datatype: "integer";

  /**
   * [min]:[max][:step] where min and max are the respective
   * minimum and maximum (inclusive) allowed values, both represented
   * in the format for integer types. Eg. 5:35. If the minimum and/or
   * maximum are missing from the format, then they are open-ended,
   * so :10 allows a value <= 10.
   * The optional step determines the step size, eg. 2:6:2 will allow
   * values 2, 4, and 6. It must be greater than 0. The base for
   * calculating a proper value based on step should be min, max, or
   * the current property value (in that order). The implementation
   * should round property values to the nearest step (which can be
   * outside the min/max range). The min/max validation must be done
   * after rounding.
   */
  format?: NumberFormat;
};

type NonEmptyString<T extends string> = "" extends T ? never : T;

export type EnumProperty = PropertyBase & {
  datatype: "enum";

  /**
   * A comma-separated list of non-quoted values. Eg. value1,value2,value3.
   * Leading- and trailing whitespace is significant. Individual values
   * can not be an empty string, hence at least 1 value must be specified
   * in the format. Duplicates are not allowed.
   */
  format: `${NonEmptyString<string>}${`,${string}` | ""}${`,${string}` | ""}`;
};

export type ColorFormat = "rgb" | "hsv" | "xyz";

export type ColorProperty = PropertyBase & {
  datatype: "color";

  /**
   * A comma-separated list of color formats supported; rgb, hsv, and/or xyz.
   * The formats should be listed in order of preference (most preferred first,
   * least preferred last). See the color type for the resulting value formats.
   * E.g. a device supporting RGB and HSV, where RGB is preferred, would have
   * its format set to "rgb,hsv".
   */
  format: `${ColorFormat}${`,${ColorFormat}` | ""}${`,${ColorFormat}` | ""}`;
};

export type BooleanProperty = PropertyBase & {
  datatype: "boolean";

  /**
   * Identical to an enum with 2 entries. The first represents the false value
   * and the second is the true value. Eg. close,open or off,on. If provided,
   * then both entries must be specified. Important: the format does NOT specify
   * valid payloads, they are descriptions of the valid payloads false and true.
   */
  format?: `${string},${string}`;
};

export type DateTimeProperty = PropertyBase & {
  datatype: "datetime";

  /**
   * A string representing a date and time in the ISO 8601 format.
   * The format is: YYYY-MM-DDTHH:MM:SSZ. Eg. 2017-08-13T14:15:16Z.
   */
  format: `${number}-${number}-${number}T${number}:${number}:${number}Z`;
};

export type DurationProperty = PropertyBase & {
  datatype: "duration";

  /**
   * Duration payloads must use the ISO 8601 duration format
   *
   * The format is PTxHxMxS, where:
   *  P: Indicates a period/duration (required).
   *  T: Indicates a time (required).
   *  xH: Hours, where x represents the number of hours (optional).
   *  xM: Minutes, where x represents the number of minutes (optional).
   *  xS: Seconds, where x represents the number of seconds (optional).
   *
   * Examples: PT12H5M46S (12 hours, 5 minutes, 46 seconds), PT5M (5 minutes)
   *
   * An empty string ("") is not a valid payload
   */
  format: `PT${`${number}H` | ""}${`${number}M` | ""}${`${number}S` | "" | ""}`;
};

export type JSONProperty = PropertyBase & {
  datatype: "json";

  /**
   * A JSONschema definition, which is added as a string (escaped), NOT as a nested json-object.
   * See JSON considerations, for some ideas wrt compatibility. If a client fails to parse/compile
   * the JSONschema, then it should ignore the given schema and fall back to the default schema.
   */
  format?: string;
};

export type RecommendedUnit =
  /** Degree Celsius (see ‘Degree’ for encoding) */
  | "°C"
  /** Degree Fahrenheit (see ‘Degree’ for encoding) */
  | "°F"
  /**
   * Degree
   * Character ‘°’ is Unicode: U+00B0, Hex: 0xc2 0xb0, Dec: 194 176
   */
  | "°"
  /** Liter */
  | "L"
  /** Gallon */
  | "gal"
  /** Volts */
  | "V"
  /** Watt */
  | "W"
  /** Kilowatt */
  | "kW"
  /** Kilowatt-hour */
  | "kWh"
  /** Ampere */
  | "A"
  /** Hertz */
  | "Hz"
  /** Revolutions per minute */
  | "rpm"
  /** Percent */
  | "%"
  /** Meter */
  | "m"
  /**
   * Cubic meter
   * Character ‘³’ is Unicode: U+00B3, Hex: 0xc2 0xb3, Dec: 194 179
   */
  | "m³"
  /** Feet */
  | "ft"
  /** Meters per Second */
  | "m/s"
  /** Knots */
  | "kn"
  /** Pascal */
  | "Pa"
  /** PSI */
  | "psi"
  /** Parts Per Million */
  | "ppm"
  /** Seconds */
  | "s"
  /** Minutes */
  | "min"
  /** Hours */
  | "h"
  /** Lux */
  | "lx"
  /** Kelvin */
  | "K"
  /**
   * Mired
   * Character ‘⁻’ is Unicode: U+207B, Hex: 0xe2 0x81 0xbb, Dec: 226 129 187
   * Character ‘¹’ is Unicode: U+00B9, Hex: 0xc2 0xb9, Dec: 194 185
   */
  | "MK⁻¹"
  /** Count or Amount */
  | "#";

export type Property =
  | StringProperty
  | FloatProperty
  | IntegerProperty
  | EnumProperty
  | ColorProperty
  | BooleanProperty
  | DateTimeProperty
  | DurationProperty
  | JSONProperty;
