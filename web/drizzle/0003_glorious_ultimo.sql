CREATE INDEX `cooking_steps_recipe_id_idx` ON `cooking_steps` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `household_members_user_id_idx` ON `household_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `meal_plan_entries_iteration_id_idx` ON `meal_plan_entries` (`iteration_id`);--> statement-breakpoint
CREATE INDEX `plan_iterations_meal_plan_id_idx` ON `plan_iterations` (`meal_plan_id`);--> statement-breakpoint
CREATE INDEX `recipe_ingredients_recipe_id_idx` ON `recipe_ingredients` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `recipes_household_id_idx` ON `recipes` (`household_id`);--> statement-breakpoint
CREATE INDEX `shopping_list_items_shopping_list_id_idx` ON `shopping_list_items` (`shopping_list_id`);--> statement-breakpoint
CREATE INDEX `step_ingredients_step_id_idx` ON `step_ingredients` (`step_id`);