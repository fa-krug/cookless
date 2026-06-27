export interface SeedUnit {
  abbreviation: string;
  nameEn: string;
  nameDe: string;
  baseUnitAbbr: string | null;
  conversionFactor: string;
}

export interface SeedIngredient {
  nameEn: string;
  nameDe: string;
  category: string;
}

export const SEED_UNITS: SeedUnit[] = [
  {
    abbreviation: "g",
    nameDe: "Gramm",
    nameEn: "gram",
    baseUnitAbbr: null,
    conversionFactor: "1",
  },
  {
    abbreviation: "kg",
    nameDe: "Kilogramm",
    nameEn: "kilogram",
    baseUnitAbbr: "g",
    conversionFactor: "1000",
  },
  {
    abbreviation: "ml",
    nameDe: "Milliliter",
    nameEn: "milliliter",
    baseUnitAbbr: null,
    conversionFactor: "1",
  },
  {
    abbreviation: "l",
    nameDe: "Liter",
    nameEn: "liter",
    baseUnitAbbr: "ml",
    conversionFactor: "1000",
  },
  {
    abbreviation: "Stk",
    nameDe: "Stück",
    nameEn: "piece",
    baseUnitAbbr: null,
    conversionFactor: "1",
  },
  {
    abbreviation: "EL",
    nameDe: "Esslöffel",
    nameEn: "tablespoon",
    baseUnitAbbr: null,
    conversionFactor: "1",
  },
  {
    abbreviation: "TL",
    nameDe: "Teelöffel",
    nameEn: "teaspoon",
    baseUnitAbbr: null,
    conversionFactor: "1",
  },
  {
    abbreviation: "Prise",
    nameDe: "Prise",
    nameEn: "pinch",
    baseUnitAbbr: null,
    conversionFactor: "1",
  },
];

export const SEED_INGREDIENTS: SeedIngredient[] = [
  // PRODUCE
  { nameEn: "onion", nameDe: "Zwiebel", category: "PRODUCE" },
  { nameEn: "garlic", nameDe: "Knoblauch", category: "PRODUCE" },
  { nameEn: "tomato", nameDe: "Tomate", category: "PRODUCE" },
  { nameEn: "potato", nameDe: "Kartoffel", category: "PRODUCE" },
  { nameEn: "carrot", nameDe: "Karotte", category: "PRODUCE" },
  { nameEn: "bell pepper", nameDe: "Paprika", category: "PRODUCE" },
  { nameEn: "zucchini", nameDe: "Zucchini", category: "PRODUCE" },
  { nameEn: "broccoli", nameDe: "Brokkoli", category: "PRODUCE" },
  { nameEn: "spinach", nameDe: "Spinat", category: "PRODUCE" },
  { nameEn: "mushroom", nameDe: "Champignon", category: "PRODUCE" },
  { nameEn: "lemon", nameDe: "Zitrone", category: "PRODUCE" },
  { nameEn: "ginger", nameDe: "Ingwer", category: "PRODUCE" },
  { nameEn: "cucumber", nameDe: "Gurke", category: "PRODUCE" },
  { nameEn: "lettuce", nameDe: "Salat", category: "PRODUCE" },
  { nameEn: "avocado", nameDe: "Avocado", category: "PRODUCE" },
  { nameEn: "sweet potato", nameDe: "Süßkartoffel", category: "PRODUCE" },
  { nameEn: "celery", nameDe: "Sellerie", category: "PRODUCE" },
  { nameEn: "leek", nameDe: "Lauch", category: "PRODUCE" },
  { nameEn: "cauliflower", nameDe: "Blumenkohl", category: "PRODUCE" },
  { nameEn: "eggplant", nameDe: "Aubergine", category: "PRODUCE" },
  { nameEn: "fresh basil", nameDe: "Frisches Basilikum", category: "PRODUCE" },
  { nameEn: "fresh parsley", nameDe: "Frische Petersilie", category: "PRODUCE" },
  { nameEn: "cherry tomato", nameDe: "Kirschtomate", category: "PRODUCE" },
  { nameEn: "green beans", nameDe: "Grüne Bohnen", category: "PRODUCE" },
  { nameEn: "corn", nameDe: "Mais", category: "PRODUCE" },
  // DAIRY
  { nameEn: "butter", nameDe: "Butter", category: "DAIRY" },
  { nameEn: "cream", nameDe: "Sahne", category: "DAIRY" },
  { nameEn: "milk", nameDe: "Milch", category: "DAIRY" },
  { nameEn: "parmesan", nameDe: "Parmesan", category: "DAIRY" },
  { nameEn: "mozzarella", nameDe: "Mozzarella", category: "DAIRY" },
  { nameEn: "cream cheese", nameDe: "Frischkäse", category: "DAIRY" },
  { nameEn: "yogurt", nameDe: "Joghurt", category: "DAIRY" },
  { nameEn: "egg", nameDe: "Ei", category: "DAIRY" },
  { nameEn: "cheddar", nameDe: "Cheddar", category: "DAIRY" },
  { nameEn: "feta", nameDe: "Feta", category: "DAIRY" },
  { nameEn: "gouda", nameDe: "Gouda", category: "DAIRY" },
  // MEAT
  { nameEn: "chicken breast", nameDe: "Hähnchenbrust", category: "MEAT" },
  { nameEn: "ground beef", nameDe: "Rinderhackfleisch", category: "MEAT" },
  { nameEn: "salmon fillet", nameDe: "Lachsfilet", category: "MEAT" },
  { nameEn: "bacon", nameDe: "Speck", category: "MEAT" },
  { nameEn: "sausage", nameDe: "Wurst", category: "MEAT" },
  { nameEn: "pork tenderloin", nameDe: "Schweinefilet", category: "MEAT" },
  { nameEn: "shrimp", nameDe: "Garnelen", category: "MEAT" },
  { nameEn: "turkey breast", nameDe: "Putenbrust", category: "MEAT" },
  { nameEn: "tuna", nameDe: "Thunfisch", category: "MEAT" },
  // PANTRY
  { nameEn: "olive oil", nameDe: "Olivenöl", category: "PANTRY" },
  { nameEn: "salt", nameDe: "Salz", category: "PANTRY" },
  { nameEn: "black pepper", nameDe: "Schwarzer Pfeffer", category: "PANTRY" },
  { nameEn: "spaghetti", nameDe: "Spaghetti", category: "PANTRY" },
  { nameEn: "rice", nameDe: "Reis", category: "PANTRY" },
  { nameEn: "flour", nameDe: "Mehl", category: "PANTRY" },
  { nameEn: "sugar", nameDe: "Zucker", category: "PANTRY" },
  { nameEn: "soy sauce", nameDe: "Sojasauce", category: "PANTRY" },
  { nameEn: "tomato paste", nameDe: "Tomatenmark", category: "PANTRY" },
  { nameEn: "canned tomatoes", nameDe: "Dosentomaten", category: "PANTRY" },
  { nameEn: "vegetable broth", nameDe: "Gemüsebrühe", category: "PANTRY" },
  { nameEn: "paprika powder", nameDe: "Paprikapulver", category: "PANTRY" },
  { nameEn: "cumin", nameDe: "Kreuzkümmel", category: "PANTRY" },
  { nameEn: "oregano", nameDe: "Oregano", category: "PANTRY" },
  { nameEn: "chili flakes", nameDe: "Chiliflocken", category: "PANTRY" },
  { nameEn: "honey", nameDe: "Honig", category: "PANTRY" },
  { nameEn: "vinegar", nameDe: "Essig", category: "PANTRY" },
  { nameEn: "penne", nameDe: "Penne", category: "PANTRY" },
  { nameEn: "coconut milk", nameDe: "Kokosmilch", category: "PANTRY" },
  { nameEn: "curry powder", nameDe: "Currypulver", category: "PANTRY" },
  { nameEn: "mustard", nameDe: "Senf", category: "PANTRY" },
  { nameEn: "balsamic vinegar", nameDe: "Balsamico-Essig", category: "PANTRY" },
  { nameEn: "tortilla wraps", nameDe: "Tortilla-Wraps", category: "PANTRY" },
  { nameEn: "peanut butter", nameDe: "Erdnussbutter", category: "PANTRY" },
  { nameEn: "sesame oil", nameDe: "Sesamöl", category: "PANTRY" },
  { nameEn: "bread crumbs", nameDe: "Semmelbrösel", category: "PANTRY" },
  { nameEn: "red lentils", nameDe: "Rote Linsen", category: "PANTRY" },
  { nameEn: "chickpeas", nameDe: "Kichererbsen", category: "PANTRY" },
  { nameEn: "kidney beans", nameDe: "Kidneybohnen", category: "PANTRY" },
  { nameEn: "noodles", nameDe: "Nudeln", category: "PANTRY" },
  { nameEn: "pesto", nameDe: "Pesto", category: "PANTRY" },
  { nameEn: "white wine", nameDe: "Weißwein", category: "PANTRY" },
  { nameEn: "pine nuts", nameDe: "Pinienkerne", category: "PANTRY" },
  { nameEn: "walnuts", nameDe: "Walnüsse", category: "PANTRY" },
  // FROZEN
  { nameEn: "frozen peas", nameDe: "Tiefkühlerbsen", category: "FROZEN" },
  { nameEn: "frozen pizza dough", nameDe: "Tiefkühl-Pizzateig", category: "FROZEN" },
];
