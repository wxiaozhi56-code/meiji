import { pgTable, serial, timestamp, varchar, text, integer, jsonb, index, boolean, numeric } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { createSchemaFactory } from "drizzle-zod"
import { z } from "zod"

// ==================== 用户系统表 ====================

// 门店表
export const stores = pgTable(
	"stores",
	{
		id: serial().primaryKey(),
		name: varchar("name", { length: 100 }).notNull(),
		owner_phone: varchar("owner_phone", { length: 20 }).notNull(),
		address: varchar("address", { length: 200 }),
		logo_url: varchar("logo_url", { length: 500 }),
		package_type: varchar("package_type", { length: 50 }).default('basic').notNull(), // basic, pro, enterprise
		expire_date: timestamp("expire_date", { withTimezone: true }),
		status: varchar("status", { length: 20 }).default('active').notNull(), // active, disabled
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("stores_owner_phone_idx").on(table.owner_phone),
		index("stores_status_idx").on(table.status),
	]
);

// 用户表
export const users = pgTable(
	"users",
	{
		id: serial().primaryKey(),
		store_id: integer("store_id").references(() => stores.id, { onDelete: "cascade" }),
		role: varchar("role", { length: 20 }).notNull(), // super_admin, store_owner, store_manager, beautician
		name: varchar("name", { length: 100 }).notNull(),
		phone: varchar("phone", { length: 20 }).notNull(),
		password_hash: varchar("password_hash", { length: 255 }).notNull(),
		status: varchar("status", { length: 20 }).default('active').notNull(), // active, disabled
		last_login_at: timestamp("last_login_at", { withTimezone: true }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("users_store_id_idx").on(table.store_id),
		index("users_phone_idx").on(table.phone),
		index("users_role_idx").on(table.role),
	]
);

// ==================== 系统表 ====================

// 系统表 - 禁止删除
export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// ==================== 客户相关表 ====================

// 客户表
export const customers = pgTable(
	"customers",
	{
		id: serial().primaryKey(),
		store_id: integer("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
		responsible_user_id: integer("responsible_user_id").references(() => users.id, { onDelete: "set null" }),
		name: varchar("name", { length: 100 }).notNull(),
		phone: varchar("phone", { length: 20 }),
		avatar: varchar("avatar", { length: 500 }),
		last_interaction_at: timestamp("last_interaction_at", { withTimezone: true }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("customers_store_id_idx").on(table.store_id),
		index("customers_responsible_user_id_idx").on(table.responsible_user_id),
		index("customers_last_interaction_at_idx").on(table.last_interaction_at),
	]
);

// 客户资料表
export const customerProfiles = pgTable(
	"customer_profiles",
	{
		id: serial().primaryKey(),
		customer_id: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
		field_name: varchar("field_name", { length: 50 }).notNull(),
		field_value: text("field_value"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("customer_profiles_customer_id_idx").on(table.customer_id),
	]
);

// 客户标签表
export const customerTags = pgTable(
	"customer_tags",
	{
		id: serial().primaryKey(),
		customer_id: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
		tag_name: varchar("tag_name", { length: 50 }).notNull(),
		category: varchar("category", { length: 50 }).notNull(), // 家庭动态、皮肤状况、抗衰需求等
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("customer_tags_customer_id_idx").on(table.customer_id),
		index("customer_tags_category_idx").on(table.category),
	]
);

// 跟进记录表
export const followUpRecords = pgTable(
	"follow_up_records",
	{
		id: serial().primaryKey(),
		store_id: integer("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
		customer_id: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
		user_id: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
		content: text("content").notNull(), // 语音转文字内容
		audio_url: varchar("audio_url", { length: 500 }), // 语音文件URL
		interaction_type: varchar("interaction_type", { length: 50 }), // 微信关怀、电话联系、到店服务等
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("follow_up_records_store_id_idx").on(table.store_id),
		index("follow_up_records_customer_id_idx").on(table.customer_id),
		index("follow_up_records_user_id_idx").on(table.user_id),
		index("follow_up_records_created_at_idx").on(table.created_at),
	]
);

// AI简报表
export const aiBriefs = pgTable(
	"ai_briefs",
	{
		id: serial().primaryKey(),
		customer_id: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
		summary: text("summary").notNull(), // 客户近况摘要
		suggestions: jsonb("suggestions").notNull(), // 跟进建议，JSON数组
		follow_up_record_id: integer("follow_up_record_id").references(() => followUpRecords.id, { onDelete: "set null" }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("ai_briefs_customer_id_idx").on(table.customer_id),
		index("ai_briefs_created_at_idx").on(table.created_at),
	]
);

// 生成的话术表
export const generatedMessages = pgTable(
	"generated_messages",
	{
		id: serial().primaryKey(),
		customer_id: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
		follow_up_record_id: integer("follow_up_record_id").references(() => followUpRecords.id, { onDelete: "set null" }),
		content: text("content").notNull(), // 话术内容
		type: varchar("type", { length: 50 }).notNull(), // 关怀型、价值型、活动型
		expires_at: timestamp("expires_at", { withTimezone: true }), // 过期时间
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("generated_messages_customer_id_idx").on(table.customer_id),
		index("generated_messages_follow_up_record_id_idx").on(table.follow_up_record_id),
		index("generated_messages_created_at_idx").on(table.created_at),
	]
);

// 深度分析报告表
export const analysisReports = pgTable(
	"analysis_reports",
	{
		id: serial().primaryKey(),
		customer_id: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
		consumption_rating: integer("consumption_rating"),
		consumption_potential: varchar("consumption_potential", { length: 20 }),
		lifecycle_stage: varchar("lifecycle_stage", { length: 50 }),
		ltv_estimate: integer("ltv_estimate"),
		emotional_state: text("emotional_state"),
		skin_condition: text("skin_condition"),
		life_events: text("life_events"),
		visit_frequency: varchar("visit_frequency", { length: 20 }),
		churn_risk: varchar("churn_risk", { length: 20 }),
		top_needs: jsonb("top_needs"),
		unmet_needs: jsonb("unmet_needs"),
		interests: jsonb("interests"),
		best_timing: text("best_timing"),
		best_channel: text("best_channel"),
		suggested_staff: text("suggested_staff"),
		communication_style: text("communication_style"),
		primary_recommendation: text("primary_recommendation"),
		secondary_recommendation: text("secondary_recommendation"),
		avoid_items: jsonb("avoid_items"),
		pitch_angle: text("pitch_angle"),
		discount_strategy: text("discount_strategy"),
		churn_alert: text("churn_alert"),
		complaint_alert: text("complaint_alert"),
		price_sensitivity: varchar("price_sensitivity", { length: 20 }),
		full_report: text("full_report"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("analysis_reports_customer_id_idx").on(table.customer_id),
		index("analysis_reports_created_at_idx").on(table.created_at),
	]
);

// ==================== Zod schemas for validation ====================

const { createInsertSchema: createCoercedInsertSchema } = createSchemaFactory({ coerce: { date: true } });

// Store schemas
export const insertStoreSchema = createCoercedInsertSchema(stores).pick({
	name: true,
	owner_phone: true,
	address: true,
	logo_url: true,
});

// User schemas
export const insertUserSchema = createCoercedInsertSchema(users).pick({
	store_id: true,
	role: true,
	name: true,
	phone: true,
	password_hash: true,
});

// Customer schemas
export const insertCustomerSchema = createCoercedInsertSchema(customers).pick({
	store_id: true,
	responsible_user_id: true,
	name: true,
	phone: true,
	avatar: true,
});

export const insertCustomerProfileSchema = createCoercedInsertSchema(customerProfiles).pick({
	customer_id: true,
	field_name: true,
	field_value: true,
});

export const insertCustomerTagSchema = createCoercedInsertSchema(customerTags).pick({
	customer_id: true,
	tag_name: true,
	category: true,
});

export const insertFollowUpRecordSchema = createCoercedInsertSchema(followUpRecords).pick({
	store_id: true,
	customer_id: true,
	user_id: true,
	content: true,
	audio_url: true,
	interaction_type: true,
});

export const insertAiBriefSchema = createCoercedInsertSchema(aiBriefs).pick({
	customer_id: true,
	summary: true,
	suggestions: true,
	follow_up_record_id: true,
});

export const insertGeneratedMessageSchema = createCoercedInsertSchema(generatedMessages).pick({
	customer_id: true,
	follow_up_record_id: true,
	content: true,
	type: true,
	expires_at: true,
});

// ==================== Type exports ====================

export type Store = typeof stores.$inferSelect;
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type CustomerProfile = typeof customerProfiles.$inferSelect;
export type InsertCustomerProfile = z.infer<typeof insertCustomerProfileSchema>;
export type CustomerTag = typeof customerTags.$inferSelect;
export type InsertCustomerTag = z.infer<typeof insertCustomerTagSchema>;
export type FollowUpRecord = typeof followUpRecords.$inferSelect;
export type InsertFollowUpRecord = z.infer<typeof insertFollowUpRecordSchema>;
export type AiBrief = typeof aiBriefs.$inferSelect;
export type InsertAiBrief = z.infer<typeof insertAiBriefSchema>;
export type GeneratedMessage = typeof generatedMessages.$inferSelect;
export type InsertGeneratedMessage = z.infer<typeof insertGeneratedMessageSchema>;
export type AnalysisReport = typeof analysisReports.$inferSelect;
