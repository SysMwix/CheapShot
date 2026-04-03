/**
 * Master category/subcategory config.
 * Each subcategory optionally maps to a size preference key and provides
 * AI search hints so Claude knows which specialist retailers to check.
 */

export interface Subcategory {
  value: string;
  label: string;
  sizeKey?: string;       // maps to SizePreferences key — null means no size applies
  searchHint?: string;    // extra context for the AI search prompt
}

export interface Category {
  slug: string;
  label: string;
  icon: string;           // emoji for nav
  subcategories: Subcategory[];
}

export const CATEGORIES: Category[] = [
  {
    slug: "motorbike",
    label: "Motorbike Gear",
    icon: "\uD83C\uDFCD\uFE0F",
    subcategories: [
      { value: "helmet", label: "Helmet", sizeKey: "helmetSize", searchHint: "motorcycle helmet retailers like SportsBikeShop, J&S Accessories, Helmet City" },
      { value: "gloves", label: "Gloves", sizeKey: "gloveSize", searchHint: "motorcycle glove retailers" },
      { value: "jacket", label: "Jacket", sizeKey: "jacketSize", searchHint: "motorcycle jacket retailers, textile and leather" },
      { value: "leatherSuit", label: "Leather Suit / One-Piece", sizeKey: "leatherSuitSize", searchHint: "motorcycle leather suit retailers" },
      { value: "trousers", label: "Trousers / Jeans", sizeKey: "waist", searchHint: "motorcycle trousers and riding jeans retailers" },
      { value: "boots", label: "Boots", sizeKey: "bootSize", searchHint: "motorcycle boot retailers" },
      { value: "backProtector", label: "Back Protector", sizeKey: "backProtectorSize", searchHint: "motorcycle back protector and armour retailers" },
      { value: "kneeSliders", label: "Knee Sliders", sizeKey: "kneeSliderSize", searchHint: "motorcycle knee slider retailers" },
      { value: "baseLayer", label: "Base Layer", sizeKey: "tShirtSize", searchHint: "motorcycle base layer and thermal retailers" },
      { value: "visor", label: "Visor / Shield", searchHint: "motorcycle visor and helmet shield retailers" },
      { value: "accessories", label: "Other Accessories", searchHint: "motorcycle accessories retailers" },
    ],
  },
  {
    slug: "clothing",
    label: "Clothing",
    icon: "\uD83D\uDC55",
    subcategories: [
      { value: "tshirt", label: "T-Shirt / Top", sizeKey: "tShirtSize", searchHint: "clothing retailers" },
      { value: "jacket", label: "Jacket / Coat", sizeKey: "jacketSize", searchHint: "jacket and outerwear retailers" },
      { value: "jeans", label: "Jeans", sizeKey: "jeansSize", searchHint: "jeans and denim retailers" },
      { value: "trousers", label: "Trousers", sizeKey: "waist", searchHint: "trousers retailers" },
      { value: "shoes", label: "Shoes / Trainers", sizeKey: "shoeSize", searchHint: "shoe and trainer retailers" },
      { value: "boots", label: "Boots", sizeKey: "bootSize", searchHint: "boot retailers" },
      { value: "hoodie", label: "Hoodie / Jumper", sizeKey: "tShirtSize", searchHint: "hoodie and knitwear retailers" },
      { value: "other", label: "Other Clothing", searchHint: "clothing retailers" },
    ],
  },
  {
    slug: "tech",
    label: "Tech & Electronics",
    icon: "\uD83D\uDCBB",
    subcategories: [
      { value: "phone", label: "Phone", searchHint: "phone and mobile retailers like Amazon, Currys, Argos" },
      { value: "laptop", label: "Laptop / PC", searchHint: "laptop and computer retailers like Currys, Scan, Overclockers" },
      { value: "headphones", label: "Headphones / Audio", searchHint: "headphone and audio retailers" },
      { value: "camera", label: "Camera / Photography", searchHint: "camera and photography retailers like Wex, Park Cameras" },
      { value: "tv", label: "TV / Monitor", searchHint: "TV and monitor retailers" },
      { value: "accessories", label: "Cables / Accessories", searchHint: "tech accessories retailers" },
      { value: "other", label: "Other Tech", searchHint: "electronics retailers" },
    ],
  },
  {
    slug: "home",
    label: "Home & Garden",
    icon: "\uD83C\uDFE0",
    subcategories: [
      { value: "furniture", label: "Furniture", searchHint: "furniture retailers like IKEA, Wayfair, Dunelm" },
      { value: "appliances", label: "Appliances", searchHint: "home appliance retailers like Currys, AO, John Lewis" },
      { value: "tools", label: "Tools / DIY", searchHint: "tool and DIY retailers like Screwfix, Toolstation, B&Q" },
      { value: "garden", label: "Garden", searchHint: "garden and outdoor retailers" },
      { value: "kitchen", label: "Kitchen", searchHint: "kitchenware retailers" },
      { value: "other", label: "Other Home", searchHint: "home retailers" },
    ],
  },
  {
    slug: "sports",
    label: "Sports & Fitness",
    icon: "\u26BD",
    subcategories: [
      { value: "gym", label: "Gym Equipment", searchHint: "gym and fitness equipment retailers" },
      { value: "runningShoes", label: "Running Shoes", sizeKey: "shoeSize", searchHint: "running shoe retailers like SportsShoes, Wiggle" },
      { value: "cycling", label: "Cycling", searchHint: "cycling retailers like Wiggle, Chain Reaction Cycles, Halfords" },
      { value: "camping", label: "Camping / Outdoor", searchHint: "camping and outdoor retailers like Go Outdoors, Cotswold" },
      { value: "sportswear", label: "Sportswear", sizeKey: "tShirtSize", searchHint: "sportswear retailers like Sports Direct, Nike, Adidas" },
      { value: "other", label: "Other Sports", searchHint: "sports retailers" },
    ],
  },
  {
    slug: "beauty",
    label: "Beauty & Health",
    icon: "\u2728",
    subcategories: [
      { value: "skincare", label: "Skincare", searchHint: "skincare retailers like Boots, Superdrug, LookFantastic" },
      { value: "supplements", label: "Supplements", searchHint: "supplement retailers like MyProtein, Holland & Barrett" },
      { value: "grooming", label: "Grooming", searchHint: "grooming and personal care retailers" },
      { value: "fragrance", label: "Fragrance", searchHint: "perfume and fragrance retailers like The Fragrance Shop, Notino" },
      { value: "other", label: "Other Beauty", searchHint: "health and beauty retailers" },
    ],
  },
  {
    slug: "gaming",
    label: "Gaming",
    icon: "\uD83C\uDFAE",
    subcategories: [
      { value: "console", label: "Console", searchHint: "gaming console retailers like GAME, Argos, Currys, ShopTo" },
      { value: "games", label: "Games", searchHint: "video game retailers like GAME, CDKeys, ShopTo" },
      { value: "peripherals", label: "Peripherals", searchHint: "gaming peripheral retailers like Overclockers, Scan" },
      { value: "pcParts", label: "PC Parts", searchHint: "PC component retailers like Scan, Overclockers, CCL" },
      { value: "other", label: "Other Gaming", searchHint: "gaming retailers" },
    ],
  },
  {
    slug: "auto",
    label: "Auto & Car",
    icon: "\uD83D\uDE97",
    subcategories: [
      { value: "parts", label: "Parts", searchHint: "car parts retailers like Euro Car Parts, GSF, Autodoc" },
      { value: "accessories", label: "Accessories", searchHint: "car accessories retailers like Halfords" },
      { value: "cleaning", label: "Cleaning / Detailing", searchHint: "car cleaning and detailing retailers" },
      { value: "tools", label: "Tools", searchHint: "automotive tool retailers" },
      { value: "other", label: "Other Auto", searchHint: "automotive retailers" },
    ],
  },
  {
    slug: "misc",
    label: "Misc / Other",
    icon: "\uD83D\uDCE6",
    subcategories: [
      { value: "other", label: "General", searchHint: "online retailers" },
    ],
  },
];

/** Find a category by slug */
export function getCategoryBySlug(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

/** Find a subcategory across all categories */
export function findSubcategory(categorySlug: string, subcategoryValue: string): Subcategory | undefined {
  const cat = getCategoryBySlug(categorySlug);
  return cat?.subcategories.find((s) => s.value === subcategoryValue);
}

/** Get all category slugs */
export function getCategorySlugs(): string[] {
  return CATEGORIES.map((c) => c.slug);
}
