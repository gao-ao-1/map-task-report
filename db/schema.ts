import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  usernameKey: text("username_key").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  role: text("role").notNull(),
  disabled: integer("disabled").notNull().default(0),
  createdAt: text("created_at").notNull(),
});
export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => accounts.id),
  authVersion: text("auth_version").notNull().default(""),
  expiresAt: integer("expires_at").notNull(),
});
export const authLimits = sqliteTable("auth_limits", {
  key: text("key").primaryKey(),
  hits: integer("hits").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
export const members = sqliteTable("members", {
  email: text("email").primaryKey(),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
});
export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull().unique(),
  county: text("county").notNull(),
  countyName: text("county_name").notNull(),
  client: text("client").notNull(),
  contact: text("contact").notNull(),
  phone: text("phone").notNull(),
  owner: text("owner").notNull(),
  status: text("status").notNull(),
  due: text("due").notNull(),
  type: text("type").notNull(),
  notes: text("notes").notNull(),
  creatorId: text("creator_id").notNull().default(""),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  revision: integer("revision").notNull().default(1),
});
export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  reportId: text("report_id")
    .notNull()
    .references(() => reports.id),
  filename: text("filename").notNull(),
  size: integer("size").notNull(),
  mime: text("mime").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});
