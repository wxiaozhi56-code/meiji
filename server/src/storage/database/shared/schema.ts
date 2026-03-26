import { pgTable, serial, timestamp, varchar, text, integer, jsonb, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { createSchemaFactory } from "drizzle-zod"
import { z } from "zod"

// 系统表 - 禁止删除
export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 客户表
export const customers = pgTable(
	"customers",
	{
		id: serial().primaryKey(),
		name: varchar("name", { length: 100 }).notNull(),
		phone: varchar("phone", { length: 20 }),
		avatar: varchar("avatar", { length: 500 }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }),
	},
	(table) => [
		index("customers_created_at_idx").on(table.created_at),
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
		customer_id: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
		content: text("content").notNull(), // 语音转文字内容
		audio_url: varchar("audio_url", { length: 500 }), // 语音文件URL
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("follow_up_records_customer_id_idx").on(table.customer_id),
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
		brief_id: integer("brief_id").notNull().references(() => aiBriefs.id, { onDelete: "cascade" }),
		content: text("content").notNull(), // 话术内容
		type: varchar("type", { length: 50 }).notNull(), // 关怀型、价值型等
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("generated_messages_customer_id_idx").on(table.customer_id),
		index("generated_messages_brief_id_idx").on(table.brief_id),
		index("generated_messages_created_at_idx").on(table.created_at),
	]
);

// Zod schemas for validation
const { createInsertSchema: createCoercedInsertSchema } = createSchemaFactory({ coerce: { date: true } });

export const insertCustomerSchema = createCoercedInsertSchema(customers).pick({ name: true, phone: true, avatar: true });
export const insertCustomerTagSchema = createCoercedInsertSchema(customerTags).pick({ customer_id: true, tag_name: true, category: true });
export const insertFollowUpRecordSchema = createCoercedInsertSchema(followUpRecords).pick({ customer_id: true, content: true, audio_url: true });
export const insertAiBriefSchema = createCoercedInsertSchema(aiBriefs).pick({ customer_id: true, summary: true, suggestions: true });
export const insertGeneratedMessageSchema = createCoercedInsertSchema(generatedMessages).pick({ customer_id: true, brief_id: true, content: true, type: true });

// Type exports
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type CustomerTag = typeof customerTags.$inferSelect;
export type InsertCustomerTag = z.infer<typeof insertCustomerTagSchema>;
export type FollowUpRecord = typeof followUpRecords.$inferSelect;
export type InsertFollowUpRecord = z.infer<typeof insertFollowUpRecordSchema>;
export type AiBrief = typeof aiBriefs.$inferSelect;
export type InsertAiBrief = z.infer<typeof insertAiBriefSchema>;
export type GeneratedMessage = typeof generatedMessages.$inferSelect;
export type InsertGeneratedMessage = z.infer<typeof insertGeneratedMessageSchema>;
