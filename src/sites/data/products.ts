// What each industry sells (spec §10.4 "product nouns"), for company websites' Products pages. Keyed by industry id.
// Websites are generated from these every time, so entries can be added or reworded freely.

const p = (s: string) => s.split('|');

export const PRODUCT_KINDS: Record<string, readonly string[]> = {
  software: p('Office Suite|Accounting Package|Database Server|Antivirus|Web Server|Groupware|Screen Saver Pack|Y2K Compliance Kit|Payroll System|Spreadsheet'),
  semiconductors: p('Microprocessor|Memory Chip|Graphics Chip|Modem Chipset|Flash Card|DSP Controller|Sound Chip|Wafer Stepper'),
  hardware: p('Desktop PC|Laptop|Inkjet Printer|Zip Drive|CRT Monitor|Network Router|Scanner|Mouse|Tape Backup Drive|Keyboard'),
  internet: p('Web Portal|Free E-mail|Search Engine|Chat Room|Web Hosting Plan|Online Auction|Home Page Builder|Banner Ad Network'),
  telecom: p('Mobile Phone|Pager|Long Distance Plan|Calling Card|ISDN Line|Fax Service|Voicemail|Cordless Phone'),
  banks: p('Savings Account|Home Mortgage|Car Loan|Certificate of Deposit|Checking Account|Business Loan|Safe Deposit Box|Credit Line'),
  insurance: p('Term Life Policy|Home Insurance|Auto Policy|Flood Cover|Annuity|Pet Insurance|Umbrella Policy|Travel Cover'),
  assetManagement: p('Growth Fund|Income Fund|Money Market Fund|Index Fund|Retirement Account|Bond Fund|Discount Brokerage|College Savings Plan'),
  payments: p('Credit Card|Gold Card|Wire Transfer|Traveller’s Cheques|Merchant Terminal|Money Order|Prepaid Card|Rewards Programme'),
  pharma: p('Headache Tablets|Cough Syrup|Antacid|Allergy Relief|Cholesterol Pill|Vitamin Pack|Sleep Aid|Antibiotic'),
  biotech: p('Monoclonal Antibody|Gene Therapy|Vaccine Candidate|Diagnostic Assay|Protein Therapy|Clinical Trial Programme|DNA Test Kit'),
  medicalDevices: p('Pacemaker|MRI Scanner|Hip Implant|Blood Glucose Meter|X-Ray Machine|Surgical Stapler|Hearing Aid|Dental Drill'),
  healthServices: p('Health Plan|Walk-in Clinic|Pharmacy Service|Lab Test|Home Nursing|Dental Plan|Vision Plan|Wellness Programme'),
  oilGas: p('Crude Oil|Natural Gas|Heating Oil|Drilling Rig Service|Pipeline Capacity|Offshore Platform|Seismic Survey'),
  refining: p('Unleaded Gasoline|Diesel Fuel|Jet Fuel|Motor Oil|Asphalt|Propane|Lubricant|Kerosene'),
  utilities: p('Electricity|Natural Gas Service|Water Service|Energy Audit|Budget Billing Plan|Street Lighting|Power Line'),
  renewables: p('Solar Panel|Wind Turbine|Fuel Cell|Biodiesel|Hydro Turbine|Heat Pump|Battery Pack|Solar Water Heater'),
  mining: p('Copper Cathode|Iron Ore Pellets|Nickel Briquettes|Aluminium Ingots|Zinc Concentrate|Thermal Coal|Mining Service'),
  preciousMetals: p('Gold Bullion|Silver Bars|Platinum Coins|Gold Doré|Commemorative Coin|Silver Rounds|Streaming Agreement'),
  chemicals: p('Industrial Solvent|Plastic Resin|Fertiliser|House Paint|Adhesive|Industrial Gas|Detergent Base|Pool Chlorine'),
  steel: p('Steel Coil|Rebar|I-Beam|Stainless Sheet|Steel Pipe|Wire Rod|Tool Steel|Galvanised Sheet'),
  logging: p('Premium 2x4 Lumber|Pine Plywood|Cedar Shingles|Hardwood Flooring|Wood Pulp|Fence Posts|Oak Planks|Firewood Bundle'),
  paper: p('Copier Paper|Corrugated Box|Paper Towel|Tissue Roll|Kraft Bag|Label Stock|Milk Carton|Envelope'),
  agriculture: p('Hybrid Seed Corn|Soybean Meal|Combine Harvester|Tractor|Fertiliser Blend|Grain Storage|Feed Pellets|Irrigation System'),
  foodBeverage: p('Breakfast Cereal|Cola|Potato Chips|Chocolate Bar|Frozen Dinner|Lager|Ketchup|Instant Noodles|Laundry Soap|Yoghurt'),
  tobacco: p('Filter Cigarettes|Menthol Cigarettes|Cigars|Pipe Tobacco|Rolling Tobacco|Cigarillos|Lighter|Ashtray'),
  retail: p('Gift Card|Home Delivery|Store Card|Weekly Circular|Garden Centre|Catalogue|Bargain Bin|Layaway Plan'),
  apparel: p('Denim Jeans|Sneakers|Handbag|Wristwatch|Polo Shirt|Windbreaker|Leather Belt|Silk Scarf'),
  restaurants: p('Double Burger|Family Pizza|Chicken Bucket|Espresso|Kids’ Meal|Steak Dinner|Breakfast Platter|Milkshake'),
  autos: p('Family Sedan|Minivan|Sport Utility Vehicle|Pickup Truck|Coupe|Motorcycle|All-Season Tyre|Car Battery'),
  airlines: p('Economy Fare|Business Class|Frequent Flyer Miles|Air Cargo Service|Holiday Package|Shuttle Service|Airport Lounge'),
  aerospace: p('Jet Airliner|Fighter Jet|Jet Engine|Satellite|Radar System|Helicopter|Guided Missile|Avionics Suite'),
  shipping: p('Container Service|Overnight Parcel|Freight Truckload|Tanker Charter|Warehouse Space|Customs Brokerage|Dry Bulk Charter'),
  railroads: p('Intermodal Service|Coal Train|Grain Hopper|Boxcar Lease|Passenger Ticket|Tank Car|Automobile Rack'),
  construction: p('Starter Home|Ready-Mix Concrete|Bulldozer|Roof Shingles|Cement Bags|Bridge Contract|Excavator|Drywall'),
  realEstate: p('Office Tower Lease|Shopping Mall Space|Apartment Rental|Warehouse Lease|Self Storage Unit|Condominium|Parking Garage'),
  media: p('Blockbuster Movie|Evening Newscast|Paperback Novel|Music CD|Cable Channel|Daily Newspaper|Talk Show|Film Soundtrack'),
  videoGames: p('Console Game|PC CD-ROM|Arcade Cabinet|Handheld Game|Game Controller|Strategy Guide|Memory Card|Shareware Disk'),
  hotels: p('Hotel Room|Casino Resort|Cruise Package|Theme Park Ticket|Timeshare|Honeymoon Suite|Ski Holiday|Conference Centre'),
  conglomerate: p('Industrial Turbine|Light Bulb|Refrigerator|Jet Engine Lease|Consumer Loan|Television Network|Locomotive|Medical Scanner'),
};

/** Model names: "{brand} {line} {kind}" or "{kind} {model}". */
export const PRODUCT_LINES = p('Pro|Plus|Max|Deluxe|Gold|Classic|Ultra|Supreme|Elite|Express|Select|Premier|Advantage|Value|Home|Family|Xtreme|Platinum|Heritage|Original');
export const PRODUCT_MODELS = p('98|2000|XL|II|3000|Mk IV|Turbo|SE|GT|LX|Millennium|X-400|Z|One');
