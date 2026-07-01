PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_meal_plan_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`iteration_id` text NOT NULL,
	`date` text NOT NULL,
	`meal_type` text NOT NULL,
	`recipe_id` text NOT NULL,
	`servings` integer NOT NULL,
	`is_leftover` integer DEFAULT false NOT NULL,
	`source_entry_id` text,
	`is_locked` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`iteration_id`) REFERENCES `plan_iterations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_entry_id`) REFERENCES `meal_plan_entries`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_meal_plan_entries`("id", "iteration_id", "date", "meal_type", "recipe_id", "servings", "is_leftover", "source_entry_id", "is_locked") SELECT "id", "iteration_id", "date", "meal_type", "recipe_id", "servings", "is_leftover", "source_entry_id", "is_locked" FROM `meal_plan_entries`;--> statement-breakpoint
DROP TABLE `meal_plan_entries`;--> statement-breakpoint
ALTER TABLE `__new_meal_plan_entries` RENAME TO `meal_plan_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_units` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_de` text NOT NULL,
	`name_en` text NOT NULL,
	`abbreviation` text NOT NULL,
	`base_unit_id` integer,
	`conversion_factor` text DEFAULT '1' NOT NULL,
	FOREIGN KEY (`base_unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_units`("id", "name_de", "name_en", "abbreviation", "base_unit_id", "conversion_factor") SELECT "id", "name_de", "name_en", "abbreviation", "base_unit_id", "conversion_factor" FROM `units`;--> statement-breakpoint
DROP TABLE `units`;--> statement-breakpoint
ALTER TABLE `__new_units` RENAME TO `units`;