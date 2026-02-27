export const queryKeys = {
  recipes: ["recipes"] as const,
  recipe: (id: string) => ["recipes", id] as const,
  tags: ["tags"] as const,
  mealPlans: ["meal-plans"] as const,
  mealPlan: (id: string) => ["meal-plans", id] as const,
  shoppingLists: ["shopping-lists"] as const,
  shoppingList: (id: string) => ["shopping-lists", id] as const,
  households: ["households"] as const,
  ingredients: ["ingredients"] as const,
  units: ["units"] as const,
  tokens: ["tokens"] as const,
};
