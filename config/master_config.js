import bcrypt from "bcrypt";

const trimStringFields = (data, fields) => {
  const trimmed = { ...data };
  for (const field of fields) {
    const { name, type } = field;
    if (type === "string" && trimmed[name] && typeof trimmed[name] === "string") {
      trimmed[name] = trimmed[name].trim();
      if (field.lowercase) trimmed[name] = trimmed[name].toLowerCase();
    }
  }
  return trimmed;
};

const master_configuration = () => ({
  gmaster: {
    table: "gmaster",
    fields: [{ name: "name", required: true, type: "string", unique: true, edit: 1 }],
    transform: async (data) => trimStringFields(data, master_configuration().gmaster.fields),
  },
  gmastervalue: {
    table: "gmastervalue",
    uniqueScope: ["gmaster_id"],
    fields: [
      { name: "gmaster_id", required: true, type: "number" },
      { name: "name", required: true, type: "string", unique: true, edit: 1 },
    ],
    transform: async (data) => trimStringFields(data, master_configuration().gmastervalue.fields),
  },
  design_master: {
    table: "design_master",
    fields: [
      { name: "design_code", required: true, type: "string", unique: true, edit: 1 },
      { name: "name", required: false, type: "string", unique: true, label: "design name", edit: 1 },
      { name: "design_details", required: false, type: "string" },
      { name: "status", required: false, type: "number" },
    ],
    transform: async (data) => trimStringFields(data, master_configuration().design_master.fields),
  },
  gst: {
    table: "gst",
    hardDelete: true,
    fields: [
      { name: "name", required: true, type: "string", unique: true, edit: 1 },
      { name: "tax", required: true, type: "number", edit: 1 },
      { name: "type", required: true, type: "string", enum: ["inclusive", "exclusive"], edit: 1 },
      { name: "status", required: false, type: "number" },
    ],
    transform: async (data) => {
      const allowed = ["inclusive", "exclusive"];
      if (data.type && !allowed.includes(data.type)) throw new Error("Invalid GST type");
      return trimStringFields(data, master_configuration().gst.fields);
    },
  },
  size: {
    table: "size_master",
    fields: [
      { name: "name", required: true, type: "string", unique: true, edit: 1 },
      { name: "status", required: false, type: "number" },
    ],
    transform: async (data) => trimStringFields(data, master_configuration().size.fields),
  },
  colors: {
    table: "color_master",
    fields: [
      { name: "name", required: true, type: "string", unique: true, edit: 1 },
      { name: "status", required: false, type: "number" },
    ],
    transform: async (data) => trimStringFields(data, master_configuration().colors.fields),
  },
  color: {
    table: "color_master",
    fields: [
      { name: "name", required: true, type: "string", unique: true, edit: 1 },
      { name: "status", required: false, type: "number" },
    ],
    transform: async (data) => trimStringFields(data, master_configuration().color.fields),
  },
  permissions: {
    table: "permissions",
    fields: [
      { name: "name", required: true, type: "string", unique: true, edit: 1 },
      { name: "status", required: false, type: "number" },
    ],
    transform: async (data) => trimStringFields(data, master_configuration().permissions.fields),
  },
  roles: {
    table: "roles",
    fields: [
      { name: "name", required: true, type: "string", unique: true, edit: 1 },
      { name: "status", required: false, type: "number" },
    ],
    transform: async (data) => trimStringFields(data, master_configuration().roles.fields),
  },
  sidebar: {
    table: "sidebar",
    fields: [
      { name: "name", required: true, type: "string", unique: true, edit: 1 },
      { name: "icon", required: true, type: "string", unique: true, edit: 1 },
      { name: "path", required: true, type: "string", unique: true, edit: 1 },
      { name: "parent_permission", required: false, type: "number" },
      { name: "permission", required: true, type: "number" },
      { name: "status", required: false, type: "number" },
    ],
    transform: async (data) => trimStringFields(data, master_configuration().sidebar.fields),
  },
  users: {
    table: "users",
    fields: [
      { name: "username", required: true, type: "string", unique: true, edit: 1, lowercase: true },
      { name: "password", required: true, type: "string", edit: 1 },
      { name: "name", required: false, type: "string", edit: 1 },
      { name: "email", required: false, type: "string", unique: true, edit: 1 },
      { name: "mobileno", required: false, type: "string", unique: true, edit: 1 },
      { name: "role_id", required: true, type: "number", edit: 1 },
      { name: "status", required: false, type: "number" },
    ],
    transform: async (data) => {
      data = trimStringFields(data, master_configuration().users.fields);
      if (data.password) data.password = await bcrypt.hash(data.password, 10);
      return data;
    },
  },
});

const ALLOWED_TABLES = [
  "gmaster", "gmastervalue", "design_master", "gst", "size", "color", "colors", "permissions", "roles", "sidebar", "users",
];

export { master_configuration, ALLOWED_TABLES };
