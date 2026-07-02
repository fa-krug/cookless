// Default recipe tags, keyed by category (English, German label pairs).
export const DEFAULT_TAGS: Record<string, [string, string][]> = {
  DIETARY: [
    ["Vegan", "Vegan"],
    ["Vegetarian", "Vegetarisch"],
    ["Kosher", "Koscher"],
    ["Halal", "Halal"],
    ["Gluten-Free", "Glutenfrei"],
    ["Dairy-Free", "Laktosefrei"],
    ["Low-Carb", "Low-Carb"],
    ["Nut-Free", "Nussfrei"],
    ["Whole30", "Whole30"],
    ["Paleo", "Paleo"],
  ],
  PROTEIN: [
    ["Pork", "Schwein"],
    ["Beef", "Rind"],
    ["Chicken", "Hähnchen"],
    ["Duck", "Ente"],
    ["Turkey", "Truthahn"],
    ["Fish", "Fisch"],
    ["Seafood", "Meeresfrüchte"],
    ["Tofu", "Tofu"],
    ["Egg", "Ei"],
  ],
  CUISINE: [
    ["Italian", "Italienisch"],
    ["Asian", "Asiatisch"],
    ["Mexican", "Mexikanisch"],
    ["Indian", "Indisch"],
    ["Mediterranean", "Mediterran"],
    ["German", "Deutsch"],
    ["American", "Amerikanisch"],
    ["French", "Französisch"],
    ["Middle Eastern", "Nahöstlich"],
    ["Thai", "Thailändisch"],
  ],
  MEAL_TYPE: [
    ["Quick Weeknight", "Schnelles Abendessen"],
    ["One-Pot", "Eintopf"],
    ["Meal-Prep", "Meal-Prep"],
    ["Comfort Food", "Comfort Food"],
    ["Simple", "Einfach"],
    ["Elaborate", "Aufwändig"],
    ["Grilling", "Grillen"],
    ["Salad", "Salat"],
  ],
};

export const DEFAULT_TAG_COUNT = Object.values(DEFAULT_TAGS).reduce(
  (sum, list) => sum + list.length,
  0,
);
